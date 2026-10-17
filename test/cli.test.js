import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { tempDir, useFakeTools } from './helpers.js'

const BIN = path.join(import.meta.dirname, '..', 'src', 'bin.js')
const ID = 'HQmmM_qwG4k'

function run (args, { env = {}, cwd } = {}) {
  return promisify(execFile)(process.execPath, [BIN, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: '1', ...env }
  }).then(
    ({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
    error => ({ code: error.code, stdout: error.stdout, stderr: error.stderr })
  )
}

test('--help prints usage', async () => {
  const { code, stdout } = await run(['--help'])
  assert.equal(code, 0)
  assert.match(stdout, /USAGE:/)
})

test('downloads to ./[video title].mp3 by default', async t => {
  const tools = useFakeTools(t)
  const cwd = tempDir(t)
  const { code, stdout } = await run(['--id', `https://youtu.be/${ID}`], { cwd, env: tools.env })
  assert.equal(code, 0)
  assert.match(stdout, /Audio saved/)
  assert.equal(readFileSync(path.join(cwd, 'Whole Lotta Love Remaster.mp3'), 'utf8'), `MP3:FAKE-AUDIO:${ID}`)
})

test('--use-id downloads to ./[id].mp3', async t => {
  const tools = useFakeTools(t)
  const cwd = tempDir(t)
  const { code } = await run(['--id', ID, '--use-id'], { cwd, env: tools.env })
  assert.equal(code, 0)
  assert.deepEqual(readdirSync(cwd), [`${ID}.mp3`])
})

test('--file sets the output file (ignored in 2.x)', async t => {
  const tools = useFakeTools(t)
  const file = path.join(tempDir(t), 'out.mp3')
  const { code } = await run(['--id', ID, '--file', file], { env: tools.env })
  assert.equal(code, 0)
  assert.equal(readFileSync(file, 'utf8'), `MP3:FAKE-AUDIO:${ID}`)
})

test('exits non-zero on errors', async t => {
  const tools = useFakeTools(t)
  const cwd = tempDir(t)

  const invalid = await run(['--id', 'not a video!'], { cwd, env: tools.env })
  assert.equal(invalid.code, 1)
  assert.match(invalid.stderr, /Invalid YouTube video id or URL/)

  const missing = await run(['--file', 'x.mp3'], { cwd, env: tools.env })
  assert.equal(missing.code, 1)
  assert.match(missing.stderr, /Missing param/)

  const noValue = await run(['--id', ID, '--file'], { cwd, env: tools.env })
  assert.equal(noValue.code, 1)
  assert.match(noValue.stderr, /--file <value>' argument missing/)

  const unknown = await run(['--idd', ID], { cwd, env: tools.env })
  assert.equal(unknown.code, 1)
  assert.match(unknown.stderr, /Unknown option '--idd'/)

  const unavailable = await run(['--id', 'unavailable'], { cwd, env: tools.env })
  assert.equal(unavailable.code, 1)
  assert.match(unavailable.stderr, /Video unavailable/)
})

test('starts the server on --port', async t => {
  const child = spawn(process.execPath, [BIN, '--port', '0'], {
    env: { ...process.env, NO_COLOR: '1', HOST: '127.0.0.1' }
  })
  t.after(() => child.kill())

  const url = await new Promise((resolve, reject) => {
    let output = ''
    child.stdout.on('data', chunk => {
      output += chunk
      const match = output.match(/Listening on\s+(http:\/\/localhost:\d+)/)
      if (match) resolve(match[1].replace('localhost', '127.0.0.1'))
    })
    child.on('exit', code => reject(new Error(`exited with ${code}: ${output}`)))
  })

  const res = await fetch(`${url}/favicon.ico`)
  assert.equal(res.status, 204)
})
