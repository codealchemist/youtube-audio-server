const fs = require('fs')
const ytdl = require('ytdl-core')
const YtNode = require('youtube-node')
const through2 = require('through2')
const Ffmpeg = require('fluent-ffmpeg')

class YouTube {
  constructor () {
    this.pageSize = 10

    const envApiKey = process.env.KEY
    if (envApiKey) this.setKey(envApiKey)
  }

  setKey (apiKey) {
    this.ytNode = new YtNode()
    this.ytNode.setKey(apiKey)
  }

  stream (id) {
    const video = ytdl(id)
    const ffmpeg = new Ffmpeg(video)
    const stream = through2()

    try {
      ffmpeg.format('mp3').pipe(stream)

      return stream
    } catch (e) {
      throw e
    }
  }

  download ({ id, file = './youtube-audio.mp3' }, callback) {
    const fileWriter = fs.createWriteStream(file)

    try {
      this.stream(id).pipe(fileWriter)
    } catch (e) {
      throw e
    }

    fileWriter.on('finish', () => {
      fileWriter.end()

      if (typeof callback === 'function') {
        callback(null, { id, file })
      }
    })

    fileWriter.on('error', error => {
      fileWriter.end()

      if (typeof callback === 'function') {
        callback(error, null)
      }
    })
  }

  search ({ query, page }, callback) {
    if (page) {
      this.ytNode.addParam('pageToken', page)
    }

    this.ytNode.search(query, this.pageSize, callback)
  }

  get (id, callback) {
    this.ytNode.getById(id, callback)
  }
}

module.exports = new YouTube()
