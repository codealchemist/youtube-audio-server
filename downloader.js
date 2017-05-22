const fs = require('fs')
const args = require('minimist')(process.argv.slice(2))
const yt = require('youtube-audio-stream')

function download ({video, file = './youtube-audio.mp3'}) {
  console.log(`DOWNLOAD: ${video} --> ${file}`)
  const url = `//youtube.com/watch?v=${video}`
  const ws = fs.createWriteStream(file)
  try {
    yt(url).pipe(ws)
  } catch (e) {
    console.error('UNABLE TO SAVE FILE', e.message || e)
  }

  ws.on('finish', () => {
    console.log('DOWNLOADED!\n')
    process.exit()
  })

  return true
}

function usage () {
  console.info(`
    USAGE:
      yas --video [youtube-video-id] [--file [./sample.mp3]]

    EXAMPLES:
      yas --video 2zYDMN4h2hY --file ~/Downloads/Music/sample.mp3
      yas --video 2zYDMN4h2hY

    FILE defaults to ./youtube-audio.mp3 when not set.
  `)
}

module.exports = () => {
  const {video, file, h, help} = args
  if (help || h) {
    usage()
    process.exit()
  }

  // Continue normal execution when called without params.
  if (!file && !video) {
    return false
  }
  console.log('-'.repeat(80))

  if (file && !video) {
    console.error('Missing param: --video [youtube-video-id]')
    process.exit()
  }

  return download({video, file})
}
