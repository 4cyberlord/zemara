# OBS Parity Source Map

This document records OBS Studio files used as behavioral references for Videorc's independent OBS-parity implementation.

Do not copy OBS GPL source code into Videorc unless the product deliberately adopts a GPL-compatible licensing path. These links are for architecture, behavior, semantics, and acceptance criteria.

## Microphone And Audio Timing

- [plugins/mac-capture/mac-audio.c](https://github.com/obsproject/obs-studio/blob/master/plugins/mac-capture/mac-audio.c)
  - CoreAudio HAL input capture behavior.
  - Device UID/default-device handling.
  - Audio callback capture and host-time timestamps.
  - Raw PCM handoff to OBS source output.
- [libobs/obs-source.h](https://github.com/obsproject/obs-studio/blob/master/libobs/obs-source.h)
  - Source contracts for audio/video output.
- [libobs/obs-source.c](https://github.com/obsproject/obs-studio/blob/master/libobs/obs-source.c)
  - Audio source timing, resampling/remixing boundaries, source volume, and sync behavior.

Videorc implementation target:

- native CoreAudio microphone capture,
- 48 kHz float32 internal audio,
- backend-owned audio ring buffer,
- manual source gain/mute/meter,
- no automatic normalizer, limiter, compressor, speech filter, or mic monitoring in v1.

## Screen And Window Capture

- [plugins/mac-capture/mac-sck-video-capture.m](https://github.com/obsproject/obs-studio/blob/master/plugins/mac-capture/mac-sck-video-capture.m)
  - ScreenCaptureKit display/window capture behavior.
- [plugins/mac-capture/mac-sck-audio-capture.m](https://github.com/obsproject/obs-studio/blob/master/plugins/mac-capture/mac-sck-audio-capture.m)
  - ScreenCaptureKit system audio reference for later phases.
- [plugins/mac-capture/mac-sck-common.h](https://github.com/obsproject/obs-studio/blob/master/plugins/mac-capture/mac-sck-common.h)
  - Shared ScreenCaptureKit capture concepts.
- [plugins/mac-capture/window-utils.m](https://github.com/obsproject/obs-studio/blob/master/plugins/mac-capture/window-utils.m)
  - Window identity and utility behavior.

Videorc implementation target:

- ScreenCaptureKit display capture,
- ScreenCaptureKit window capture,
- cursor toggle,
- hide Videorc window toggle,
- permission-aware failure states,
- app capture and system audio later.

## Camera Capture

- [plugins/mac-avcapture/OBSAVCapture.m](https://github.com/obsproject/obs-studio/blob/master/plugins/mac-avcapture/OBSAVCapture.m)
  - AVFoundation camera session, device, format, FPS, and sample-buffer behavior.
- [plugins/mac-avcapture/plugin-main.m](https://github.com/obsproject/obs-studio/blob/master/plugins/mac-avcapture/plugin-main.m)
  - macOS camera source registration behavior.

Videorc implementation target:

- AVFoundation camera capture,
- device unique ID selection,
- preset mode,
- explicit format/FPS mode where practical,
- camera as a normal scene source.

## Preview And Scene Rendering

- [libobs/obs-view.c](https://github.com/obsproject/obs-studio/blob/master/libobs/obs-view.c)
  - OBS view behavior for rendering scene output.
- [libobs/obs-video.c](https://github.com/obsproject/obs-studio/blob/master/libobs/obs-video.c)
  - Video/render loop behavior.
- [libobs/obs-display.c](https://github.com/obsproject/obs-studio/blob/master/libobs/obs-display.c)
  - Display/preview output behavior.
- [libobs/graphics/texture-render.c](https://github.com/obsproject/obs-studio/blob/master/libobs/graphics/texture-render.c)
  - Render-to-texture behavior.

Videorc implementation target:

- backend-owned scene graph,
- native preview surface/window hosted by Electron,
- React overlay handles for transform editing,
- preview and recording as separate consumers of the same scene graph,
- no raw frames over Electron IPC,
- MJPEG/local HTTP as fallback/debug only during migration.

## Recording, Encoding, And Muxing

- [plugins/obs-ffmpeg/obs-ffmpeg-mux.c](https://github.com/obsproject/obs-studio/blob/master/plugins/obs-ffmpeg/obs-ffmpeg-mux.c)
  - FFmpeg muxing behavior.
- [plugins/obs-ffmpeg/obs-ffmpeg-output.c](https://github.com/obsproject/obs-studio/blob/master/plugins/obs-ffmpeg/obs-ffmpeg-output.c)
  - FFmpeg output behavior.
- [plugins/obs-ffmpeg/ffmpeg-mux/ffmpeg-mux.c](https://github.com/obsproject/obs-studio/blob/master/plugins/obs-ffmpeg/ffmpeg-mux/ffmpeg-mux.c)
  - Packet muxing/finalization behavior.

Videorc implementation target:

- separate capture, render, encode, and mux stages,
- FFmpeg downstream encoder/muxer first,
- MKV-first recording,
- optional MP4 remux after stop,
- reliable stop/finalization states.

## UI And Diagnostics Behavior

OBS is the behavior reference for:

- source lists,
- source order,
- mixer row essentials,
- source volume/mute/meter,
- transform handles,
- reset transform,
- dropped/skipped frame stats,
- capture/render/encoder health.

Videorc implementation target:

- shadcn UI over Videorc domain objects,
- Studio remains recording-first,
- Layout owns deeper transform editing,
- Diagnostics tab owns detailed stats,
- Outputs tab owns remux and output file controls.
