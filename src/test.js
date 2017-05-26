const yas = require('./index')

// Download video.
const video = 'HQmmM_qwG4k' // "Whole Lotta Love" by Led Zeppelin.
const file = 'whole-lotta-love.mp3'
console.log(`Downloading ${video} into ${file}...`)
yas.downloader
  .onSuccess(({video, file}) => {
    console.log(`Yay! Video (${video}) downloaded successfully into "${file}"!`)
  })
  .onError(({video, file, error}) => {
    console.error(`Sorry, an error ocurred when trying to download ${video}`, error)
  })
  .download({video, file})

// Start listener (REST API).
const port = 7331
yas.listen(port, () => {
  console.log(`Listening on port http://localhost:${port}.`)
})
