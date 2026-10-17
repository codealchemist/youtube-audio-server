// Errors carry an HTTP status and a message that is safe to show to clients.
// Details from yt-dlp, ffmpeg or the YouTube API stay in `cause` for logs.
export class YasError extends Error {
  constructor (message, { status = 500, code = 'INTERNAL', cause } = {}) {
    super(message, { cause })
    this.name = 'YasError'
    this.status = status
    this.code = code
  }
}

export function invalidVideoId () {
  return new YasError('Invalid YouTube video id or URL', { status: 400, code: 'INVALID_ID' })
}
