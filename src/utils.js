const ffmetadata = require('ffmetadata')
const sanitize = require('sanitize-filename')
const dl = require('retriable-download')

module.exports.writeMeta = function (
  { id, file },
  { title, owner, channelId },
  options
) {
  return new Promise((resolve, reject) => {
    const data = {
      title: title,
      PUBLISHER: owner,
      WWWARTIST: 'https://www.youtube.com/channel/' + channelId,
      comment: 'https://youtu.be/' + id
    }

    const cb = (err) => {
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

module.exports.getFileName = function (fileMeta) {
  return (
    (fileMeta && sanitize(fileMeta.title).replace(/ +/g, ' ') + '.mp3') ||
    './youtube-audio.mp3'
  )
}

module.exports.getCoverArt = async function (fileMeta) {
  if (fileMeta) {
    try {
      const coverPath = await dl(fileMeta.thumbnailUrl)
      return { attachments: [coverPath] }
    } catch (e) {
      console.error('WARNING: Failed to get cover image!')
    }
  }
}
