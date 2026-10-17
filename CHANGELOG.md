# youtube-audio-server changelog

## v3.0.0

YouTube broke `ytdl-core`, so streaming and downloading stopped working. This
release switches to yt-dlp and modernizes the project.

### Breaking

- Downloads are named after the video title by default, sanitized to work as a
  file name on any OS. Use `--use-id` (`useId: true`) for the 2.x `[videoId].mp3` names.
- Requires Node.js 24 or newer, plus [yt-dlp](https://github.com/yt-dlp/yt-dlp)
  and [Deno](https://deno.com) installed on the system (in addition to ffmpeg).
- The package is now an ES module. `require()` still works on Node.js 24.
- Invalid video ids get a `400`. Errors are returned as JSON (`{ "error": "..." }`)
  with a meaningful status instead of a bare `500`.
- `search` and `get` without an API key fail with an error (the server returns
  `503`) instead of calling back with nothing.
- `/chunk` and `/cache` now serve files from a disk cache. `/cache` is an alias of `/chunk`.
- The `cache` option of `downloader.download` is ignored.
- Removed the Heroku buildpack files. Use the Docker image instead.

### Added

- Promise support: `get`, `search` and `download` return promises when no callback is given.
- `createApp()` to mount the Express app in your own server, and `parseVideoId()`.
- Cover art is saved as ID3 metadata with `-m`.
- `--use-id` / `useId` to name downloads after the video id.
- Streams and downloads retry once when YouTube intermittently refuses the audio URL (HTTP 403).
- `YAS_MAX_JOBS`, `YAS_MAX_DURATION`, `YAS_DOWNLOAD_TIMEOUT`, `YAS_CACHE_DIR`, `YAS_CACHE_MAX_FILES`, `HOST`, `YTDLP_PATH`,
  `FFMPEG_PATH` and `YTDLP_JS_RUNTIMES` settings.
- Test suite (`npm test`, `npm run test:live`) and GitHub Actions CI.

### Fixed

- `--file` was ignored when downloading without metadata.
- Long titles could produce file names over the 255-byte filesystem limit.
- Streams leaked yt-dlp/ffmpeg processes when clients disconnected.
- Stream errors could crash the server.
- Search page tokens leaked into later searches.
- Metadata tags were saved with literal quotes around values.
- Failed downloads left partial files behind.
- The CLI exited with status 0 on errors.

### Security

- yt-dlp only receives validated ids, ignores host config files and is limited to
  YouTube extractors. Concurrent jobs are capped.
- Removed all 51 vulnerable dependencies; replaced `ytdl-core`, `fluent-ffmpeg`,
  `youtube-node`, `download`, `through2`, `mkdirp`, `chalk`, `ora`, `minimist` and
  `express-no-favicons` with Node.js built-ins.
- Security headers, including a strict Content-Security-Policy, and no `X-Powered-By`.
- The API key is sent in a header instead of the URL.
- The Docker image runs as a non-root user with pinned, checksum-verified tools.

## v2.8.2

### Removed

- Removed engines from package.json.

## v2.8.1

### Fixed

- Using folder configured with `setFolder` to save temp files.

## v2.8.0

### Added

- `setFolder` to optionally set the folder were content will be downloaded.

## v2.7.1

### Fixed

- Handling temp file errors

## v2.7.0

### Added

- `onMetadata` callback for `downloader`
- Returning `filename` on `onSuccess` response

## v2.6.1

### Fixed

- Avoid saving empty metadata

## v2.6.0

### Added

- metadata support

## v2.3.0

### Added

- /cache/[videoId] endpoint: Returns the same stream for requested audio
  until processing finishes.
- `/chunk/[videoId]`: Saves mp3 file to disk and returns a stream to it
  with chunks supports.

### Fixed

- Killing ffmpeg when processing finishes.

## v2.2.0

### Added

- setKey method to allow setting YouTube API key programatically.

## v2.1.5

### Fixed

- Bug #12: Downloading video file instead of just audio.
