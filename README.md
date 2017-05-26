# youtube-audio-server 
Easily stream and download audio from YouTube.

[![Build Status](https://travis-ci.org/codealchemist/youtube-audio-server.svg?branch=master)](https://travis-ci.org/codealchemist/youtube-audio-server)

[![JavaScript Style Guide](https://cdn.rawgit.com/feross/standard/master/badge.svg)](https://github.com/feross/standard)

## Install
`npm install -g youtube-audio-server`

Or:

`npm install --save youtube-audio-server`


## Command line usage
### REST API

Start **YAS** with `yas`.

Just hit the server passing a YouTube video id, like:

http://yourServerAddress:port/[videoId]

For example:

http://10.1.2.27:4000/HQmmM_qwG4k

This will stream the requested video's audio.

You can play it on an HTML5 audio tag or however you like.

**Change port:**

Default is 80.

You can easily change it by starting **YAS** like:

`PORT=8080 yas`


### Download audio
**YAS** can also be used to easliy download audio.

In this mode, the server is not started.

**Usage:**

`yas --video [youtube-video-id] [--file [./sample.mp3]]`

**Examples:**
```
yas --video 2zYDMN4h2hY --file ~/Downloads/Music/sample.mp3
yas --video 2zYDMN4h2hY
```

**NOTE:** 

FILE defaults to `./youtube-audio.mp3` when not set.

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
```


## Dependencies
The key dependency for *youtube-audio-server* is 
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
