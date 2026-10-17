import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { text } from 'node:stream/consumers'
import { test } from 'node:test'
import { YasError } from '../src/errors.js'
import { YouTube } from '../src/youtube.js'
import { isAlive, mockYouTubeFetch, sleep, tempDir, useFakeTools, waitFor } from './helpers.js'

const ID = 'HQmmM_qwG4k'

function quietYouTube (options) {
  const youtube = new YouTube({ apiKey: null, ...options })
  youtube.quiet = true
  return youtube
}

const jpeg = () => new Response(Buffer.from('JPEG'), { headers: { 'content-type': 'image/jpeg' } })

test('stream pipes yt-dlp into ffmpeg with hardened arguments', async t => {
  const tools = useFakeTools(t)
  const output = await text(quietYouTube().stream(`https://youtu.be/${ID}`))
  assert.equal(output, `MP3:FAKE-AUDIO:${ID}`)

  const [ytdlp] = tools.calls('yt-dlp')
  for (const flag of ['--ignore-config', '--no-playlist', '--use-extractors']) {
    assert.ok(ytdlp.args.includes(flag), flag)
  }
  assert.deepEqual(ytdlp.args.slice(-2), ['--', `https://www.youtube.com/watch?v=${ID}`])
  assert.deepEqual(tools.calls('ffmpeg')[0].args.slice(-3), ['mp3', '-y', 'pipe:1'])
})

test('passes YTDLP_JS_RUNTIMES through to yt-dlp', async t => {
  const tools = useFakeTools(t)
  process.env.YTDLP_JS_RUNTIMES = 'node'
  t.after(() => delete process.env.YTDLP_JS_RUNTIMES)

  await text(quietYouTube().stream(ID))
  const { args } = tools.calls('yt-dlp')[0]
  assert.equal(args[args.indexOf('--js-runtimes') + 1], 'node')
})

test('YAS_MAX_DURATION skips long videos and live streams', async t => {
  const tools = useFakeTools(t)
  process.env.YAS_MAX_DURATION = '3600'
  t.after(() => delete process.env.YAS_MAX_DURATION)

  await assert.rejects(text(quietYouTube().stream('toolongvide')), { code: 'NOT_ALLOWED', status: 422 })
  const { args } = tools.calls('yt-dlp')[0]
  assert.equal(args[args.indexOf('--break-match-filters') + 1], '!is_live & duration <= 3600')
})

test('no duration limit by default', async t => {
  const tools = useFakeTools(t)
  await text(quietYouTube().stream(ID))
  assert.equal(tools.calls('yt-dlp')[0].args.includes('--break-match-filters'), false)
})

test('stream rejects invalid ids without spawning anything', t => {
  const tools = useFakeTools(t)
  assert.throws(() => quietYouTube().stream('--exec=evil'), { code: 'INVALID_ID', status: 400 })
  assert.equal(tools.calls().length, 0)
})

test('stream errors when the video is unavailable', async t => {
  useFakeTools(t)
  await assert.rejects(text(quietYouTube().stream('unavailable')), { code: 'UNAVAILABLE', status: 404 })
})

test('stream errors with a generic message on unknown yt-dlp failures', async t => {
  useFakeTools(t)
  await assert.rejects(text(quietYouTube().stream('brokenvideo')), error => {
    assert.equal(error.status, 502)
    assert.equal(error.message, 'Could not fetch audio from YouTube')
    assert.match(error.cause.message, /Something unexpected/)
    return true
  })
})

test('stream errors when ffmpeg fails', async t => {
  useFakeTools(t)
  process.env.FAKE_FFMPEG_FAIL = '1'
  t.after(() => delete process.env.FAKE_FFMPEG_FAIL)
  await assert.rejects(text(quietYouTube().stream(ID)), { code: 'TRANSCODE' })
})

test('reports ffmpeg as the cause when it fails first and yt-dlp then errors', async t => {
  useFakeTools(t)
  process.env.FAKE_FFMPEG_FAIL_EARLY = '1'
  t.after(() => delete process.env.FAKE_FFMPEG_FAIL_EARLY)
  await assert.rejects(text(quietYouTube().stream('slowrequest')), error => {
    assert.equal(error.code, 'TRANSCODE')
    assert.equal(error.cause.message, 'Unknown encoder libmp3lame')
    return true
  })
})

