module.exports = {
  init
}

function init () {
  const config = require('./config')
  const { crashReporter } = require('electron')

  crashReporter.start({
    productName: config.APP_NAME,
    // Fork: keep local crash dumps (app logs dir) but never upload them to
    // upstream's server (MODERNIZATION.md decision #4).
    submitURL: config.IS_FORK ? undefined : config.CRASH_REPORT_URL,
    uploadToServer: !config.IS_FORK,
    globalExtra: { _companyName: config.APP_NAME },
    compress: true
  })
}
