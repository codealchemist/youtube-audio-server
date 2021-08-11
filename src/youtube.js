const fs = require('fs')
const path = require('path')
const { white, yellow, gray, red } = require('chalk')
const ytdl = require('ytdl-core')
const YtNode = require('youtube-node')
const through2 = require('through2')
const Ffmpeg = require('fluent-ffmpeg')
const download = require('download')
const sanitize = require('sanitize-filename')
const cache = {}

class YouTube {
  constructor () {
    this.pageSize = 10
    this.audioFolder = path.resolve('.')

    const envApiKey = process.env.KEY
    if (envApiKey) this.setKey(envApiKey)
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

      ffmpeg
        .outputOptions('-metadata', `title="${title}"`)
        .outputOptions('-metadata', `description="${description}"`)
        .outputOptions('-metadata', `artist="${artist}"`)
        .outputOptions('-metadata', `album="${album}"`)
        .outputOptions('-metadata', `comment="${videoUrl}"`)

      // Save and set art.
      const imgFile = path.resolve(`./${videoId}.jpg`)
      if (imgUrl) {
        try {
          process.stdout.write(white('ᐧ Download art '))
          await this.writeFile({
            file: imgFile,
            stream: download(imgUrl, { retry: 3 })
          })
          console.log(yellow('✓'))
          ffmpeg
            .addInput(imgFile)
            .outputOptions('-map', '0:0')
            .outputOptions('-map', '1:0')
            .outputOptions('-codec', 'copy')
            .outputOptions('-id3v2_version', '3')
            .save(tmpFile)
        } catch (error) {
          const errMessage = 'ERROR setting art image'
          console.log(red(errMessage), gray(error.message))
          reject(errMessage)
        }
      }

      process.stdout.write(white('ᐧ Save metadata '))
      ffmpeg.on('end', () => {
        console.log(yellow('✓'))
        fs.unlinkSync(file)
        fs.unlinkSync(imgFile)
        fs.renameSync(tmpFile, file)
        resolve(ffmpeg)
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

  async download ({ id, file, useCache, addMetadata }, callback) {
    // With metadata.
    if (addMetadata) {
      this.downloadWithMetadata({ id, file, useCache, addMetadata }, callback)
      return
    }

    // Without metadata.
    file =
      file || id.match(/^http.*/)
        ? `${this.audioFolder}/youtube-audio.mp3`
        : `${this.audioFolder}/${id}.mp3`
    process.stdout.write(white(`ᐧ Save audio `))
    try {
      await this.writeFile({
        file,
        stream: await this.stream(id, useCache, addMetadata)
      })
      console.log(yellow('✓'))
      console.log(`  ${gray(file)}`)
      callback(null, { id, file })
    } catch (error) {
      callback(error)
    }
  }

  async downloadWithMetadata ({ id, file, useCache, addMetadata }, callback) {
    try {
      const metadata = await this.getMetadata(id)
      const { videoId, title } = metadata
      const filename = sanitize(title || videoId)
      file = file || `${this.audioFolder}/${filename}.mp3`

      process.stdout.write(white(`ᐧ Save audio `))
      await this.writeFile({
        file,
        stream: await this.stream(id, useCache, addMetadata)
      })
      console.log(yellow('✓'))
      console.log(`  ${gray(file)}`)
      await this.setMetadata({ file, id, metadata })
      callback(null, { id, file })
    } catch (error) {
      callback(error)
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
