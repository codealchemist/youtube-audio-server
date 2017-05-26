#!/usr/bin/env node
const path = require('path')
const express = require('express')
const nofavicon = require('express-no-favicons')
const yt = require('youtube-audio-stream')
const downloader = require('./downloader')
const app = express()

function listen (port, callback = () => {}) {
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

  app.listen(port, callback)
}

module.exports = {listen, downloader}
