// Runs the external tools YAS depends on: yt-dlp to fetch from YouTube and
// ffmpeg to convert to mp3. Processes are always spawned with an argument
// array (never a shell) and only ever receive a validated video id.
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { envInt } from './env.js'
import { YasError } from './errors.js'
import { videoUrl } from './video-id.js'

const STDERR_TAIL_CHARS = 4000
const MAX_INFO_BYTES = 32 * 1024 * 1024
const INFO_TIMEOUT_MS = 60 * 1000
// yt-dlp's exit code when --break-match-filters rejects a video.
const REJECTED_BY_FILTER = 101
// Download progress, one line per update on stderr (stdout carries the audio).
const PROGRESS_PREFIX = '[yas-progress] '
const PROGRESS_ARGS = [
  '--progress',
  '--newline',
  '--progress-template',
  `download:${PROGRESS_PREFIX}%(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s`
]

const TOOL_ENV = { 'yt-dlp': 'YTDLP_PATH', ffmpeg: 'FFMPEG_PATH' }
const toolPath = name => process.env[TOOL_ENV[name]] || name

// Ignore config files on the host, only allow YouTube extractors and never
// expand playlists. The source is either a URL built here, placed after `--`
// so it can't be read as an option, or an info JSON yt-dlp wrote earlier.
function ytdlpArgs (id, extra, { infoFile } = {}) {
  const args = [
    '--ignore-config',
    '--use-extractors', 'youtube',
    '--no-playlist',
    '--no-warnings',
    '--quiet'
  ]
  if (process.env.YTDLP_JS_RUNTIMES) {
    args.push('--js-runtimes', process.env.YTDLP_JS_RUNTIMES)
  }
  const maxDuration = envInt('YAS_MAX_DURATION', 0)
  if (maxDuration) {
    args.push('--break-match-filters', `!is_live & duration <= ${maxDuration}`)
  }
  const source = infoFile ? ['--load-info-json', infoFile] : ['--', videoUrl(id)]
  return [...args, ...extra, ...source]
}

function missingTool (name, cause) {
  return new YasError(`${name} is not installed or not in PATH (set ${TOOL_ENV[name]} to its location)`, {
    code: 'MISSING_TOOL',
    cause
  })
}

function start (name, args, stdin = 'ignore') {
  const child = spawn(toolPath(name), args, {
    stdio: [stdin, 'pipe', 'pipe'],
    windowsHide: true
  })

  // Progress lines become 'progress' events; everything else is kept (the
  // tail) to explain failures.
  let stderr = ''
  let partial = ''
  const addLine = line => {
    if (line.startsWith(PROGRESS_PREFIX)) {
      child.emit('progress', parseProgress(line.slice(PROGRESS_PREFIX.length)))
      return
    }
    stderr = (stderr + line + '\n').slice(-STDERR_TAIL_CHARS)
  }
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    const lines = (partial + chunk).split('\n')
    partial = lines.pop()
    lines.forEach(addLine)
  })

  child.done = new Promise((resolve, reject) => {
    child.on('error', error => reject(error.code === 'ENOENT' ? missingTool(name, error) : error))
    child.on('close', (code, signal) => {
      if (partial) addLine(partial)
      resolve({ code, signal, stderr })
    })
  })

  return child
}

// yt-dlp prints "NA" (or "None") for unknown values.
function parseProgress (line) {
  const [downloaded, total, estimate, speed, eta] = line.trim().split(' ').map(value => {
    const number = Number(value)
    return Number.isFinite(number) ? number : null
  })
  return { downloaded: downloaded ?? 0, total: total ?? estimate, speed, eta }
}

function isRunning (child) {
  return child.exitCode === null && child.signalCode === null
}

function lastLine (text) {
  return text.trim().split('\n').filter(Boolean).pop() || ''
}

function ytdlpError ({ code, signal, stderr }) {
  if (code === REJECTED_BY_FILTER) {
    return new YasError('Video is too long or a live stream', { status: 422, code: 'NOT_ALLOWED' })
  }

  const cause = new Error(lastLine(stderr) || `yt-dlp exited with ${code ?? signal}`)
  const unavailable = /Video unavailable|Private video|is not available|Sign in to confirm your age|members-only/i
  if (unavailable.test(stderr)) {
    return new YasError('Video unavailable', { status: 404, code: 'UNAVAILABLE', cause })
  }
  const error = new YasError('Could not fetch audio from YouTube', { status: 502, code: 'UPSTREAM', cause })
  // YouTube intermittently refuses stream URLs; a fresh extraction usually works.
  error.retryable = /HTTP Error 403/.test(stderr)
  return error
}

function ffmpegError ({ code, signal, stderr }) {
  return new YasError('Could not convert audio', {
    code: 'TRANSCODE',
    cause: new Error(lastLine(stderr) || `ffmpeg exited with ${code ?? signal}`)
  })
}

function timeoutError (what) {
  return new YasError(`Timed out while ${what}`, { status: 504, code: 'TIMEOUT' })
}

