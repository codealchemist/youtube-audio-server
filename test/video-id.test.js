import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isVideoId, parseVideoId, videoUrl } from '../src/video-id.js'

test('accepts bare video ids', () => {
  assert.equal(parseVideoId('HQmmM_qwG4k'), 'HQmmM_qwG4k')
  assert.equal(parseVideoId('  2zYDMN4h2hY \n'), '2zYDMN4h2hY')
  assert.equal(parseVideoId('-ZClicWm0zM'), '-ZClicWm0zM')
})

test('extracts ids from YouTube URLs', () => {
  const urls = [
    'https://www.youtube.com/watch?v=HQmmM_qwG4k',
    'https://youtube.com/watch?v=HQmmM_qwG4k&t=42s',
    'http://m.youtube.com/watch?feature=share&v=HQmmM_qwG4k',
    'https://music.youtube.com/watch?v=HQmmM_qwG4k&list=RD',
    'https://youtu.be/HQmmM_qwG4k?si=abc',
    'https://www.youtube.com/shorts/HQmmM_qwG4k',
    'https://www.youtube.com/embed/HQmmM_qwG4k',
    'https://www.youtube-nocookie.com/embed/HQmmM_qwG4k',
    'https://www.youtube.com/live/HQmmM_qwG4k?feature=share'
  ]
  for (const url of urls) assert.equal(parseVideoId(url), 'HQmmM_qwG4k', url)
})

test('rejects anything else', () => {
  const inputs = [
    undefined,
    null,
    42,
    '',
    'short',
    'HQmmM_qwG4kX',
    'HQmmM qwG4k',
    '--exec=evil',
    '../../../etc',
    'HQmmM/qwG4k',
    'https://evil.example/watch?v=HQmmM_qwG4k',
    'https://youtube.com.evil.example/watch?v=HQmmM_qwG4k',
    'https://www.youtube.com/watch?v=--exec=rm_',
    'https://www.youtube.com/playlist?list=PL123',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'ftp://youtube.com/watch?v=HQmmM_qwG4k'
  ]
  for (const input of inputs) assert.equal(parseVideoId(input), null, String(input))
})

test('isVideoId only accepts the exact id format', () => {
  assert.equal(isVideoId('HQmmM_qwG4k'), true)
  assert.equal(isVideoId('https://youtu.be/HQmmM_qwG4k'), false)
  assert.equal(isVideoId(['HQmmM_qwG4k']), false)
})

test('builds watch URLs', () => {
  assert.equal(videoUrl('HQmmM_qwG4k'), 'https://www.youtube.com/watch?v=HQmmM_qwG4k')
})
