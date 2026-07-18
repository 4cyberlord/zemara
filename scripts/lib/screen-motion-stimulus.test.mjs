// Run: node --test scripts/lib/screen-motion-stimulus.test.mjs

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  macApplicationNameFromPath,
  stimulusVisibilityFromRgb,
  stimulusWindowOptionsFromDisplayBounds,
} from './screen-motion-stimulus.mjs'

describe('stimulusWindowOptionsFromDisplayBounds', () => {
  it('places the stimulus inside a non-primary display with negative y bounds', () => {
    assert.deepEqual(
      stimulusWindowOptionsFromDisplayBounds({ x: 1512, y: -56, width: 1920, height: 1080 }),
      { x: 1528, y: -40, width: 1888, height: 1048 }
    )
  })

  it('keeps a usable minimum window for small or odd display bounds', () => {
    assert.deepEqual(
      stimulusWindowOptionsFromDisplayBounds({ x: 0, y: 0, width: 400, height: 300 }),
      { x: 16, y: 16, width: 640, height: 480 }
    )
  })
})

describe('macApplicationNameFromPath', () => {
  it('extracts the macOS app bundle name from a browser executable path', () => {
    assert.equal(
      macApplicationNameFromPath('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      'Google Chrome'
    )
  })

  it('returns null for non-app paths', () => {
    assert.equal(macApplicationNameFromPath('/usr/bin/chromium'), null)
  })
})

describe('stimulusVisibilityFromRgb', () => {
  it('passes when the screenshot contains the full stimulus color signature', () => {
    const verdict = stimulusVisibilityFromRgb(
      rgbPixels([
        [0, 0, 0],
        [255, 255, 255],
        [255, 43, 43],
        [49, 255, 116],
        [29, 111, 255],
        [0, 229, 255],
        [255, 43, 214],
        [255, 232, 74],
      ]),
      { minimumColorPixels: 2, minimumColorRatio: 0 }
    )

    assert.equal(verdict.visible, true)
    assert.deepEqual(verdict.missingColors, [])
  })

  it('fails when key stimulus colors are missing', () => {
    const verdict = stimulusVisibilityFromRgb(
      rgbPixels([
        [0, 0, 0],
        [255, 255, 255],
        [29, 111, 255],
      ]),
      { minimumColorPixels: 2, minimumColorRatio: 0 }
    )

    assert.equal(verdict.visible, false)
    assert.match(verdict.reason, /missing required stimulus color signature/)
    assert.ok(verdict.missingColors.includes('cyan'))
    assert.ok(verdict.missingColors.includes('magenta'))
    assert.ok(verdict.missingColors.includes('yellow'))
  })

  it('passes when one supporting patch color is lost to screenshot color management', () => {
    const verdict = stimulusVisibilityFromRgb(
      rgbPixels([
        [0, 0, 0],
        [255, 255, 255],
        [255, 43, 43],
        [29, 111, 255],
        [0, 229, 255],
        [255, 43, 214],
        [255, 232, 74],
      ]),
      { minimumColorPixels: 2, minimumColorRatio: 0 }
    )

    assert.equal(verdict.visible, true)
    assert.deepEqual(verdict.missingColors, ['green'])
  })
})

function rgbPixels(colors) {
  const bytes = []
  for (const color of colors) {
    for (let index = 0; index < 3; index += 1) bytes.push(...color)
  }
  return Buffer.from(bytes)
}
