import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { Downloader } from '../src/downloader.js'
import { YouTube } from '../src/youtube.js'
import { mockYouTubeFetch, tempDir, useFakeTools } from './helpers.js'

const ID = 'HQmmM_qwG4k'

function downloaderIn (folder) {
  const youtube = new YouTube({ folder })
  youtube.quiet = true
  return new Downloader(youtube)
}

test('chained API reports success with the saved file', async t => {
  useFakeTools(t)
  const folder = tempDir(t)
  const result = await new Promise((resolve, reject) => {
    downloaderIn(folder)
      .onSuccess(resolve)
      .onError(({ error }) => reject(error))
      .download({ id: ID, file: path.join(folder, 'whole-lotta-love.mp3') })
  })
  assert.deepEqual(result, { id: ID, file: path.join(folder, 'whole-lotta-love.mp3') })
  assert.equal(readFileSync(result.file, 'utf8'), `MP3:FAKE-AUDIO:${ID}`)
})

test('setFolder is chainable and used for downloads', async t => {
  useFakeTools(t)
  const folder = path.join(tempDir(t), 'temp-audio')
  const youtube = new YouTube()
  youtube.quiet = true

  const result = await new Promise((resolve, reject) => {
    new Downloader(youtube)
      .setFolder(folder)
      .onSuccess(resolve)
      .onError(({ error }) => reject(error))
      .download({ id: ID })
  })
  assert.equal(result.file, path.join(folder, `${ID}.mp3`))
})

test('onError receives the id, file and error', async t => {
  useFakeTools(t)
  const failure = await new Promise(resolve => {
    downloaderIn(tempDir(t)).onError(resolve).download({ id: 'unavailable', file: 'x.mp3' })
  })
  assert.equal(failure.id, 'unavailable')
  assert.equal(failure.file, 'x.mp3')
  assert.equal(failure.error.code, 'UNAVAILABLE')
})

test('invalid ids are reported through onError', async t => {
  const failure = await new Promise(resolve => {
    downloaderIn(tempDir(t)).onError(resolve).download({ id: 'nope' })
  })
  assert.equal(failure.error.code, 'INVALID_ID')
})

test('-m / metadata triggers onMetadata and returns the filename', async t => {
  useFakeTools(t)
  mockYouTubeFetch(t, () => new Response(Buffer.from('JPEG')))
  const seen = []
  const result = await new Promise((resolve, reject) => {
    downloaderIn(tempDir(t))
      .onMetadata(metadata => seen.push(metadata))
      .onSuccess(resolve)
      .onError(({ error }) => reject(error))
      .download({ id: ID, m: true })
  })
  assert.equal(result.filename, 'Whole Lotta Love  Remaster')
  assert.equal(seen[0].title, 'Whole Lotta Love / Remaster?')
})

test('help describes usage', () => {
  assert.match(new Downloader().help(), /yas --id \[youtube-video-id\|youtube-video-url\]/)
})
