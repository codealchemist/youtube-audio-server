# youtube-audio-server

Easily stream and download audio from YouTube.

[![Build Status](https://travis-ci.org/codealchemist/youtube-audio-server.svg?branch=master)](https://travis-ci.org/codealchemist/youtube-audio-server)

[![JavaScript Style Guide](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

<a href="https://www.buymeacoffee.com/codealchemist" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-black.png" alt="Buy Me A Coffee" width="150px"></a>

## Install

`npm install -g youtube-audio-server`

Or:

`npm install --save youtube-audio-server`

## Docker image

https://hub.docker.com/r/codealchemist/youtube-audio-server

## Search and metadata

**IMPORTANT:** To be able to search and get video metadata you need to start the app passing your
Google App KEY.

Your Google App needs to have the YouTube API enabled.

Login at https://console.cloud.google.com to get this data.

To support this features, _YAS_ should be started like this:

`KEY=[YOUR-APP-KEY] yas`

If you use **YAS** programmatically you need to ensure the `KEY` environment var
is set, or since version 2.2.0 you can also set it using the `setKey` method:

```
const yas = require('youtube-audio-server')
yas.setKey('YOUR-KEY')
```

## Running on Heroku

To be able to run **YAS** on Heroku you need to install the **ffmpeg** buildpack:

`heroku buildpacks:add https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git`

## Command line usage

### REST API

Start **YAS** with `yas`.

#### Audio stream

Just hit the server passing a YouTube video id, like:

http://yourServerAddress:port/[videoId]

For example:

http://localhost:4000/HQmmM_qwG4k

This will stream the requested video's audio.

You can play it on an HTML5 audio tag or however you like.

**Other endpoints:**

- `/cache/[videoId]`: Returns the same stream for requested audio
  until processing finishes. Useful to avoid multiple requests from creating
  zombie instances of ffmpeg. This happens in Chrome, which makes a document
  request first and then a media request. The document request makes ffmpeg
  to start processing but never finishes.
  Firefox properly loads the audio with just one request and allows seeking.
- `/chunk/[videoId]`: Saves mp3 file to disk and returns a stream to it.
  This allows data chunks to be sent to the client, which will be able to seek
  across the file. Enables Chrome and VLC, for example, to do seeking.

#### Get metadata

Use: http://yourServerAddress:port/get/[videoId]

#### Search

Use: http://yourServerAddress:port/search/[query]/[[pageToken]]

To navigate pages you need to use `pageToken` which is provided in the results on the
root level property `nextPageToken`.

### Change port:

Default is 80.

You can easily change it by starting **YAS** like:

`PORT=8080 yas`

### Download audio

**YAS** can also be used to easliy download audio.

In this mode, the server is not started.

**Usage:**

`yas --id [youtube-video-id] [--file [./sample.mp3]]`

**Examples:**

```
yas --id 2zYDMN4h2hY --file ~/Downloads/Music/sample.mp3
yas --id 2zYDMN4h2hY
```

**NOTE:**

FILE defaults to `./[videoId].mp3` when not set.

**Alternative method:**

If you have a server instance running and you want to use it to download audio,
you can do this:

`curl [your-server-url]/[youtube-video-id] > sample.mp3`

## Programatic usage

Yeah, you can also include **YAS** in your project and use it programatically!

### REST API

```
const yas = require('youtube-audio-server')

// Start listener (REST API).
const port = 7331
yas.listen(port, () => {
  console.log(`Listening on port http://localhost:${port}.`)
})

```

### Download audio

```
const yas = require('youtube-audio-server')

const id = 'HQmmM_qwG4k' // "Whole Lotta Love" by Led Zeppelin.
const file = 'whole-lotta-love.mp3'
console.log(`Downloading ${id} into ${file}...`)
yas.downloader
  .onSuccess(({id, file}) => {
    console.log(`Yay! Audio (${id}) downloaded successfully into "${file}"!`)
  })
  .onError(({id, file, error}) => {
    console.error(`Sorry, an error ocurred when trying to download ${id}`, error)
  })
  .download({id, file})
```

### Get video metadata

```
const yas = require('youtube-audio-server')

yas.get('HQmmM_qwG4k', (err, data) => {
  console.log('GOT METADATA for HQmmM_qwG4k:', data || err)
})
```

### Search

```
const yas = require('youtube-audio-server')

yas.search({
  query: 'led zeppelin',
  page: null
},
(err, data) => {
  console.log('RESULTS:', data || err)
})
```

To navigate pages you need to use `pageToken` which is provided in the results on the
root level property `data.nextPageToken`.

## Dependencies

The key dependency for _youtube-audio-server_ is
[youtube-audio-stream](https://github.com/JamesKyburz/youtube-audio-stream),
which depends on `ffmpeg`, which must be installed at system level, it's not
a node dependency!

### Install ffmpeg on OSX

`brew install ffmpeg`

### Install ffmpeg on Debian Linux

`sudo apt-get install ffmpeg`

## Testing

Just open the URL of your server instance without specifing a video id.

This will load a test page with an HTML5 audio element that will stream a test video id.

Run `npm test` to lint everything using [StandardJS](https://standardjs.com).

To start the listener and download an audio file use `npm run test-run`.

You can open the shown URL to test the REST API works as expected.

You can also use `npm run test-focus` to concentrate on one linting
issue at a time with the help of [standard-focus](https://www.npmjs.com/package/standard-focus).

Enjoy!
