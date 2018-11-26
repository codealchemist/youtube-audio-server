# youtube-audio-server changelog

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
