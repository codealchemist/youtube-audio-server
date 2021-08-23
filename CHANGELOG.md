# youtube-audio-server changelog

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
