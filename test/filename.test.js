import assert from 'node:assert/strict'
import { test } from 'node:test'
import { safeFilename } from '../src/filename.js'

const ID = 'HQmmM_qwG4k'

test('keeps ordinary titles as they are', () => {
  assert.equal(safeFilename('Led Zeppelin - Whole Lotta Love (Official Music Video)', ID),
    'Led Zeppelin - Whole Lotta Love (Official Music Video)')
  assert.equal(safeFilename('Sigur Rós – Hoppípolla 🎵', ID), 'Sigur Rós – Hoppípolla 🎵')
})

test('replaces characters that are invalid in file names', () => {
  assert.equal(safeFilename('AC/DC - Back In Black', ID), 'AC DC - Back In Black')
  assert.equal(safeFilename('What? Why: "Because" <No> | *Yes*\\', ID), 'What Why Because No Yes')
  assert.equal(safeFilename('Line one\nLine\ttwo\u0000\u001f', ID), 'Line one Line two')
})

test('cannot escape the target folder', () => {
  for (const title of ['../../etc/passwd', '..', '.', '/', '\\..\\..\\Windows']) {
    const name = safeFilename(title, ID)
    assert.doesNotMatch(name, /[/\\]/, title)
    assert.notEqual(name, '..')
    assert.notEqual(name, '.')
  }
})

test('removes escape sequences and bidi characters that could disguise a name', () => {
  assert.equal(safeFilename('\u001b[31mRed\u001b[0m Song', ID), 'Red Song')
  assert.equal(safeFilename('invoice\u202egpj.exe', ID), 'invoice gpj.exe')
})

test('removes leading dots and trailing dots or spaces', () => {
  assert.equal(safeFilename('.hidden track', ID), 'hidden track')
  assert.equal(safeFilename('...And Justice for All...', ID), 'And Justice for All')
  assert.equal(safeFilename('  spaced   out  ', ID), 'spaced out')
})

test('falls back when nothing usable is left', () => {
  for (const title of ['', '   ', '???', '...', 'CON', 'nul', undefined, null]) {
    assert.equal(safeFilename(title, ID), ID, String(title))
  }
})

test('normalizes unicode so the same title always gives the same name', () => {
  assert.equal(safeFilename('Café', ID), 'Café')
})

test('caps long titles at 200 bytes without splitting characters', () => {
  const ascii = safeFilename('a'.repeat(500), ID)
  assert.equal(ascii.length, 200)

  const emoji = safeFilename('🎸'.repeat(100), ID)
  assert.ok(Buffer.byteLength(emoji) <= 200)
  assert.equal(emoji, '🎸'.repeat(50))

  const family = '👨‍👩‍👧‍👦' // one grapheme, 25 bytes
  const families = safeFilename(family.repeat(20), ID)
  assert.equal(families, family.repeat(8))

  assert.equal(safeFilename(`${'a'.repeat(199)} b`, ID), 'a'.repeat(199), 'no trailing space after cutting')
})
