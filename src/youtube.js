import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { styleText } from 'node:util'
import { YasError, invalidVideoId } from './errors.js'
import { safeFilename } from './filename.js'
import { getVideoInfo, transcode } from './tools.js'
import { parseVideoId, videoUrl } from './video-id.js'

const API_BASE = 'https://www.googleapis.com/youtube/v3/'
const API_TIMEOUT_MS = 15 * 1000
const MAX_COVER_BYTES = 5 * 1024 * 1024
const MAX_QUERY_LENGTH = 200
const PAGE_TOKEN = /^[A-Za-z0-9_-]{1,128}$/
const RETRIES = 1

function requireId (input) {
  const id = parseVideoId(input)
  if (!id) throw invalidVideoId()
  return id
}

// Public methods take an optional node-style callback, as in 2.x, and return
// a promise when it's left out.
function withCallback (promise, callback) {
  if (typeof callback !== 'function') return promise
  promise.then(data => callback(null, data), error => callback(error))
}

function toMetadata (info, id) {
  const videoId = info.id || id
  return {
    videoId,
    title: info.title,
    description: info.description,
    song: info.track,
    category: info.categories?.[0],
    artist: info.artists?.join(', ') || info.artist,
    album: info.album,
    videoUrl: info.webpage_url || videoUrl(videoId),
    imgUrl: `https://img.youtube.com/vi/${videoId}/0.jpg`
  }
}

export class YouTube {
  constructor ({ apiKey = process.env.KEY, folder = path.resolve('.') } = {}) {
    this.pageSize = 10
    this.audioFolder = folder
    this.apiKey = apiKey || null
    this.quiet = false
  }

  log (...args) {
    if (!this.quiet) console.log(...args)
  }

  setFolder (folder) {
    try {
      fs.mkdirSync(folder, { recursive: true })
      this.audioFolder = path.resolve(folder)
      this.log('Using audio folder:', this.audioFolder)
    } catch (error) {
      console.error(`Error creating folder: ${folder}`, error)
    }
  }

  setKey (apiKey) {
    this.apiKey = apiKey || null
  }