test('no audio is an upstream error, not "too long"', async t => {
  useFakeTools(t)
  process.env.YAS_MAX_DURATION = '3600'
  t.after(() => delete process.env.YAS_MAX_DURATION)
  await assert.rejects(text(quietYouTube().stream('silentvideo')), {
    code: 'UPSTREAM',
    message: 'No audio received from YouTube'
  })
})

test('stopping a stream is not reported as an error', async t => {
  const tools = useFakeTools(t)
  const stream = quietYouTube().stream('slowrequest')
  const errors = []
  stream.on('error', error => errors.push(error))
  await new Promise(resolve => stream.once('data', resolve))
  stream.destroy()
  await waitFor(() => tools.calls().length === 2 && tools.calls().every(call => !isAlive(call.pid)))
  await sleep(50)
  assert.deepEqual(errors, [])
})

test('saveAudio stops after its timeout', async t => {
  useFakeTools(t)
  const folder = tempDir(t)
  await assert.rejects(
    quietYouTube().saveAudio('slowrequest', path.join(folder, 'x.mp3'), { timeout: 200 }),
    { code: 'TIMEOUT', status: 504 }
  )
  assert.deepEqual(readdirSync(folder), [])
})

test('stream retries once when YouTube refuses the audio URL', async t => {
  const tools = useFakeTools(t)
  const output = await text(quietYouTube().stream('forbidden01'))
  assert.equal(output, 'MP3:FAKE-AUDIO:forbidden01')
  assert.equal(tools.calls('yt-dlp').length, 2)
})

test('stream gives up after one retry', async t => {
  const tools = useFakeTools(t)
  await assert.rejects(text(quietYouTube().stream('forbiddenxx')), error => {
    assert.equal(error.status, 502)
    assert.match(error.cause.message, /HTTP Error 403/)
    return true
  })
  assert.equal(tools.calls('yt-dlp').length, 2)
})

test('other yt-dlp failures are not retried', async t => {
  const tools = useFakeTools(t)
  await assert.rejects(text(quietYouTube().stream('brokenvideo')), { code: 'UPSTREAM' })
  assert.equal(tools.calls('yt-dlp').length, 1)
})

test('download retries with a fresh extraction after a 403', async t => {
  const tools = useFakeTools(t)
  mockYouTubeFetch(t, jpeg)
  const result = await quietYouTube({ folder: tempDir(t) }).download({ id: 'forbidden01', addMetadata: true })
  assert.equal(readFileSync(result.file, 'utf8'), 'MP3:FAKE-AUDIO:forbidden01')

  const audioCalls = tools.calls('yt-dlp').filter(call => call.args.includes('--output'))
  assert.equal(audioCalls.length, 2)
  assert.ok(audioCalls[0].args.includes('--load-info-json'))
  assert.equal(audioCalls[1].args.at(-1), 'https://www.youtube.com/watch?v=forbidden01')
})

test('reports a missing yt-dlp clearly', async t => {
  useFakeTools(t)
  process.env.YTDLP_PATH = path.join(tempDir(t), 'no-such-yt-dlp')
  await assert.rejects(text(quietYouTube().stream(ID)), {
    code: 'MISSING_TOOL',
    message: 'yt-dlp is not installed or not in PATH (set YTDLP_PATH to its location)'
  })
})

test('download names the file after the sanitized title, without tags', async t => {
  const tools = useFakeTools(t)
  const folder = tempDir(t)
  const youtube = quietYouTube({ folder })

  const result = await youtube.download({ id: `https://www.youtube.com/watch?v=${ID}` })
  assert.deepEqual(result, {
    id: ID,
    file: path.join(folder, 'Whole Lotta Love Remaster.mp3'),
    filename: 'Whole Lotta Love Remaster'
  })
  assert.equal(readFileSync(result.file, 'utf8'), `MP3:FAKE-AUDIO:${ID}`)
  assert.equal(tools.calls('ffmpeg')[0].args.includes('-metadata'), false)

  // The title lookup is reused for the audio, so the video is extracted once.
  const ytdlpCalls = tools.calls('yt-dlp')
  assert.ok(ytdlpCalls[0].args.includes('--dump-single-json'))
  assert.ok(ytdlpCalls[1].args.includes('--load-info-json'))
})

