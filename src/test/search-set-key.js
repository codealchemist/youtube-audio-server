const yas = require('../index')

// Programatic search.
const apiKey = 'YOUR-KEY-HERE'
yas.setKey(apiKey)
yas.search(
  {
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
  }
)
