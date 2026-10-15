import { listen, createApp } from './server.js'
import downloader from './downloader.js'
import youtube from './youtube.js'

export { listen, createApp, downloader }
export { parseVideoId } from './video-id.js'

export const get = (id, callback) => youtube.get(id, callback)
export const search = ({ query, page } = {}, callback) => youtube.search({ query, page }, callback)
export const setKey = key => youtube.setKey(key)
