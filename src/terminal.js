import { stripVTControlCharacters, styleText } from 'node:util'

// Control characters (C0, DEL, C1) and Unicode bidi overrides/isolates,
// which could move the cursor, recolor or spoof terminal output.
const UNSAFE = / *[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]+ */g // eslint-disable-line no-control-regex

// Makes untrusted text (video titles, request input) safe to print: strips
// ANSI escape sequences and replaces other control characters with a space.
export function terminalSafe (text) {
  return stripVTControlCharacters(String(text ?? '')).replace(UNSAFE, ' ').trim()
}

export function formatBytes (bytes) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${Math.round(bytes / 1e3)} kB`
  return `${Math.round(bytes)} B`
}

export function formatDuration (seconds) {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = n => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

// "Downloading 45% · 3.1 MB of 6.8 MB · 1.2 MB/s · 0:03 left"
export function describeProgress ({ downloaded, total, speed, eta }) {
  if (total && downloaded >= total) return 'Converting to mp3...'
  const parts = [total ? `Downloading ${Math.floor((downloaded / total) * 100)}%` : 'Downloading']
  parts.push(total ? `${formatBytes(downloaded)} of ${formatBytes(total)}` : formatBytes(downloaded))
  if (speed) parts.push(`${formatBytes(speed)}/s`)
  if (eta !== null && eta !== undefined) parts.push(`${formatDuration(eta)} left`)
  return parts.join(' · ')
}

const FRAMES = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'

// A status line redrawn in place on a terminal. `step` shows a stage with a
// spinner and elapsed time; `update` replaces the text (e.g. with download
// progress). When output isn't a terminal, steps print as plain lines and
// updates are skipped, so logs stay readable.
export class ProgressLine {
  constructor (stream = process.stdout) {
    this.stream = stream
    this.tty = Boolean(stream.isTTY)
    this.text = ''
    this.stepStart = null
    this.frame = 0
    this.timer = null
  }

  step (text) {
    if (!this.tty) {
      this.stream.write(`${text}\n`)
      return
    }
    this.stepStart = Date.now()
    this.#show(text)
  }

  update (text) {
    if (!this.tty) return
    this.stepStart = null
    this.#show(text)
  }

  stop () {
    clearInterval(this.timer)
    this.timer = null
    if (this.tty && this.text) this.stream.write('\r\x1b[2K')
    this.text = ''
  }

  #show (text) {
    this.text = text
    if (!this.timer) {
      this.timer = setInterval(() => this.#render(), 100)
      this.timer.unref()
    }
    this.#render()
  }

  #render () {
    const elapsed = this.stepStart === null ? '' : ` ${Math.floor((Date.now() - this.stepStart) / 1000)}s`
    const width = Math.max(10, (this.stream.columns || 80) - 3)
    let text = this.text + elapsed
    if (text.length > width) text = `${text.slice(0, width - 1)}…`
    const frame = FRAMES[this.frame++ % FRAMES.length]
    this.stream.write(`\r\x1b[2K${styleText('cyan', frame)} ${text}`)
  }
}
