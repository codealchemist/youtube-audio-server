// YouTube video ids are always 11 characters from this alphabet. Anything we
// pass to yt-dlp goes through here first, so user input never reaches it raw.
const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'youtube-nocookie.com'])

export function isVideoId (value) {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

// Accepts a bare id or a YouTube URL (watch, youtu.be, shorts, embed, live)
// and returns the video id, or null when the input isn't one.
export function parseVideoId (input) {
  if (typeof input !== 'string') return null
  const value = input.trim()
  if (isVideoId(value)) return value

  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let candidate = null
  if (host === 'youtu.be') {
    candidate = url.pathname.split('/')[1]
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch') {
      candidate = url.searchParams.get('v')
    } else {
      const match = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/)
      if (match) candidate = match[1]
    }
  }

  return isVideoId(candidate) ? candidate : null
}

export function videoUrl (id) {
  return `https://www.youtube.com/watch?v=${id}`
}
