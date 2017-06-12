const youtube = require('./youtube')

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
    youtube.download({video, file}, (err, data) => {
      if (err) {
        this.handleError({video, file, error: err.message || err})
        return
      }

      if (typeof this.onSuccessCallback === 'function') {
        this.onSuccessCallback({video, file})
      }
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
