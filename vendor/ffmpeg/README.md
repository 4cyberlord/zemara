# Bundled FFmpeg

Videorc packages FFmpeg as a separate executable resource for public macOS builds.

The bundle must be built without `--enable-gpl` and without `--enable-nonfree`. The build script stages the current architecture at:

```text
vendor/ffmpeg/current/
```

That directory is intentionally ignored by git. Build it locally or in CI with:

```sh
pnpm ffmpeg:build:macos
```

The staged bundle includes:

- `bin/ffmpeg`
- `NOTICE.txt`
- `SOURCE.txt`
- `BUILD-CONFIG.txt`
- FFmpeg LGPL license texts and upstream license overview from the exact source archive

Do not commit generated FFmpeg binaries to this repository. Release artifacts should include the staged bundle as an Electron extra resource.
