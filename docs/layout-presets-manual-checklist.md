# Layout Presets — Manual Test Checklist

The automated suite (`cargo test`, `pnpm smoke:dev`) covers the FFmpeg command
builders, the scene graph, session metadata, and end-to-end recording
finalization for every preset using the test pattern. This checklist covers what
automation cannot: real devices, macOS permissions, live-preview fidelity, and
the feel of dragging.

Run `pnpm dev`, select a screen, a camera, and a microphone in Studio, then work
through each section in the Layout tab.

## Preset switching

- [ ] All four presets are selectable: Screen + camera, Screen only, Camera only, Side-by-side.
- [ ] Camera only and Side-by-side are disabled until a camera is selected, with a hint shown.
- [ ] Preset buttons are disabled while a recording or streaming session is active.
- [ ] Switching a preset updates the live preview within ~1s.

## Screen + camera

- [ ] Live preview shows the camera overlay in the selected corner.
- [ ] Corner, Size, Shape (rect/circle), Fit (fill/fit), Mirror, Margin, Zoom, and Pan each change the live preview.
- [ ] With Edit transforms on, dragging the camera follows the cursor, stays inside the canvas, and does not resize it.
- [ ] Arrow keys nudge the camera; Shift+Arrow nudges further; R resets to the corner/size preset.
- [ ] Changing Corner or Size after a drag snaps the camera back to that preset.
- [ ] Record a short clip and open it: the camera position, shape, and framing match the preview.
- [ ] A circle camera records as a circle, not an ellipse.

## Screen only

- [ ] The Camera framing panel is replaced with a clear "no camera" reason.
- [ ] Recording opens no camera input — macOS does not prompt for camera permission.
- [ ] The recording is just the screen/window, full frame.

## Camera only

- [ ] Only Fit, Mirror, Zoom, and Pan are shown (no Corner/Size/Shape/Margin).
- [ ] Works with Screen Recording permission denied or never granted — recording neither requires nor prompts for screen permission.
- [ ] If camera permission is missing, the state is actionable and non-crashing (health event + test-pattern fallback).
- [ ] The camera fills the frame as a rectangle; Mirror/Fit/Zoom/Pan affect the recorded output.

## Side-by-side

- [ ] Split (50/50, 60/40, 70/30) and Camera side (left/right) controls are shown.
- [ ] The screen takes the larger share for 60/40 and 70/30.
- [ ] Switching Camera side swaps which half holds the camera.
- [ ] Live preview matches the recording; both halves tile the canvas with no gap.

## Recording + streaming parity

- [ ] Each enabled preset records locally and finalizes.
- [ ] Each enabled preset streams (or record + stream) with the same composition — use a local RTMP server if available.
- [ ] The session in the Library shows the correct layout.

## Missing / unavailable devices

- [ ] Deselecting the camera disables Camera only and Side-by-side without crashing.
- [ ] Missing devices surface actionable health events rather than a hard failure.
