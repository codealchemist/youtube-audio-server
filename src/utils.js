const ffmetadata = require('ffmetadata')
const sanitize = require('sanitize-filename')
const dl = require('retriable-download')

module.exports.writeMeta =
  /**
   *
   * @param {{ id: string, file:string }} idFileTuple
   * @param {import('ytdl-core').videoInfo} fileMeta
   * @param {*} options
   * @returns
   */
  function (
    { id, file },
    { videoDetails: { title, ownerChannelName, channelId } },
    options
  ) {
    return new Promise((resolve, reject) => {
      const data = {
        title: title,
        PUBLISHER: ownerChannelName,
        WWWARTIST: 'https://www.youtube.com/channel/' + channelId,
        comment: 'https://youtu.be/' + id
      }

      const cb = err => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      }

      ffmetadata.write(
        file,
        data,
        Object.assign({ id3v1: true, 'id3v2.3': true }, options),
        cb
      )
    })
  }

module.exports.getFileName =
  /**
   *
   * @param {import('ytdl-core').videoInfo} fileMeta
   * @returns
   */
  function (fileMeta) {
    return (
      (fileMeta &&
        sanitize(fileMeta.videoDetails.title).replace(/ +/g, ' ') + '.mp3') ||
      './youtube-audio.mp3'
    )
  }

module.exports.getCoverArt =
  /**
   *
   * @param {import('ytdl-core').videoInfo} fileMeta
   * @returns
   */
  async function (fileMeta) {
    // const thumb = ((fileMeta && fileMeta.videoDetails.thumbnails) || [])[0]
    // const thumbUrl = thumb && thumb.url
    const thumbUrl =
      fileMeta &&
      [
        'https://img.youtube.com/vi/',
        fileMeta.videoDetails.videoId,
        '/sddefault.jpg'
      ].join('')

    if (thumbUrl) {
      try {
        const coverPath = await dl(thumbUrl)
        return { attachments: [coverPath] }
      } catch (e) {
        console.error('WARNING: Failed to get cover image!')
      }
    }
  }
