#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const yas = require('./index')
const args = require('minimist')(process.argv.slice(2))
const port = process.env.PORT || 8026
const qs = require('qs')
const fetchVideoInfo = require('updated-youtube-info')
const { writeMeta, getFileName, getCoverArt } = require('./utils')

// print ascii art
var artFile = path.join(__dirname, './ascii-art.txt')
var art = fs.readFileSync(artFile, 'utf8')
console.log(art)

class UrlMatcher {
  /**
   *
   * @param {RegExp} regex
   * @param {function(RegExpExecArray): string} idExtractor
   */
  constructor (regex, idExtractor) {
    this.regex = regex
    this.idExtractor = idExtractor
  }

  /**
   *
   * @param {string} url
   * @returns {string}
   */
  getVideoId (url) {
    try {
      var matcher = this.regex.exec(url)

      if (!matcher) {
        return false
      }

      return this.idExtractor(matcher) || false
    } catch (e) {
      return false
    }
  }
}

async function download ({ id, file, h, help }) {
  // Display usage.
  if (help || h) {
    console.info(yas.downloader.help())
    process.exit()
  }

  // Nothing to download.
  if (!file && !id) return false

  // Validations.
  console.log('-'.repeat(80))

  for (const matcher of [
    new UrlMatcher(
      /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?([^#]+)$/i,
      (m) => qs.parse(m[3]).v
    ),
    new UrlMatcher(/^(https?:\/\/)?youtu.be\/([^#?]+)/i, (m) => m[2])
  ]) {
    var videoId = matcher.getVideoId(id)

    if (videoId) {
      id = videoId
      break
    }
  }

  if (!id) {
    console.error('Missing param: --id [youtube-video-id]')
    process.exit()
  }

  let fileMeta
  try {
    fileMeta = await fetchVideoInfo(id)
  } catch (e) {
    console.error('WARNING: Failed to fetch metadata!')
  }

  const optionsTask = getCoverArt(fileMeta)

  file = file || getFileName(fileMeta)
  console.log(`DOWNLOAD: ${id} --> ${file}`)
  yas.downloader
    .onSuccess(async () => {
      if (fileMeta) {
        try {
          await writeMeta({ id, file }, fileMeta, await optionsTask)
        } catch (e) {
          console.error('WARNING: Failed to write file meta!')
        }
      } else {
        process.exit()
      }
    })
    .onError((error) => {
      console.error(error)
      process.exit()
    })
    .download({ ...args, id, file })

  return true
}

async function run () {
  // Run downloader.
  // If file download was specified using arguments:
  // yas --video [youtube-video-id] [--file [./sample.mp3]]
  // Will download the file and exit.
  if (await download(args)) return

  // Start youtube-audio-server.
  yas.listen(port, () => {
    console.log(
      ` 🔈  YOUTUBE AUDIO SERVER listening on http://localhost:${port}!`
    )
    console.log('-'.repeat(80))
  })
}

run()