function metadataError (cause) {
  return new YasError('Could not read video metadata', { status: 502, code: 'UPSTREAM', cause })
}

// Returns yt-dlp's JSON description of a video (title, uploader, thumbnails...).
export async function getVideoInfo (id) {
  let stdout
  try {
    ({ stdout } = await promisify(execFile)(toolPath('yt-dlp'), ytdlpArgs(id, ['--dump-single-json', '--skip-download']), {
      timeout: INFO_TIMEOUT_MS,
      maxBuffer: MAX_INFO_BYTES,
      windowsHide: true
    }))
  } catch (error) {
    if (error.code === 'ENOENT') throw missingTool('yt-dlp', error)
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      throw metadataError(new Error(`yt-dlp output exceeded ${MAX_INFO_BYTES} bytes`))
    }
    if (error.killed) throw timeoutError('reading video metadata')
    if (typeof error.code === 'number') throw ytdlpError({ code: error.code, stderr: error.stderr })
    throw metadataError(error)
  }

  try {
    return JSON.parse(stdout)
  } catch (error) {
    throw metadataError(error)
  }
}

// Pipes the best audio stream from yt-dlp into ffmpeg, which writes mp3 to
// `output` (a file path, or `pipe:1` for stdout). Extra inputs (cover art) and
// output arguments (maps, metadata) are appended for the metadata download.
// With `infoFile`, yt-dlp reuses info from getVideoInfo instead of extracting
// the video again. `onProgress` receives { downloaded, total, speed, eta }
// (bytes, bytes/s, seconds; null when unknown) as yt-dlp downloads.
//
// Returns ffmpeg's stdout, a `done` promise that rejects with a YasError when
// either tool fails, and `kill` to stop both processes (e.g. when a client
// disconnects). A killed job resolves `done` instead of rejecting.
export function transcode (id, { output = 'pipe:1', inputs = [], outputArgs = [], infoFile, timeout = 0, onProgress } = {}) {
  const ytdlp = start('yt-dlp', ytdlpArgs(id, ['--format', 'bestaudio/best', '--output', '-', ...PROGRESS_ARGS], { infoFile }))
  if (onProgress) ytdlp.on('progress', onProgress)
  const ffmpeg = start('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', 'pipe:0',
    ...inputs.flatMap(input => ['-i', input]),
    '-map', '0:a:0',
    ...outputArgs,
    '-codec:a', 'libmp3lame',
    '-q:a', '2',
    '-f', 'mp3',
    '-y',
    output
  ], 'pipe')

  // ffmpeg may exit before reading all input; its exit code reports why.
  ffmpeg.stdin.on('error', () => {})
  let received = 0
  ytdlp.stdout.on('data', chunk => { received += chunk.length })
  ytdlp.stdout.pipe(ffmpeg.stdin)

  const stopAll = () => {
    for (const child of [ytdlp, ffmpeg]) {
      if (isRunning(child)) child.kill()
    }
  }

  // Once one process fails, the other is stopped and usually exits with an
  // error of its own: yt-dlp gets a broken pipe when ffmpeg dies, and ffmpeg
  // fails when yt-dlp's output ends early. So only the first to exit with an
  // error is reported. 'exit' fires before 'close' (which waits for the
  // process's pipes), so it reflects the real order.
  let failure = null
  let stopped = false
  let timedOut = false
  const watch = (name, child) => {
    child.once('exit', code => {
      if (code === 0 || failure || stopped || timedOut) return
      failure = name
      stopAll()
    })
    child.done.catch(() => {
      failure ??= name
      stopAll()
    })
  }
  watch('yt-dlp', ytdlp)
  watch('ffmpeg', ffmpeg)

  const timer = timeout > 0
    ? setTimeout(() => {
      timedOut = true
      stopAll()
    }, timeout)
    : null

  const done = Promise.all([ytdlp.done, ffmpeg.done])
    .then(([ytdlpResult, ffmpegResult]) => {
      if (timedOut) throw timeoutError('fetching audio')
      // Exits that happen together can be seen in either order. A broken pipe
      // from yt-dlp while ffmpeg failed by itself (not stopped by us) means
      // ffmpeg went first.
      const ffmpegFailedAlone = ffmpegResult.code !== 0 && !ffmpegResult.signal
      if (failure === 'yt-dlp' && ffmpegFailedAlone && /Broken pipe|EPIPE/i.test(ytdlpResult.stderr)) {
        failure = 'ffmpeg'
      }
      if (failure === 'yt-dlp') throw ytdlpError(ytdlpResult)
      // yt-dlp succeeding without sending anything also makes ffmpeg fail.
      if (!stopped && received === 0 && ytdlpResult.code === 0) {
        throw new YasError('No audio received from YouTube', { status: 502, code: 'UPSTREAM' })
      }
      if (failure === 'ffmpeg') throw ffmpegError(ffmpegResult)
    }, error => {
      stopAll()
      throw error
    })
    .finally(() => clearTimeout(timer))

  const kill = () => {
    stopped = true
    stopAll()
  }

  return { stdout: ffmpeg.stdout, done, kill }
}
