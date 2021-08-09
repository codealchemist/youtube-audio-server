#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const yas = require('./index')
const args = require('minimist')(process.argv.slice(2))
const port = args.p || args.port || process.env.PORT || 80
const ytdl = require('ytdl-core')
const { writeMeta, getFileName, getCoverArt } = require('./utils')

// print ascii art
var artFile = path.join(__dirname, './ascii-art.txt')
var art = fs.readFileSync(artFile, 'utf8')

console.log(art)

/**
 * @typedef {Object} DownloadArgs
 * @property {string} id
 * @property {string} file
 * @property {boolean} [h]
 * @property {boolean} [help]
 */

/**
 *
 * @param {DownloadArgs} param0
 * @returns {boolean}
 */
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

  if (!id) {
    console.error('Missing param: --id [youtube-video-id]')
    process.exit()
  }

  id = ytdl.getVideoID(id)

  /**
   * @type {ytdl.videoInfo}
   */
  let fileMeta
  try {
    fileMeta = await ytdl.getBasicInfo(id)
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
    .onError(error => {
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
