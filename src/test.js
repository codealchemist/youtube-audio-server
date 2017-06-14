const yas = require('./index')

// Download audio.
const id = 'HQmmM_qwG4k' // "Whole Lotta Love" by Led Zeppelin.
const file = 'whole-lotta-love.mp3'
console.log(`Downloading ${id} into ${file}...`)
yas.downloader
  .onSuccess(({id, file}) => {
    console.log('-'.repeat(80))
    console.log(`Yay! Audio from ${id} downloaded successfully into "${file}"!`)
  })
  .onError(({id, file, error}) => {
    console.log('-'.repeat(80))
    console.error(`Sorry, an error ocurred when trying to download ${id}`, error)
  })
  .download({id, file})

// Start listener (REST API).
const port = 7331
yas.listen(port, () => {
  console.log(`Listening on port http://localhost:${port}.`)
})

// Get metadata.
yas.get('HQmmM_qwG4k', (err, data) => {
  console.log('-'.repeat(80))
  console.log('GOT METADATA for HQmmM_qwG4k:', data || err)
})

// Search.
yas.search({
  query: 'led zeppelin',
  page: null
},
(err, data) => {
  console.log('-'.repeat(80))
  if (err) {
    console.log('ERROR:', err)
    return
  }

  console.log(`FIRST SEARCH RESULT of ${data.items.length}:`, data.items[0])
})
