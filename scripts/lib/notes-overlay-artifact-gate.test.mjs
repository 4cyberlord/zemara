import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  evaluateNotesOverlayArtifactMetrics,
  measureNotesOverlayMarkerPixelsFromRgb
} from './notes-overlay-artifact-gate.mjs'

describe('notes overlay artifact gate', () => {
  it('passes when sampled frames do not contain the red smoke marker', () => {
    const rgb = Buffer.alloc(4 * 2 * 3 * 2)

    const metrics = measureNotesOverlayMarkerPixelsFromRgb(rgb, { width: 4, height: 2 })
    const verdict = evaluateNotesOverlayArtifactMetrics(metrics)

    assert.equal(metrics.sampledFrames, 2)
    assert.equal(metrics.maxMarkerPixels, 0)
    assert.equal(verdict.pass, true)
  })

  it('fails when a red Notes marker covers part of any sampled frame', () => {
    const rgb = Buffer.alloc(4 * 2 * 3)
    for (let pixel = 0; pixel < 4; pixel += 1) {
      const offset = pixel * 3
      rgb[offset] = 255
      rgb[offset + 1] = 0
      rgb[offset + 2] = 0
    }

    const metrics = measureNotesOverlayMarkerPixelsFromRgb(rgb, { width: 4, height: 2 })
    const verdict = evaluateNotesOverlayArtifactMetrics(metrics, { maxMarkerPixelRatio: 0.1 })

    assert.equal(metrics.maxMarkerPixels, 4)
    assert.equal(metrics.maxMarkerPixelRatio, 0.5)
    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('\n'), /red smoke marker leaked/)
  })

  it('does not count magenta or yellow stimulus colors as the red Notes marker', () => {
    const rgb = Buffer.from([255, 43, 214, 255, 232, 74, 0, 229, 255, 255, 255, 255])

    const metrics = measureNotesOverlayMarkerPixelsFromRgb(rgb, { width: 2, height: 2 })
    const verdict = evaluateNotesOverlayArtifactMetrics(metrics)

    assert.equal(metrics.maxMarkerPixels, 0)
    assert.equal(verdict.pass, true)
  })
})
