import youtube from './youtube.js'

export class Downloader {
  constructor (source = youtube) {
    this.youtube = source
  }

  help () {
    return `
      USAGE:
        yas --id [youtube-video-id|youtube-video-url] [--file [./sample.mp3]] [--use-id] [-m]

      EXAMPLES:
        yas --id 2zYDMN4h2hY --file ~/Downloads/Music/sample.mp3
        yas --id https://www.youtube.com/watch?v=2zYDMN4h2hY
        yas --id 2zYDMN4h2hY --use-id
        yas --id 2zYDMN4h2hY -m

      OPTIONS:
        --file          Output file. Defaults to ./[video title].mp3.
        --use-id        Name the file ./[videoId].mp3 instead of using the title.
        -m, --metadata  Save title, artist, album, URL and cover art as ID3 tags.
    `
  }

  // `c`/`cache` are accepted for compatibility with 2.x; downloads always
  // fetch fresh audio.
  // Takes CLI-style options too: `m` for `metadata`, `use-id` for `useId`.
  download ({ id, file, m, metadata, useId, 'use-id': useIdFlag } = {}) {
    this.youtube
      .download({
        id,
        file,
        addMetadata: m || metadata,
        useId: useId || useIdFlag,
        onMetadata: this.onMetadataCallback
      })
      .then(
        data => this.onSuccessCallback?.(data),
        error => this.onErrorCallback?.({ id, file, error })
      )

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

  onMetadata (callback) {
    if (typeof callback === 'function') this.onMetadataCallback = callback
    return this
  }

  setFolder (folder) {
    this.youtube.setFolder(folder)
    return this
  }
}

export default new Downloader()