test('useId saves to [id].mp3 without looking up the title', async t => {
  const tools = useFakeTools(t)
  const folder = tempDir(t)
  const result = await quietYouTube({ folder }).download({ id: ID, useId: true })
  assert.deepEqual(result, { id: ID, file: path.join(folder, `${ID}.mp3`) })
  assert.equal(tools.calls('yt-dlp').length, 1)
  assert.equal(tools.calls('yt-dlp')[0].args.includes('--dump-single-json'), false)
})

test('useId with metadata still tags the file', async t => {
  const tools = useFakeTools(t)
  mockYouTubeFetch(t, jpeg)
  const folder = tempDir(t)
  const result = await quietYouTube({ folder }).download({ id: ID, useId: true, addMetadata: true })
  assert.equal(result.file, path.join(folder, `${ID}.mp3`))
  assert.ok(tools.calls('ffmpeg')[0].args.includes('-metadata'))
})

test('download honours an explicit file, and supports callbacks', async t => {
  const tools = useFakeTools(t)
  const file = path.join(tempDir(t), 'nested', 'song.mp3')
  const result = await new Promise((resolve, reject) => {
    quietYouTube().download({ id: ID, file }, (error, data) => error ? reject(error) : resolve(data))
  })
  assert.equal(result.file, file)
  assert.equal(readFileSync(file, 'utf8'), `MP3:FAKE-AUDIO:${ID}`)
  assert.equal(tools.calls('yt-dlp').length, 1, 'no title lookup needed')
})

test('failed downloads leave no files behind', async t => {
  useFakeTools(t)
  const folder = tempDir(t)
  await assert.rejects(quietYouTube({ folder }).download({ id: 'brokenvideo' }), YasError)
  assert.deepEqual(readdirSync(folder), [])
})

test('download with metadata tags the file and names it after the title', async t => {
  const tools = useFakeTools(t)
  const requests = mockYouTubeFetch(t, jpeg)
  const folder = tempDir(t)
  const seen = []

  const result = await quietYouTube({ folder }).download({
    id: ID,
    addMetadata: true,
    onMetadata: metadata => seen.push(metadata)
  })

  assert.equal(result.filename, 'Whole Lotta Love Remaster')
  assert.equal(result.file, path.join(folder, 'Whole Lotta Love Remaster.mp3'))
  assert.equal(seen[0].id, ID)
  assert.equal(seen[0].artist, 'Led Zeppelin')
  assert.equal(requests[0].url.href, `https://img.youtube.com/vi/${ID}/0.jpg`)

  const { args } = tools.calls('ffmpeg')[0]
  const metadata = args.filter((arg, i) => args[i - 1] === '-metadata')
  assert.deepEqual(metadata, [
    'title=Whole Lotta Love / Remaster?',
    'description=Line one\nLine two',
    'artist=Led Zeppelin',
    'album=Led Zeppelin II',
    `comment=https://www.youtube.com/watch?v=${ID}`
  ])
  assert.ok(args.includes('1:v:0'), 'maps the cover image')
  assert.deepEqual(readdirSync(folder), ['Whole Lotta Love Remaster.mp3'])

  // The video is extracted once; the audio download reuses that info.
  const ytdlpCalls = tools.calls('yt-dlp')
  assert.equal(ytdlpCalls.length, 2)
  assert.ok(ytdlpCalls[0].args.includes('--dump-single-json'))
  assert.ok(ytdlpCalls[1].args.includes('--load-info-json'))
  assert.equal(ytdlpCalls[1].args.some(arg => arg.startsWith('https://')), false)
})

test('download with metadata still saves audio when cover art fails', async t => {
  const tools = useFakeTools(t)
  mockYouTubeFetch(t, () => new Response('nope', { status: 404 }))
  t.mock.method(console, 'error', () => {})

  const result = await quietYouTube({ folder: tempDir(t) }).download({ id: ID, addMetadata: true })
  assert.ok(readFileSync(result.file, 'utf8').startsWith('MP3:'))
  assert.equal(tools.calls('ffmpeg')[0].args.includes('1:v:0'), false)
})

