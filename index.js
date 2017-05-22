#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const express = require('express')
const nofavicon = require('express-no-favicons')
const yt = require('youtube-audio-stream')
const downloader = require('./downloader')
const app = express()
const port = process.env.PORT || 80

// print ascii art
var artFile = path.join(__dirname, './ascii-art.txt')
var art = fs.readFileSync(artFile, 'utf8')
console.log(art)

function run () {
  // Run downloader.
  // If file download was specified using arguments:
  // yas --video [youtube-video-id] [--file [./sample.mp3]]
  // Will automatially download the file and exit.
  if (downloader()) return

  app.get('/', (req, res) => {
    const file = path.resolve(__dirname, 'index.html')
    res.sendFile(file)
  })

  app.get('/:videoId', (req, res) => {
    const videoId = req.params.videoId
    const url = `//youtube.com/watch?v=${videoId}`

    try {
      yt(url).pipe(res)
    } catch (e) {
      res.sendStatus(500)
    }
  })

  app.use(nofavicon())

  app.use((req, res) => {
    res.sendStatus(404)
  })

  app.listen(port, function () {
    console.log(` 🔈  YOUTUBE AUDIO SERVER listening on port ${port}!`)
    console.log('-'.repeat(80))
  })
}

run()
