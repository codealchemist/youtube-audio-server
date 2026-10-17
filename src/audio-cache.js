import { mkdir, readdir, rm, stat, utimes } from 'node:fs/promises'
import path from 'node:path'

// Small on-disk cache of converted mp3 files, keyed by video id, used by the
// seekable endpoints. Concurrent requests for the same video share a single
// download, and the oldest files are removed beyond `maxFiles`.
//
// `produce(id, file)` must write `file` atomically (as YouTube.saveAudio does),
// so a file that exists is always complete.
export class AudioCache {
  constructor ({ dir, maxFiles = 20, produce }) {
    this.dir = path.resolve(dir)
    this.maxFiles = maxFiles
    this.produce = produce
    this.inFlight = new Map()
    this.inUse = new Map()
  }

  // `id` must already be validated: it becomes part of a file name. Returns the
  // file and a `release` to call once it has been sent; until then prune()
  // won't delete it.
  async get (id) {
    this.inUse.set(id, (this.inUse.get(id) || 0) + 1)
    const release = () => {
      const count = this.inUse.get(id) - 1
      if (count) this.inUse.set(id, count)
      else this.inUse.delete(id)
    }

    try {
      return { file: await this.#find(id), release }
    } catch (error) {
      release()
      throw error
    }
  }

  async #find (id) {
    const file = path.join(this.dir, `${id}.mp3`)
    if (!this.inFlight.has(id) && await exists(file)) {
      const now = new Date()
      await utimes(file, now, now).catch(() => {})
      return file
    }

    // Checked after the await too: a fill may have started meanwhile.
    if (!this.inFlight.has(id)) {
      this.inFlight.set(id, this.#fill(id, file).finally(() => this.inFlight.delete(id)))
    }
    return this.inFlight.get(id)
  }

  async #fill (id, file) {
    await mkdir(this.dir, { recursive: true })
    await this.produce(id, file)
    await this.prune()
    return file
  }

  async prune () {
    const names = (await readdir(this.dir)).filter(name => name.endsWith('.mp3'))
    if (names.length <= this.maxFiles) return

    const files = await Promise.all(names.map(async name => {
      const file = path.join(this.dir, name)
      const { mtimeMs } = await stat(file).catch(() => ({ mtimeMs: 0 }))
      return { id: path.basename(name, '.mp3'), file, mtimeMs }
    }))
    files.sort((a, b) => b.mtimeMs - a.mtimeMs)
    const expired = files.slice(this.maxFiles).filter(({ id }) => !this.inUse.has(id))
    await Promise.all(expired.map(({ file }) => rm(file, { force: true })))
  }
}

async function exists (file) {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}
