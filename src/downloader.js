const youtube = require('./youtube')

class Downloader {
  help () {
    return `
      USAGE:
        yas --id [youtube-video-id] [--file [./sample.mp3]]

      EXAMPLES:
        yas --id 2zYDMN4h2hY --file ~/Downloads/Music/sample.mp3
        yas --id 2zYDMN4h2hY
        yas --id https://www.youtube.com/watch?v=2zYDMN4h2hY

      FILE defaults to video title or ./youtube-audio.mp3 when not set.
    `
  }

  handleError (params) {
    if (typeof this.onErrorCallback === 'function') {
      this.onErrorCallback(params)
    }
  }

  download ({id, file = './youtube-audio.mp3'}) {
    youtube.download({id, file}, (err, data) => {
      if (err) {
        this.handleError({id, file, error: err.message || err})
        return
      }

      if (typeof this.onSuccessCallback === 'function') {
        this.onSuccessCallback({id, file})
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
