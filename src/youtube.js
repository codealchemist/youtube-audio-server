const fs = require('fs')
const path = require('path')
const { white, yellow, gray, red } = require('chalk')
const ytdl = require('ytdl-core')
const YtNode = require('youtube-node')
const through2 = require('through2')
const Ffmpeg = require('fluent-ffmpeg')
const download = require('download')
const sanitize = require('sanitize-filename')
const ora = require('ora')
const spinner = ora()
const mkdirp = require('mkdirp')
const cache = {}

class YouTube {
  constructor () {
    this.pageSize = 10
    this.audioFolder = path.resolve('.')

    const envApiKey = process.env.KEY
    if (envApiKey) this.setKey(envApiKey)
  }

  setFolder(folder) {
    try {
      mkdirp.sync(folder)
      console.log('Using audio folder:', folder)
      this.audioFolder = folder
    } catch (error) {
      console.log(`Error creating folder: ${folder}`, error)
    }
  }

  setKey (apiKey) {
    this.ytNode = new YtNode()
    this.ytNode.setKey(apiKey)
  }

  streamDownloaded (id, callback) {
    const video = ytdl(id)
    const ffmpeg = new Ffmpeg(video)
    let sent = false

    try {
      const file = `${this.audioFolder}/${id}.mp3`
      ffmpeg
        .format('mp3')
        .on('end', () => {
          ffmpeg.kill()
        })
        .on('data', () => {
          if (sent) return
          sent = true
          callback(fs.createReadStream(file))
        })
        .save(file)
    } catch (e) {
      throw e
    }
  }

  async getMetadata (id) {
    const { videoDetails } = await ytdl.getBasicInfo(id)
    const {
      videoId,
      title,
      description,
      // thumbnails,
      video_url,
      media
    } = videoDetails
    // const imgUrl = thumbnails?.length ? thumbnails[0]?.url : ''
    const imgUrl = `https://img.youtube.com/vi/${videoId}/0.jpg`
    const { song, category, artist, album } = media || {}
    console.log(`${white('ᐧ Title:')} ${yellow(title)}`)

    return {
      videoId,
      title,
      description,
      song,
      category,
      artist,
      album,
      videoUrl: video_url,
      imgUrl
    }
  }

  setNonEmptyMetadataProp (ffmpeg, prop, value) {
    if (!value) return
    ffmpeg.outputOptions('-metadata', `${prop}="${value}"`)
  }

  setMetadata ({ file, id, metadata }) {
    return new Promise(async (resolve, reject) => {
      const ffmpeg = new Ffmpeg(file)
      const tmpFile = `${file}.tmp.mp3`
      const {
        videoId,
        title,
        description,
        artist,
        album,
        videoUrl,
        imgUrl
      } = metadata

      this.setNonEmptyMetadataProp(ffmpeg, 'title', title)
      this.setNonEmptyMetadataProp(ffmpeg, 'description', description)
      this.setNonEmptyMetadataProp(ffmpeg, 'artist', artist)
      this.setNonEmptyMetadataProp(ffmpeg, 'album', album)
      this.setNonEmptyMetadataProp(ffmpeg, 'comment', videoUrl)

      // Save and set art.
      const imgFile = `${this.audioFolder}/${videoId}.jpg`
      if (imgUrl) {
        try {
          spinner.start('Download art')
          await this.writeFile({
            file: imgFile,
            stream: download(imgUrl, { retry: 3 })
          })
          spinner.succeed('Art downloaded')
          spinner.start('Set art metadata')
          ffmpeg
            .addInput(imgFile)
            .outputOptions('-map', '0:0')
            .outputOptions('-map', '1:0')
            .outputOptions('-codec', 'copy')
            .outputOptions('-id3v2_version', '3')
            .save(tmpFile)
        } catch (error) {
          const errMessage = 'Error setting art metadata'
          spinner.fail(errMessage, error)
          reject(errMessage)
        }
      }

      ffmpeg.on('end', () => {
        try {
          fs.unlinkSync(file)
          fs.unlinkSync(imgFile)
          fs.renameSync(tmpFile, file)
          spinner.succeed('Art saved as metadata')
          resolve(ffmpeg)
        } catch (error) {
          const errMessage = 'Error removing temp files'
          spinner.fail(errMessage, error)
          reject(errMessage)
        }
      })
    })
  }

  stream (id, useCache) {
    if (useCache) {
      const cached = cache[id]
      if (cached) return cached
    }

    const video = ytdl(id)
    const ffmpeg = new Ffmpeg(video)
    const stream = through2()

    try {
      const ffmpegObj = ffmpeg.format('mp3').on('end', () => {
        cache[id] = null
        ffmpeg.kill()
      })
      ffmpegObj.pipe(stream, { end: true })

      cache[id] = stream
      return stream
    } catch (e) {
      throw e
    }
  }

  writeFile ({ file, stream }) {
    return new Promise((resolve, reject) => {
      const fileWriter = fs.createWriteStream(file)
      fileWriter.on('finish', () => {
        fileWriter.end()
        resolve()
      })

      fileWriter.on('error', error => {
        fileWriter.end()
        reject(error)
      })
      stream.pipe(fileWriter)
    })
  }

  async download ({ id, file, useCache, addMetadata, onMetadata }, callback) {
    // With metadata.
    if (addMetadata) {
      this.downloadWithMetadata({ id, file, useCache, addMetadata, onMetadata }, callback)
      return
    }

    // Without metadata.
    file =
      file || id.match(/^http.*/)
        ? `${this.audioFolder}/youtube-audio.mp3`
        : `${this.audioFolder}/${id}.mp3`
    spinner.start('Save audio')
    try {
      await this.writeFile({
        file,
        stream: await this.stream(id, useCache, addMetadata)
      })
      spinner.succeed('Audio saved')
      console.log(`  ${gray(file)}`)
      callback(null, { id, file })
    } catch (error) {
      spinner.fail('Error saving audio', error.toString())
      callback(error)
    }
  }

  async downloadWithMetadata ({ id, file, useCache, addMetadata, onMetadata }, callback) {
    let metadata
    let filename
    try {
      metadata = await this.getMetadata(id)
      if (typeof onMetadata === 'function') {
        onMetadata({ id, ...metadata })
      }
    } catch (error) {
      callback(error)
      return
    }

    try {
      const { videoId, title } = metadata
      filename = sanitize(title || videoId)
      file = file || `${this.audioFolder}/${filename}.mp3`

      spinner.start('Save audio')
      await this.writeFile({
        file,
        stream: await this.stream(id, useCache, addMetadata)
      })
      spinner.succeed('Audio saved')
    } catch (error) {
      spinner.fail('Error saving audio', error.toString())
      callback(error)
      return
    }

    try {
      console.log(`  ${gray(file)}`)
      await this.setMetadata({ file, id, metadata })
      callback(null, { id, file, filename })
    } catch (error) {
      callback(error)
      return
    }
  }

  search ({ query, page }, callback) {
    if (!this.ytNode) {
      console.log(red('YouTube KEY required and not set'))
      callback()
      return
    }

    if (page) {
      this.ytNode.addParam('pageToken', page)
    }

    this.ytNode.search(query, this.pageSize, callback)
  }

  get (id, callback) {
    if (!this.ytNode) {
      const error = 'YouTube KEY required and not set'
      console.log(red(error))
      callback(error)
      return
    }
    this.ytNode.getById(id, callback)
  }
}

module.exports = new YouTube()
