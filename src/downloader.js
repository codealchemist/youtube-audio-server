const fs = require('fs')
const yt = require('youtube-audio-stream')

class Downloader {
  help () {
    return `
      USAGE:
        yas --video [youtube-video-id] [--file [./sample.mp3]]

      EXAMPLES:
        yas --video 2zYDMN4h2hY --file ~/Downloads/Music/sample.mp3
        yas --video 2zYDMN4h2hY

      FILE defaults to ./youtube-audio.mp3 when not set.
    `
  }

  handleError (params) {
    if (typeof this.onErrorCallback === 'function') {
      this.onErrorCallback(params)
    }
  }

  download ({video, file = './youtube-audio.mp3'}) {
    const url = `//youtube.com/watch?v=${video}`
    const ws = fs.createWriteStream(file)

    try {
      yt(url).pipe(ws)
    } catch (e) {
      this.handleError({video, file, error: e.message || e})
    }

    ws.on('finish', () => {
      if (typeof this.onSuccessCallback === 'function') {
        this.onSuccessCallback({video, file})
        ws.end()
      }
    })

    ws.on('error', (error) => {
      this.handleError({video, file, error})
      ws.end()
    })

    return this
  }

  onSuccess (callback) {
    if (typeof callback === 'function') this.onSuccessCallback = callback
    return this
  }

  onError (callback) {
    if (typeof callback === 'function') this.onErrorCallback = callback
    return this
  }
}

const downloader = new Downloader()
module.exports = downloader
