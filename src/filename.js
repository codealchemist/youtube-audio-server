import sanitize from 'sanitize-filename'

// Most filesystems allow 255 bytes per name. Leave room for ".mp3" and the
// temporary ".<name>.mp3.<uuid>.part" file written while downloading.
const MAX_NAME_BYTES = 200
const graphemes = new Intl.Segmenter()

// Turns a video title into a name that is safe on macOS, Linux and Windows:
// no path separators, reserved characters or names, control characters,
// leading dots (hidden files) or trailing dots and spaces. Falls back to
// `fallback` when nothing usable is left.
export function safeFilename (title, fallback) {
  let name = sanitize(String(title ?? '').normalize('NFC'), { replacement: ' ' })
  name = trim(name.replace(/\s+/g, ' '))

  if (Buffer.byteLength(name) > MAX_NAME_BYTES) {
    let truncated = ''
    for (const { segment } of graphemes.segment(name)) {
      if (Buffer.byteLength(truncated + segment) > MAX_NAME_BYTES) break
      truncated += segment
    }
    name = trim(truncated)
  }

  return name || fallback
}

function trim (name) {
  return name.replace(/^[\s.]+|[\s.]+$/g, '')
}
