// Talks to the real YouTube with the real yt-dlp and ffmpeg. Skipped unless
// YAS_LIVE=1 (npm run test:live), since it needs network access and both tools.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { getVideoInfo } from '../src/tools.js'
import { YouTube } from '../src/youtube.js'
import { tempDir } from './helpers.js'

const ID = 'HQmmM_qwG4k' // "Whole Lotta Love" by Led Zeppelin.
const options = { skip: process.env.YAS_LIVE !== '1' && 'set YAS_LIVE=1 to run', timeout: 180_000 }

function youtube () {
  const yt = new YouTube({ apiKey: null })
  yt.quiet = true
  return yt
}

const isMp3 = bytes => bytes.subarray(0, 3).toString() === 'ID3' ||
  (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)

test('reads metadata', options, async () => {
  const metadata = await youtube().getMetadata(ID)
  assert.match(metadata.title, /Whole Lotta Love/i)
})

test('streams mp3 audio', options, async () => {
  const stream = youtube().stream(ID)
  const chunks = []
  let size = 0
  for await (const chunk of stream) {
    chunks.push(chunk)
    size += chunk.length
    if (size > 64 * 1024) break
  }
  assert.ok(isMp3(Buffer.concat(chunks)), 'starts with an mp3 header')
})

test('downloads with ID3 tags and cover art', options, async t => {
  const folder = tempDir(t)
  const { file } = await youtube().download({ id: ID, file: path.join(folder, 'song.mp3'), addMetadata: true })

  const { stdout } = await promisify(execFile)(process.env.FFPROBE_PATH || 'ffprobe', [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file
  ])
  const probe = JSON.parse(stdout)
  assert.equal(probe.format.format_name, 'mp3')
  assert.match(probe.format.tags.title, /Whole Lotta Love/i)
  assert.equal(probe.format.tags.comment, `https://www.youtube.com/watch?v=${ID}`)
  assert.ok(probe.streams.some(s => s.codec_type === 'video' && s.disposition.attached_pic), 'has cover art')
  const { duration } = await getVideoInfo(ID)
  assert.ok(Math.abs(Number(probe.format.duration) - duration) < 2, 'full length')
})
