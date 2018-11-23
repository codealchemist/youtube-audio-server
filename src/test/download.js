const yas = require('../index')

// Download audio.
const id = 'HQmmM_qwG4k' // "Whole Lotta Love" by Led Zeppelin.
const file = 'whole-lotta-love.mp3'
console.log(`Downloading ${id} into ${file}...`)
yas.downloader
  .onSuccess(({ id, file }) => {
    console.log('-'.repeat(80))
    console.log(`Yay! Audio from ${id} downloaded successfully into "${file}"!`)
  })
  .onError(({ id, file, error }) => {
    console.log('-'.repeat(80))
    console.error(`Sorry, an error ocurred when trying to download ${id}`, error)
  })
  .download({ id, file })
