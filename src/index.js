#!/usr/bin/env node

const path = require('path')
const express = require('express')
const nofavicon = require('express-no-favicons')
const youtube = require('./youtube')
const downloader = require('./downloader')
const fetchVideoInfo = require('updated-youtube-info')
const { getCoverArt, writeMeta, getFileName } = require('./utils')
const app = express()

function listen (port, callback = () => {}) {
  app.use(nofavicon())

  app.get('/', (req, res) => {
    const file = path.resolve(__dirname, 'index.html')
    res.sendFile(file)
  })

  app.get('/chunk/:videoId', (req, res) => {
    if (req.headers.range) {
      res.sendStatus(500)
      return
    }
    const videoId = req.params.videoId

    try {
      const fileMetaTask = fetchVideoInfo(videoId).catch((e) => {
        console.error('WARNING: Failed to fetch metadata!', e)
      })

      youtube.download({ id: videoId }, async (err, { id, file }) => {
        if (err) return res.sendStatus(500, err)
        const optionsTask = fileMetaTask.then(getCoverArt)

        const fileName = await fileMetaTask.then(getFileName)
        if (fileName) {
          await writeMeta(
            { id: videoId, file },
            await fileMetaTask,
            await optionsTask
          )
          return res.download(file, fileName)
        }

        res.sendFile(file)
      })
    } catch (e) {
      console.error(e)
      res.sendStatus(500, e)
    }
  })

  app.get('/:videoId', (req, res) => {
    const videoId = req.params.videoId

    try {
      youtube.stream(videoId).pipe(res)
    } catch (e) {
      console.error(e)
      res.sendStatus(500, e)
    }
  })

  app.get('/cache/:videoId', (req, res) => {
    const videoId = req.params.videoId

    try {
      youtube.stream(videoId, true).pipe(res)
    } catch (e) {
      console.error(e)
      res.sendStatus(500, e)
    }
  })

  app.get('/search/:query/:page?', (req, res) => {
    const { query, page } = req.params
    youtube.search({ query, page }, (err, data) => {
      if (err) {
        console.log(err)
        res.sendStatus(500, err)
        return
      }

      res.json(data)
    })
  })

  app.get('/get/:id', (req, res) => {
    const id = req.params.id

    youtube.get(id, (err, data) => {
      if (err) {
        console.log(err)
        res.sendStatus(500, err)
        return
      }

      res.json(data)
    })
  })

  app.use((req, res) => {
    res.sendStatus(404)
  })

  app.listen(port, callback)
}

module.exports = {
  listen,
  downloader,
  get: (id, callback) => youtube.get(id, callback),
  search: ({ query, page }, callback) =>
    youtube.search({ query, page }, callback),
  setKey: (key) => youtube.setKey(key)
}
