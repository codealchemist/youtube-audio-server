const yas = require('../index')

// Start listener (REST API).
const port = 7331
yas.listen(port, () => {
  console.log(`Listening on port http://localhost:${port}.`)
})
