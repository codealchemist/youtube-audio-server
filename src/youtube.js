const fs = require('fs')
const ytStream = require('youtube-audio-stream')
const YtNode = require('youtube-node')

const apiKey = process.env.KEY
const ytNode = new YtNode()
ytNode.setKey(apiKey)

class YouTube {
  constructor () {
    this.pageSize = 10
  }

  stream (id, res) {
    const url = `//youtube.com/watch?v=${id}`

    try {
      return ytStream(url)
    } catch (e) {
      throw e
    }
  }

  download ({id, file = './youtube-audio.mp3'}, callback) {
    const url = `//youtube.com/watch?v=${id}`
    const fileWriter = fs.createWriteStream(file)

    try {
      ytStream(url).pipe(fileWriter)
    } catch (e) {
      throw e
    }

    fileWriter.on('finish', () => {
      fileWriter.end()

      if (typeof callback === 'function') {
        callback(null, {id, file})
      }
    })

    fileWriter.on('error', (error) => {
      fileWriter.end()

      if (typeof callback === 'function') {
        callback(error, null)
      }
    })
  }

  search ({query, page}, callback) {
    if (page) {
      ytNode.addParam('pageToken', page)
    }

    ytNode.search(query, this.pageSize, callback)
  }

  get (id, callback) {
    ytNode.getById(id, callback)
  }
}

module.exports = new YouTube()
