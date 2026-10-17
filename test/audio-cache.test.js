import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { AudioCache } from '../src/audio-cache.js'
import { tempDir } from './helpers.js'

function cacheIn (t, options) {
  const produced = []
  const cache = new AudioCache({
    dir: tempDir(t),
    produce: async (id, file) => {
      produced.push(id)
      await writeFile(file, id)
    },
    ...options
  })
  return { cache, produced }
}

test('concurrent gets share one fill and later gets hit the cache', async t => {
  const { cache, produced } = cacheIn(t)
  const results = await Promise.all([cache.get('aaaaaaaaaaa'), cache.get('aaaaaaaaaaa')])
  assert.equal(results[0].file, results[1].file)
  await cache.get('aaaaaaaaaaa')
  assert.deepEqual(produced, ['aaaaaaaaaaa'])
})

test('prune keeps files in use until they are released', async t => {
  const { cache } = cacheIn(t, { maxFiles: 1 })
  const a = await cache.get('aaaaaaaaaaa')
  a.release()
  const b = await cache.get('bbbbbbbbbbb')
  assert.equal(existsSync(a.file), false, 'released and oldest: pruned')

  await cache.get('ccccccccccc')
  assert.equal(existsSync(b.file), true, 'still in use: kept')

  b.release()
  await cache.get('ddddddddddd')
  assert.equal(existsSync(b.file), false)
  assert.equal(readdirSync(cache.dir).length, 2)
})

test('a failed fill is released and not cached', async t => {
  const { cache } = cacheIn(t, { produce: async () => { throw new Error('nope') } })
  await assert.rejects(cache.get('aaaaaaaaaaa'), /nope/)
  assert.equal(cache.inUse.size, 0)
  assert.equal(existsSync(path.join(cache.dir, 'aaaaaaaaaaa.mp3')), false)
})