test('getMetadata maps yt-dlp fields', async t => {
  useFakeTools(t)
  assert.deepEqual(await quietYouTube().getMetadata(ID), {
    videoId: ID,
    title: 'Whole Lotta Love / Remaster?',
    description: 'Line one\nLine two',
    song: 'Whole Lotta Love',
    category: 'Music',
    artist: 'Led Zeppelin',
    album: 'Led Zeppelin II',
    videoUrl: `https://www.youtube.com/watch?v=${ID}`,
    imgUrl: `https://img.youtube.com/vi/${ID}/0.jpg`
  })
})

test('search and get require an API key', async t => {
  const requests = mockYouTubeFetch(t, () => assert.fail('should not call the API'))
  const youtube = quietYouTube()
  await assert.rejects(youtube.search({ query: 'led zeppelin' }), { code: 'NO_API_KEY', status: 503 })
  await assert.rejects(youtube.get(ID), { code: 'NO_API_KEY' })
  assert.equal(requests.length, 0)
})

test('search calls the Data API with the key in a header', async t => {
  const requests = mockYouTubeFetch(t, () => Response.json({ items: [{ id: 1 }], nextPageToken: 'CAoQAA' }))
  const youtube = quietYouTube()
  youtube.setKey('secret-key')

  const data = await youtube.search({ query: 'led zeppelin', page: 'CAoQAA' })
  assert.equal(data.nextPageToken, 'CAoQAA')

  const { url, headers } = requests[0]
  assert.equal(url.origin + url.pathname, 'https://www.googleapis.com/youtube/v3/search')
  assert.equal(url.searchParams.get('q'), 'led zeppelin')
  assert.equal(url.searchParams.get('maxResults'), '10')
  assert.equal(url.searchParams.get('pageToken'), 'CAoQAA')
  assert.equal(url.searchParams.has('key'), false)
  assert.equal(headers.get('x-goog-api-key'), 'secret-key')

  // Page tokens don't leak into later searches (a 2.x bug).
  await youtube.search({ query: 'again' })
  assert.equal(requests[1].url.searchParams.has('pageToken'), false)
})

test('search validates its input', async t => {
  mockYouTubeFetch(t, () => assert.fail('should not call the API'))
  const youtube = quietYouTube({ apiKey: 'key' })
  await assert.rejects(youtube.search({ query: '' }), { code: 'INVALID_QUERY' })
  await assert.rejects(youtube.search({ query: 'x'.repeat(201) }), { code: 'INVALID_QUERY' })
  await assert.rejects(youtube.search({ query: 'ok', page: 'bad token!' }), { code: 'INVALID_PAGE' })
})

test('get fetches video details and supports callbacks', async t => {
  const requests = mockYouTubeFetch(t, () => Response.json({ items: [{ id: ID }] }))
  const youtube = quietYouTube({ apiKey: 'key' })
  const data = await new Promise((resolve, reject) => {
    youtube.get(`https://youtu.be/${ID}`, (error, result) => error ? reject(error) : resolve(result))
  })
  assert.equal(data.items[0].id, ID)
  assert.equal(requests[0].url.searchParams.get('id'), ID)
  assert.equal(requests[0].url.searchParams.get('part'), 'snippet,contentDetails,statistics,status')
})

test('API errors are wrapped without exposing the response', async t => {
  mockYouTubeFetch(t, () => Response.json({ error: { message: 'API key not valid' } }, { status: 400 }))
  await assert.rejects(quietYouTube({ apiKey: 'bad' }).get(ID), error => {
    assert.equal(error.message, 'YouTube API request failed')
    assert.equal(error.status, 502)
    assert.equal(error.cause.message, 'API key not valid')
    return true
  })
})

test('setFolder creates the folder', t => {
  const folder = path.join(tempDir(t), 'a', 'b')
  const youtube = quietYouTube()
  youtube.setFolder(folder)
  assert.equal(youtube.audioFolder, folder)
  assert.deepEqual(readdirSync(path.dirname(folder)), ['b'])
})
