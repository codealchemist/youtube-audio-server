import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const binDir = path.join(import.meta.dirname, 'fixtures', 'bin')

export function tempDir (t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'yas-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

// Points YAS at the fake yt-dlp and ffmpeg in fixtures/bin. Every call they
// receive is logged so tests can check the arguments.
export function useFakeTools (t) {
  const logFile = path.join(tempDir(t), 'calls.log')
  process.env.YTDLP_PATH = path.join(binDir, 'yt-dlp')
  process.env.FFMPEG_PATH = path.join(binDir, 'ffmpeg')
  process.env.FAKE_LOG = logFile

  return {
    env: {
      YTDLP_PATH: process.env.YTDLP_PATH,
      FFMPEG_PATH: process.env.FFMPEG_PATH,
      FAKE_LOG: logFile
    },
    calls (tool) {
      let lines = []
      try {
        lines = readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean)
      } catch {}
      return lines.map(line => JSON.parse(line)).filter(call => !tool || call.tool === tool)
    }
  }
}

// Replaces fetch for YouTube hosts only, so tests can still make real
// requests to their local server.
export function mockYouTubeFetch (t, handler) {
  const realFetch = globalThis.fetch
  const requests = []
  t.mock.method(globalThis, 'fetch', async (input, init = {}) => {
    const url = new URL(input)
    if (!/(^|\.)(googleapis\.com|youtube\.com)$/.test(url.hostname)) return realFetch(input, init)
    requests.push({ url, headers: new Headers(init.headers) })
    return handler(url, init)
  })
  return requests
}

export { sleep }

export async function waitFor (check, timeout = 5000) {
  const start = Date.now()
  while (!(await check())) {
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for condition')
    await sleep(25)
  }
}

export function isAlive (pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
