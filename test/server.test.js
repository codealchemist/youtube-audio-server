import assert from 'node:assert/strict'
import { existsSync, readdirSync, utimesSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import path from 'node:path'
import { test } from 'node:test'
import { createApp, listen } from '../src/server.js'
import { YouTube } from '../src/youtube.js'
import { isAlive, mockYouTubeFetch, tempDir, useFakeTools, waitFor } from './helpers.js'

const ID = 'HQmmM_qwG4k'

async function startServer (t, options = {}) {
  const youtube = new YouTube({ apiKey: options.apiKey })
  youtube.quiet = true
  const app = createApp({ youtube, cacheDir: tempDir(t), logger: () => {}, ...options })
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
  t.after(() => new Promise(resolve => {
    server.closeAllConnections()
    server.close(resolve)
  }))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, youtube, get: (route, init) => fetch(base + route, init) }
}

test('serves the test page with a restrictive CSP', async t => {
  const { get } = await startServer(t)
  const res = await get('/')
  assert.equal(res.status, 200)
  assert.match(await res.text(), /<audio controls preload="none" src="HQmmM_qwG4k">/)
  const csp = res.headers.get('content-security-policy')
  assert.match(csp, /default-src 'none'/)
  assert.match(csp, /media-src 'self'/)
  assert.doesNotMatch(csp, /script-src/)
})

test('sets security headers and hides Express', async t => {
  const { get } = await startServer(t)
  const res = await get('/nope/nope/nope')
  assert.equal(res.status, 404)
  assert.deepEqual(await res.json(), { error: 'Not Found' })
  assert.equal(res.headers.get('x-powered-by'), null)
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'")
})

test('favicon requests get an empty response', async t => {
  const { get } = await startServer(t)
  assert.equal((await get('/favicon.ico')).status, 204)
})

test('streams audio as mp3', async t => {
  useFakeTools(t)
  const { get } = await startServer(t)
  const res = await get(`/${ID}`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'audio/mpeg')
  assert.equal(await res.text(), `MP3:FAKE-AUDIO:${ID}`)
})

test('streams after retrying a refused audio URL', async t => {
  useFakeTools(t)
  const { get } = await startServer(t)
  const res = await get('/forbidden01')
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'MP3:FAKE-AUDIO:forbidden01')
})

test('rejects invalid ids before running anything', async t => {
  const tools = useFakeTools(t)
  const { get } = await startServer(t)
  for (const route of ['/notanid', '/chunk/x', '/cache/..%2F..%2Fetc', '/get/%2D%2Dexec', `/${ID}x`]) {
    const res = await get(route)
    assert.equal(res.status, 400, route)
    assert.deepEqual(await res.json(), { error: 'Invalid YouTube video id or URL' })
  }
  assert.equal(tools.calls().length, 0)
})

test('maps upstream failures to clean errors', async t => {
  useFakeTools(t)
  const { get } = await startServer(t)

  const unavailable = await get('/unavailable')
  assert.equal(unavailable.status, 404)
  assert.deepEqual(await unavailable.json(), { error: 'Video unavailable' })

  const broken = await get('/brokenvideo')
  assert.equal(broken.status, 502)
  const body = await broken.text()
  assert.equal(body, '{"error":"Could not fetch audio from YouTube"}')
})

test('does not leak internals when a tool is missing', async t => {
  useFakeTools(t)
  process.env.YTDLP_PATH = path.join(tempDir(t), 'missing', 'yt-dlp')
  const { get } = await startServer(t, { logger: () => {} })
  const res = await get(`/${ID}`)
  assert.equal(res.status, 500)
  const body = await res.text()
  assert.doesNotMatch(body, /missing|ENOENT|\/tmp|\/var/)
})

test('HEAD requests do not start a download', async t => {
  const tools = useFakeTools(t)
  const { get } = await startServer(t)
  const res = await get(`/${ID}`, { method: 'HEAD' })
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'audio/mpeg')
  assert.equal(tools.calls().length, 0)
})

test('kills yt-dlp and ffmpeg when the client disconnects', async t => {
  const tools = useFakeTools(t)
  const { base } = await startServer(t)

  await new Promise((resolve, reject) => {
    const req = request(`${base}/slowrequest`, res => {
      assert.equal(res.statusCode, 200)
      res.once('data', () => {
        req.destroy()
        resolve()
      })
    })
    req.on('error', error => { if (error.code !== 'ECONNRESET') reject(error) })
    req.end()
  })

  await waitFor(() => tools.calls().length === 2)
  const pids = tools.calls().map(call => call.pid)
  await waitFor(() => pids.every(pid => !isAlive(pid)))
})

