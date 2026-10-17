import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ProgressLine, describeProgress, formatBytes, formatDuration, terminalSafe } from '../src/terminal.js'

test('terminalSafe removes escape sequences and control characters', () => {
  assert.equal(terminalSafe('\u001b[31mRed\u001b[0m text'), 'Red text')
  assert.equal(terminalSafe('title\u001b]0;pwned\u0007'), 'title')
  assert.equal(terminalSafe('a\u009b2Jb'), 'ab')
  assert.equal(terminalSafe('line one\nline two\r\tend'), 'line one line two end')
  assert.equal(terminalSafe('safe \u202eevil\u2066x\u2069'), 'safe evil x')
  assert.equal(terminalSafe('Sigur Rós – Hoppípolla 🎵'), 'Sigur Rós – Hoppípolla 🎵')
  assert.equal(terminalSafe(undefined), '')
})

test('formats sizes and durations', () => {
  assert.equal(formatBytes(512), '512 B')
  assert.equal(formatBytes(3546151), '3.5 MB')
  assert.equal(formatBytes(2.5e9), '2.5 GB')
  assert.equal(formatDuration(5), '0:05')
  assert.equal(formatDuration(125.4), '2:05')
  assert.equal(formatDuration(3725), '1:02:05')
})

test('describes download progress', () => {
  assert.equal(
    describeProgress({ downloaded: 1595768, total: 3546151, speed: 1200000, eta: 3 }),
    'Downloading 45% · 1.6 MB of 3.5 MB · 1.2 MB/s · 0:03 left'
  )
  assert.equal(describeProgress({ downloaded: 2048, total: null, speed: null, eta: null }), 'Downloading · 2 kB')
  assert.equal(describeProgress({ downloaded: 100, total: 100, speed: null, eta: null }), 'Converting to mp3...')
})

function fakeStream (isTTY, columns = 80) {
  return { isTTY, columns, output: '', write (text) { this.output += text } }
}

test('ProgressLine redraws in place on a terminal and clears when stopped', () => {
  const stream = fakeStream(true)
  const line = new ProgressLine(stream)
  line.step('Looking up video...')
  assert.match(stream.output, /^\r\x1b\[2K.+ Looking up video\.\.\. 0s$/)

  line.update('Downloading 50%')
  assert.match(stream.output, /\r\x1b\[2K.+ Downloading 50%$/)

  line.stop()
  assert.ok(stream.output.endsWith('\r\x1b[2K'))
})

test('ProgressLine fits the terminal width', () => {
  const stream = fakeStream(true, 20)
  const line = new ProgressLine(stream)
  line.update('x'.repeat(100))
  line.stop()
  const drawn = stream.output.split('\r\x1b[2K')[1]
  assert.ok(drawn.endsWith('…'))
  assert.ok(drawn.replace(/\x1b\[[0-9;]*m/g, '').length <= 20)
})

test('ProgressLine prints steps as plain lines without a terminal', () => {
  const stream = fakeStream(false)
  const line = new ProgressLine(stream)
  line.step('Looking up video...')
  line.update('Downloading 50%')
  line.stop()
  assert.equal(stream.output, 'Looking up video...\n')
})
