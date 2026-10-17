import neostandard from 'neostandard'

export default [
  ...neostandard({}),
  {
    // Tests check for terminal escape and control characters on purpose.
    files: ['test/**/*.js'],
    rules: { 'no-control-regex': 'off' }
  }
]