  // One retry when YouTube refuses the audio URL (see ytdlpError).
  #shouldRetry (error, attempt, id) {
    if (!error.retryable || attempt >= RETRIES) return false
    this.log(styleText('yellow', `Retrying ${id}: ${error.cause.message}`))
    return true
  }

  // Live mp3 stream of a video's audio. Destroying the returned stream (e.g.
  // when an HTTP client disconnects) stops yt-dlp and ffmpeg.
  stream (input) {
    const id = requireId(input)
    const output = new PassThrough()
    let job
    let sent = false

    // Retries are only possible until audio has been sent.
    const run = attempt => {
      job = transcode(id)
      job.stdout.once('data', () => { sent = true })
      job.stdout.pipe(output, { end: false })
      job.done.then(() => output.end(), error => {
        if (!sent && !output.destroyed && this.#shouldRetry(error, attempt, id)) {
          job.stdout.unpipe(output)
          run(attempt + 1)
          return
        }
        output.destroy(error)
      })
    }

    run(0)
    output.on('close', () => job.kill())
    return output
  }

  async getMetadata (input) {
    const id = requireId(input)
    return toMetadata(await getVideoInfo(id), id)
  }

  // Saves a video's audio as mp3, named after the video title (sanitized) in
  // the audio folder. `useId` names it [videoId].mp3 instead, and `file` sets
  // the path. `addMetadata` tags it with title, description, artist, album,
  // the video URL and cover art.
  download ({ id, file, addMetadata, useId, onMetadata } = {}, callback) {
    return withCallback(this.#download({ id, file, addMetadata, useId, onMetadata }), callback)
  }

  async #download ({ id: input, file, addMetadata, useId, onMetadata }) {
    const id = requireId(input)
    const nameFromTitle = !file && !useId
    let info
    let filename

    if (addMetadata || nameFromTitle) {
      info = await getVideoInfo(id)
      const metadata = toMetadata(info, id)
      if (typeof onMetadata === 'function') onMetadata({ id, ...metadata })
      filename = safeFilename(metadata.title, id)
      this.log(`${styleText('white', 'ᐧ Title:')} ${styleText('yellow', metadata.title || id)}`)
    }

    const target = path.resolve(file || path.join(this.audioFolder, `${nameFromTitle ? filename : id}.mp3`))
    this.log('Saving audio...')
    await this.saveAudio(id, target, { info, addMetadata })
    this.log(`${styleText('green', '✔')} Audio saved\n  ${styleText('gray', target)}`)

    return filename ? { id, file: target, filename } : { id, file: target }
  }

  // Writes to a temporary file next to the target and renames it when done,
  // so a failed download never leaves a truncated mp3 behind. `info` (from
  // getVideoInfo) is reused instead of extracting the video again;
  // `addMetadata` (requires `info`) adds ID3 tags and cover art. `timeout`
  // (ms) stops the job if it takes longer.
  async saveAudio (input, target, { info, addMetadata = false, timeout = 0 } = {}) {
    const id = requireId(input)
    const folder = path.dirname(target)
    await mkdir(folder, { recursive: true })

    const tmpFile = path.join(folder, `.${path.basename(target)}.${randomUUID()}.part`)
    const workDir = info ? await mkdtemp(path.join(os.tmpdir(), 'yas-')) : null

    try {
      let inputs = []
      let outputArgs = []
      let infoFile
      if (info) {
        if (addMetadata) ({ inputs, outputArgs } = await this.#metadataArgs(toMetadata(info, id), workDir))
        infoFile = path.join(workDir, 'info.json')
        await writeFile(infoFile, JSON.stringify(info))
      }
      for (let attempt = 0; ; attempt++) {
        // A retry extracts the video again: the saved info has the refused URL.
        const job = transcode(id, { output: tmpFile, inputs, outputArgs, infoFile: attempt ? undefined : infoFile, timeout })
        job.stdout.resume()
        try {
          await job.done
          break
        } catch (error) {
          if (!this.#shouldRetry(error, attempt, id)) throw error
        }
      }
      await rename(tmpFile, target)
    } catch (error) {
      await rm(tmpFile, { force: true })
      throw error
    } finally {
      if (workDir) await rm(workDir, { recursive: true, force: true })
    }
  }

  async #metadataArgs ({ title, description, artist, album, videoUrl, imgUrl }, workDir) {
    const inputs = []
    const outputArgs = []

    const cover = await this.#downloadCover(imgUrl, workDir)
    if (cover) {
      inputs.push(cover)
      outputArgs.push(
        '-map', '1:v:0',
        '-codec:v', 'copy',
        '-metadata:s:v', 'title=Album cover',
        '-metadata:s:v', 'comment=Cover (front)'
      )
    }

    const tags = { title, description, artist, album, comment: videoUrl }
    for (const [name, value] of Object.entries(tags)) {
      if (value) outputArgs.push('-metadata', `${name}=${value}`)
    }
    outputArgs.push('-id3v2_version', '3')

    return { inputs, outputArgs }
  }

  // Cover art is a nice-to-have: if it can't be fetched the audio is still saved.
  async #downloadCover (url, workDir) {
    if (!url) return null
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT_MS) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (Number(response.headers.get('content-length')) > MAX_COVER_BYTES) {
        throw new Error('Cover image too large')
      }
      const image = Buffer.from(await response.arrayBuffer())
      if (image.length > MAX_COVER_BYTES) throw new Error('Cover image too large')

      const file = path.join(workDir, 'cover.jpg')
      await writeFile(file, image)
      return file
    } catch (error) {
      console.error(styleText('yellow', `Couldn't download cover art: ${error.message}`))
      return null
    }
  }

  search ({ query, page } = {}, callback) {
    return withCallback(this.#search({ query, page }), callback)
  }

  async #search ({ query, page }) {
    if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY_LENGTH) {
      throw new YasError('Invalid search query', { status: 400, code: 'INVALID_QUERY' })
    }
    if (page && !PAGE_TOKEN.test(page)) {
      throw new YasError('Invalid page token', { status: 400, code: 'INVALID_PAGE' })
    }

    return this.#api('search', {
      part: 'snippet',
      q: query,
      maxResults: this.pageSize,
      pageToken: page || undefined
    })
  }

  get (input, callback) {
    return withCallback(this.#get(input), callback)
  }

  async #get (input) {
    return this.#api('videos', {
      part: 'snippet,contentDetails,statistics,status',
      id: requireId(input)
    })
  }

  // YouTube Data API v3. The key goes in a header rather than the query
  // string so it doesn't end up in proxy or access logs.
  async #api (endpoint, params) {
    if (!this.apiKey) {
      throw new YasError('YouTube API key required and not set', { status: 503, code: 'NO_API_KEY' })
    }

    const url = new URL(endpoint, API_BASE)
    for (const [name, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(name, value)
    }

    let response
    try {
      response = await fetch(url, {
        headers: { 'x-goog-api-key': this.apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(API_TIMEOUT_MS)
      })
    } catch (error) {
      throw new YasError('YouTube API request failed', { status: 502, code: 'UPSTREAM', cause: error })
    }

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new YasError('YouTube API request failed', {
        status: 502,
        code: 'UPSTREAM',
        cause: new Error(data.error?.message || `HTTP ${response.status}`)
      })
    }
    return data
  }
}

export default new YouTube()
