import { STATUS_CODES } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { styleText } from 'node:util'
import express from 'express'
import { AudioCache } from './audio-cache.js'
import { envInt } from './env.js'
import { YasError, invalidVideoId } from './errors.js'
import defaultYoutube from './youtube.js'
import { isVideoId } from './video-id.js'

const INDEX_FILE = path.join(import.meta.dirname, 'index.html')

// The test page loads fonts from Google and plays audio from this server.
// Everything else (JSON, audio) gets a CSP that allows nothing.
const INDEX_CSP = [
  "default-src 'none'",
  "media-src 'self'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')
const DEFAULT_CSP = "default-src 'none'; frame-ancestors 'none'"

// Strips control characters so request input can't forge log lines.
const clean = value => String(value).replace(/[\x00-\x1f\x7f]/g, '') // eslint-disable-line no-control-regex

function log (...args) {
  console.log(styleText('gray', new Date().toISOString()), ...args)
}

function videoIdParam (req) {
  const { videoId } = req.params
  if (!isVideoId(videoId)) throw invalidVideoId()
  return videoId
}

export function createApp ({
  youtube = defaultYoutube,
  cacheDir = process.env.YAS_CACHE_DIR || path.join(os.tmpdir(), 'youtube-audio-server'),
  cacheMaxFiles = envInt('YAS_CACHE_MAX_FILES', 20),
  maxJobs = envInt('YAS_MAX_JOBS', 4),
  downloadTimeout = envInt('YAS_DOWNLOAD_TIMEOUT', 30 * 60) * 1000,
  logger = log
} = {}) {
  const app = express()

  // Each audio request runs yt-dlp and ffmpeg, so cap how many run at once.
  let activeJobs = 0
  const acquireJob = () => {
    if (activeJobs >= maxJobs) {
      throw new YasError('Server busy, try again later', { status: 503, code: 'BUSY' })
    }
    activeJobs++
    return () => { activeJobs-- }
  }

  const cache = new AudioCache({
    dir: cacheDir,
    maxFiles: cacheMaxFiles,
    produce: async (id, file) => {
      const release = acquireJob()
      try {
        await youtube.saveAudio(id, file, { timeout: downloadTimeout })
      } finally {
        release()
      }
    }
  })

  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': DEFAULT_CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    })
    next()
  })

  app.get('/favicon.ico', (req, res) => res.sendStatus(204))

  app.get('/', (req, res) => {
    logger('Sending test page')
    res.set('Content-Security-Policy', INDEX_CSP).sendFile(INDEX_FILE)
  })

  app.get('/search/:query{/:page}', async (req, res) => {
    const { query, page } = req.params
    logger(`Searching ${styleText('yellow', clean(query))}`, page ? styleText('gray', `#${clean(page)}`) : '')
    res.json(await youtube.search({ query, page }))
  })

  app.get('/get/:videoId', async (req, res) => {
    const id = videoIdParam(req)
    logger(`Getting metadata ${styleText('blue', id)}`)
    res.json(await youtube.get(id))
  })

  // Seekable: the mp3 is saved to the cache first, then served with range
  // support. `/cache` is kept as an alias from 2.x.
  const sendCached = async (req, res) => {
    const id = videoIdParam(req)
    logger(`Sending file ${styleText('blue', id)}`)
    const { file, release } = await cache.get(id)
    res.once('close', release)
    res.set('Cache-Control', 'no-store')
    res.sendFile(file, { dotfiles: 'allow', headers: { 'Content-Type': 'audio/mpeg' } })
  }
  app.get('/chunk/:videoId', sendCached)
  app.get('/cache/:videoId', sendCached)

  app.get('/:videoId', (req, res, next) => {
    const id = videoIdParam(req)
    if (req.method === 'HEAD') {
      res.type('audio/mpeg').end()
      return
    }

    const release = acquireJob()
    logger(`Streaming ${styleText('yellow', id)}`)

    let stream
    try {
      stream = youtube.stream(id)
    } catch (error) {
      release()
      throw error
    }
    stream.once('close', release)
    res.once('close', () => stream.destroy())

    // Wait for the first bytes before committing to a 200, so failures that
    // happen up front (unavailable video, missing tools) get a proper status.
    stream.once('data', chunk => {
      res.status(200).type('audio/mpeg').set('Cache-Control', 'no-store')
      res.write(chunk)
      stream.pipe(res)
    })
    stream.once('end', () => {
      if (!res.headersSent) next(new YasError('No audio received', { status: 502, code: 'UPSTREAM' }))
    })
    stream.once('error', next)
  })

  app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' })
  })

  // Clients only ever see a status and a short message; details go to the log.
  app.use((error, req, res, next) => {
    const status = error.status || error.statusCode || 500
    if (status >= 500) {
      logger(styleText('red', `${req.method} ${clean(req.path)} failed:`), error.message, error.cause?.message ?? '')
    }
    if (res.headersSent) {
      res.destroy()
      return
    }

    const message = error instanceof YasError
      ? error.message
      : (status < 500 && STATUS_CODES[status]) || 'Internal Server Error'
    res.status(status).json({ error: message })
  })

  return app
}

export function listen (port, callback = () => {}, options) {
  const app = createApp(options)
  return app.listen(port, process.env.HOST, callback)
}