test('limits concurrent jobs and frees slots when streams end', async t => {
  useFakeTools(t)
  const { base, get } = await startServer(t, { maxJobs: 1 })

  const first = new AbortController()
  const res = await fetch(`${base}/slowrequest`, { signal: first.signal })
  assert.equal(res.status, 200)

  const busy = await get(`/${ID}`)
  assert.equal(busy.status, 503)
  assert.deepEqual(await busy.json(), { error: 'Server busy, try again later' })

  first.abort()
  await waitFor(async () => (await get(`/${ID}`)).status === 200)
})

test('chunk saves to the cache once and supports range requests', async t => {
  const tools = useFakeTools(t)
  const cacheDir = tempDir(t)
  const { get } = await startServer(t, { cacheDir })

  const [a, b] = await Promise.all([get(`/chunk/${ID}`), get(`/cache/${ID}`)])
  assert.equal(await a.text(), `MP3:FAKE-AUDIO:${ID}`)
  assert.equal(await b.text(), `MP3:FAKE-AUDIO:${ID}`)
  assert.equal(a.headers.get('content-type'), 'audio/mpeg')
  assert.equal(a.headers.get('accept-ranges'), 'bytes')
  assert.equal(tools.calls('yt-dlp').length, 1, 'concurrent requests share one download')

  const partial = await get(`/chunk/${ID}`, { headers: { range: 'bytes=4-7' } })
  assert.equal(partial.status, 206)
  assert.equal(await partial.text(), 'FAKE')
  assert.equal(tools.calls('yt-dlp').length, 1, 'served from cache')
  assert.deepEqual(readdirSync(cacheDir), [`${ID}.mp3`])
})

test('the cache keeps only the newest files', async t => {
  useFakeTools(t)
  const cacheDir = tempDir(t)
  const old = path.join(cacheDir, 'aaaaaaaaaaa.mp3')
  writeFileSync(old, 'old')
  const lastWeek = new Date(Date.now() - 7 * 24 * 3600 * 1000)
  utimesSync(old, lastWeek, lastWeek)
  const { get } = await startServer(t, { cacheDir, cacheMaxFiles: 1 })

  assert.equal((await get(`/chunk/${ID}`)).status, 200)
  assert.equal(existsSync(old), false)
  assert.deepEqual(readdirSync(cacheDir), [`${ID}.mp3`])
})

test('serves cached files from folders with dots in their path', async t => {
  useFakeTools(t)
  const cacheDir = path.join(tempDir(t), '.cache', 'yas')
  const { get } = await startServer(t, { cacheDir })
  const res = await get(`/chunk/${ID}`)
  assert.equal(res.status, 200)
  assert.equal(await res.text(), `MP3:FAKE-AUDIO:${ID}`)
})

test('chunk downloads stop after YAS_DOWNLOAD_TIMEOUT', async t => {
  useFakeTools(t)
  const cacheDir = tempDir(t)
  const { get } = await startServer(t, { cacheDir, downloadTimeout: 200 })
  const res = await get('/chunk/slowrequest')
  assert.equal(res.status, 504)
  assert.deepEqual(readdirSync(cacheDir), [])
})

test('failed chunk downloads are not cached', async t => {
  useFakeTools(t)
  const cacheDir = tempDir(t)
  const { get } = await startServer(t, { cacheDir })
  assert.equal((await get('/chunk/brokenvideo')).status, 502)
  assert.deepEqual(readdirSync(cacheDir), [])
})

test('search without an API key explains why it is unavailable', async t => {
  const { get } = await startServer(t)
  const res = await get('/search/led%20zeppelin')
  assert.equal(res.status, 503)
  assert.deepEqual(await res.json(), { error: 'YouTube API key required and not set' })
})

test('search and get proxy the Data API', async t => {
  const requests = mockYouTubeFetch(t, url => Response.json({ endpoint: url.pathname }))
  const { get } = await startServer(t, { apiKey: 'key' })

  const search = await get('/search/led%20zeppelin/CAoQAA')
  assert.deepEqual(await search.json(), { endpoint: '/youtube/v3/search' })
  assert.equal(requests[0].url.searchParams.get('q'), 'led zeppelin')
  assert.equal(requests[0].url.searchParams.get('pageToken'), 'CAoQAA')

  const video = await get(`/get/${ID}`)
  assert.deepEqual(await video.json(), { endpoint: '/youtube/v3/videos' })
})

test('search rejects bad page tokens', async t => {
  mockYouTubeFetch(t, () => assert.fail('should not call the API'))
  const { get } = await startServer(t, { apiKey: 'key' })
  assert.equal((await get('/search/ok/bad%20token')).status, 400)
})

test('listen starts a server and reports the port', async t => {
  const server = await new Promise(resolve => {
    const s = listen(0, () => resolve(s), { logger: () => {}, cacheDir: tempDir(t) })
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  const res = await fetch(`http://localhost:${server.address().port}/favicon.ico`)
  assert.equal(res.status, 204)
})
