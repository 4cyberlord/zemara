// Standalone one-shot Electron app whose only job is to raise the macOS camera
// permission prompt for THIS automation's host process, so the grant attaches
// here and every app the automation later spawns inherits it.
const { app, systemPreferences, BrowserWindow } = require('electron')

app.whenReady().then(async () => {
  // A visible window makes the app foreground so the TCC prompt is shown.
  const win = new BrowserWindow({ width: 360, height: 160, title: 'Grant camera access' })
  win.loadURL(
    'data:text/html,' +
      encodeURIComponent(
        '<body style="font:14px -apple-system;padding:16px">Requesting camera access…<br>Click <b>Allow</b> on the macOS prompt.</body>'
      )
  )
  win.show()
  app.focus({ steal: true })

  try {
    const before = systemPreferences.getMediaAccessStatus('camera')
    console.log('CAMERA-STATUS before:', before)
    if (before !== 'granted') {
      console.log('>>> Requesting camera access — CLICK ALLOW on the prompt <<<')
      const granted = await systemPreferences.askForMediaAccess('camera')
      console.log('askForMediaAccess returned:', granted)
    }
    const after = systemPreferences.getMediaAccessStatus('camera')
    console.log('CAMERA-STATUS after:', after)
  } catch (e) {
    console.log('error:', e && e.message ? e.message : String(e))
  } finally {
    setTimeout(() => app.quit(), 800)
  }
})

app.on('window-all-closed', () => app.quit())
