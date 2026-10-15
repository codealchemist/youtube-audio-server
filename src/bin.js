#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs, styleText } from 'node:util'
import { downloader, listen } from './index.js'

let args
try {
  ({ values: args } = parseArgs({
    allowPositionals: true,
    options: {
      id: { type: 'string' },
      file: { type: 'string' },
      port: { type: 'string', short: 'p' },
      metadata: { type: 'boolean', short: 'm' },
      cache: { type: 'boolean', short: 'c' }, // Accepted for 2.x compatibility.
      help: { type: 'boolean', short: 'h' }
    }
  }))
} catch (error) {
  // Unknown options, or an option missing its value.
  console.error(styleText('red', error.message))
  console.error(`Run ${styleText('gray', 'yas --help')} for usage.`)
  process.exit(1)
}
const port = args.port || process.env.PORT || 80

// print ascii art
const art = fs.readFileSync(path.join(import.meta.dirname, 'ascii-art.txt'), 'utf8')
console.log(art)

function fail (...message) {
  console.error(...message)
  process.exitCode = 1
}

function download ({ id, file, help }) {
  // Display usage.
  if (help) {
    console.info(downloader.help())
    return true
  }

  // Nothing to download.
  if (!file && !id) return false

  // Validations.
  console.log('-'.repeat(80))
  if (!id) {
    fail(styleText('red', 'Missing param:'), styleText('gray', '--id [youtube-video-id]'))
    return true
  }

  console.log(`${styleText(['bold', 'white'], 'DOWNLOAD:')} ${styleText('blue', id)}`)
  downloader
    .onError(({ error }) => fail(styleText('red', error.message), error.cause?.message ?? ''))
    .download(args)

  return true
}

function run () {
  // Run downloader.
  // If file download was specified using arguments:
  // yas --id [youtube-video-id] [--file [./sample.mp3]]
  // Will download the file and exit.
  if (download(args)) return

  // Start youtube-audio-server.
  const server = listen(port, error => {
    if (error) return fail(styleText('red', `Can't listen on port ${port}:`), error.message)
    console.log(' 🔈  Listening on ', styleText('blue', `http://localhost:${server.address().port}`))
    console.log('-'.repeat(80))
  })
}

run()
