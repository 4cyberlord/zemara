import { dirname, resolve } from 'node:path'

export function defaultPackagedAppExecutable({ repoRoot, platform = process.platform } = {}) {
  if (!repoRoot) {
    throw new Error('repoRoot is required.')
  }
  if (platform === 'darwin') {
    return resolve(repoRoot, 'apps/desktop/release/mac-arm64/Videorc.app/Contents/MacOS/Videorc')
  }
  if (platform === 'win32') {
    return resolve(repoRoot, 'apps/desktop/release/win-unpacked/Videorc.exe')
  }
  throw new Error(`Packaged app smoke test does not support ${platform}.`)
}

export function bundledFfmpegPathForPackagedApp({ appExecutable, platform = process.platform } = {}) {
  if (!appExecutable) {
    throw new Error('appExecutable is required.')
  }
  if (platform === 'darwin') {
    return resolve(dirname(appExecutable), '..', 'Resources', 'ffmpeg', 'bin', 'ffmpeg')
  }
  if (platform === 'win32') {
    return resolve(dirname(appExecutable), 'resources', 'ffmpeg', 'bin', 'ffmpeg.exe')
  }
  throw new Error(`Packaged app smoke test does not support ${platform}.`)
}

export function assertPackagedSmokePlatform(platform = process.platform) {
  if (platform !== 'darwin' && platform !== 'win32') {
    throw new Error(`Packaged app smoke test supports macOS and Windows only, not ${platform}.`)
  }
}
