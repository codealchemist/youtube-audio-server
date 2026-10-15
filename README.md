# youtube-audio-server

Easily stream and download audio from YouTube.

[![CI](https://github.com/codealchemist/youtube-audio-server/actions/workflows/ci.yml/badge.svg)](https://github.com/codealchemist/youtube-audio-server/actions/workflows/ci.yml)

<a href="https://www.buymeacoffee.com/codealchemist" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-black.png" alt="Buy Me A Coffee" width="150px"></a>

## Requirements

- [Node.js](https://nodejs.org) 24 or newer.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) to fetch audio from YouTube.
- [Deno](https://deno.com), which yt-dlp uses to run YouTube's player code in a sandbox.
- [ffmpeg](https://ffmpeg.org) to convert audio to mp3.

These are system tools, not node dependencies.

### macOS

`brew install yt-dlp deno ffmpeg`

If Homebrew has no prebuilt packages for your Mac, download `yt-dlp_macos` from the
[yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) and Deno from the
[Deno releases](https://github.com/denoland/deno/releases) instead.

### Debian / Ubuntu

```
sudo apt-get install ffmpeg
curl -fsSL https://deno.land/install.sh | sh
```

Then download `yt-dlp_linux` from the [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases).
Distribution packages of yt-dlp are usually too old to work with YouTube.

**Keep yt-dlp up to date** (`yt-dlp -U` for the standalone build). YouTube changes
often, and old versions stop working.

## Install

`npm install -g youtube-audio-server`

Or:

`npm install youtube-audio-server`

## Docker

```
docker build -t youtube-audio-server .
docker run --read-only --tmpfs /tmp -p 8080:8080 youtube-audio-server
```

To download from the command line, pass the CLI arguments. Files are saved to
`/downloads`:

```
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/downloads" youtube-audio-server --id HQmmM_qwG4k -m
```

The image includes pinned, checksum-verified yt-dlp, Deno and ffmpeg. It runs as an
unprivileged user on port 8080. Rebuild it with a newer `YTDLP_VERSION` when YouTube
changes break downloads.

## Search and metadata

**IMPORTANT:** To be able to search and get video metadata you need to start the app passing your
Google App KEY.

Your Google App needs to have the YouTube Data API v3 enabled.

Login at https://console.cloud.google.com to get this data.

To support these features, _YAS_ should be started like this:

`KEY=[YOUR-APP-KEY] yas`

If you use **YAS** programmatically you need to ensure the `KEY` environment var
is set, or you can also set it using the `setKey` method:

```js
import { setKey } from 'youtube-audio-server'

setKey('YOUR-KEY')
```

Streaming and downloading don't need a key.

## Command line usage

### REST API

Start **YAS** with `yas`.

#### Audio stream

Just hit the server passing a YouTube video id, like:

http://yourServerAddress:port/[videoId]

For example:

http://localhost:4000/HQmmM_qwG4k

This will stream the requested video's audio as mp3.

You can play it on an HTML5 audio tag or however you like.

**Other endpoints:**

- `/chunk/[videoId]`: Saves the mp3 to a disk cache and serves it with range
  support, so clients like Chrome and VLC can seek. Concurrent requests for the
  same video share one download, and later requests are served from the cache.
- `/cache/[videoId]`: Same as `/chunk`, kept for compatibility.

#### Get metadata

Use: http://yourServerAddress:port/get/[videoId]

#### Search

Use: http://yourServerAddress:port/search/[query]/[[pageToken]]

To navigate pages you need to use `pageToken` which is provided in the results on the
root level property `nextPageToken`.

#### Errors

Errors are returned as JSON with an HTTP status, like `{ "error": "Video unavailable" }`:

- `400`: Invalid video id, search query or page token.
- `404`: Video unavailable (removed, private or age-restricted).
- `422`: Video longer than `YAS_MAX_DURATION`, or a live stream.
- `502`: YouTube or the YouTube API failed.
- `503`: Too many audio jobs running, or search/metadata used without a `KEY`.
- `504`: A `/chunk` download took longer than `YAS_DOWNLOAD_TIMEOUT`.

### Configuration

| Environment variable | Default | Description |
| --- | --- | --- |
| `PORT` | `80` | Port to listen on. Also `-p` / `--port`. |
| `HOST` | all interfaces | Address to listen on, e.g. `127.0.0.1`. |
| `KEY` | | YouTube Data API key for search and metadata. |
| `YAS_MAX_JOBS` | `4` | Audio requests processed at once. More get a `503`. |
| `YAS_CACHE_DIR` | `[tmp]/youtube-audio-server` | Folder for `/chunk` and `/cache` files. |
| `YAS_CACHE_MAX_FILES` | `20` | Cached files kept; the oldest are deleted. |
| `YAS_DOWNLOAD_TIMEOUT` | `1800` | Seconds before a `/chunk` download is stopped (`504`). |
| `YAS_MAX_DURATION` | no limit | Longest video allowed, in seconds. Also rejects live streams. Longer videos get a `422`. |
| `YTDLP_PATH` | `yt-dlp` | Path to yt-dlp. |
| `FFMPEG_PATH` | `ffmpeg` | Path to ffmpeg. |
| `YTDLP_JS_RUNTIMES` | | Passed to yt-dlp's `--js-runtimes`, e.g. `node` if Deno isn't installed. |

### Change port:

Default is 80.

You can easily change it by starting **YAS** like:

`PORT=8080 yas`

Or, you can set the port using args:

`yas -p 8080` or `yas --port 8080`

### Download audio

**YAS** can also be used to easily download audio.

In this mode, the server is not started.

**Usage:**

`yas --id [youtube-video-id|youtube-video-url] [--file [./sample.mp3]]`

**With metadata:**

`yas --id 2zYDMN4h2hY -m`

Use `-m` or `--metadata` to retrieve and persist metadata as ID3 tags, naming your file with the video title by default.

Saved ID3 tags:

- title
- description
- artist
- album
- comment: video URL
- cover art

**Other examples:**

```
yas --id 2zYDMN4h2hY --file ~/Downloads/Music/sample.mp3
yas --id 2zYDMN4h2hY
yas --id https://www.youtube.com/watch?v=2zYDMN4h2hY
```

**NOTE:**

FILE defaults to `./[videoId].mp3` when not set.

**Alternative method:**

If you have a server instance running and you want to use it to download audio,
you can do this:

`curl [your-server-url]/[youtube-video-id] > sample.mp3`

## Programmatic usage

Yeah, you can also include **YAS** in your project and use it programmatically!

**YAS** is an ES module. From CommonJS, `require('youtube-audio-server')` works too
on Node.js 24.

Methods that take a callback also return a promise when you leave it out.

### REST API

```js
import { listen } from 'youtube-audio-server'

// Start listener (REST API).
const port = 7331
listen(port, () => {
  console.log(`Listening on port http://localhost:${port}.`)
})
```

`listen` returns the Node.js HTTP server. To mount **YAS** in your own server, use
`createApp()`, which returns the Express app.

### Download audio

```js
import { downloader } from 'youtube-audio-server'

const id = 'HQmmM_qwG4k' // "Whole Lotta Love" by Led Zeppelin.
const file = 'whole-lotta-love.mp3'
console.log(`Downloading ${id} into ${file}...`)
downloader
  .setFolder('some/folder') // Optionally set a folder for downloaded content.
  .onSuccess(({ id, file }) => {
    console.log(`Yay! Audio (${id}) downloaded successfully into "${file}"!`)
  })
  .onError(({ id, file, error }) => {
    console.error(`Sorry, an error occurred when trying to download ${id}`, error)
  })
  .download({ id, file, metadata })
```

Params:

- `id`: Video ID or URL (`HQmmM_qwG4k` or `https://www.youtube.com/watch?v=HQmmM_qwG4k`)
- `file`: Output file; defaults to video id or title when `metadata` is true
- `metadata`: Retrieve and set metadata as ID3 tags

### Get video metadata

```js
import { get } from 'youtube-audio-server'

const data = await get('HQmmM_qwG4k')
```

### Search

```js
import { search } from 'youtube-audio-server'

const data = await search({ query: 'led zeppelin', page: null })
```

To navigate pages you need to use `pageToken` which is provided in the results on the
root level property `data.nextPageToken`.

## Security

- Video ids are validated before anything runs. yt-dlp only ever receives a
  YouTube URL built by **YAS**, ignores config files on the host, and is limited to
  YouTube extractors. It's never run through a shell.
- Audio jobs are capped (`YAS_MAX_JOBS`), and yt-dlp and ffmpeg are stopped as
  soon as a client disconnects. Set `YAS_MAX_DURATION` on public servers so very
  long videos can't fill the disk cache.
- Error responses never include tool output, paths or stack traces.
- There is no authentication or rate limiting. If you expose **YAS** to the internet,
  put it behind a reverse proxy that handles both.

## Testing

Just open the URL of your server instance without specifying a video id.

This will load a test page with an HTML5 audio element that will stream a test video id.

Run `npm test` to lint everything using [neostandard](https://github.com/neostandard/neostandard)
and run the test suite. Tests use stand-ins for yt-dlp and ffmpeg, so they run offline.

Run `npm run test:live` to test against YouTube with the real yt-dlp and ffmpeg.

Enjoy!
