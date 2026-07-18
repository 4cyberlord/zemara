// Run: node --test scripts/lib/source-selection.test.mjs

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pickDevice } from './source-selection.mjs'

const nativePrefix = 'screen:screencapturekit:'

describe('pickDevice', () => {
  it('keeps the original native-first behavior when no minimum dimensions are requested', () => {
    const device = pickDevice(
      [
        screen('screen:avfoundation:1', 'Fallback Display', 3840, 2160),
        screen('screen:screencapturekit:1', 'Built-in Display', 1512, 982),
        screen('screen:screencapturekit:3', '4K Display', 3840, 2160)
      ],
      'screen',
      { nativePrefix }
    )

    assert.equal(device.id, 'screen:screencapturekit:1')
  })

  it('selects a native 4K display over the first smaller native display for 4K baselines', () => {
    const device = pickDevice(
      [
        screen('screen:screencapturekit:1', 'Built-in Display', 3024, 1964),
        screen('screen:screencapturekit:3', '4K Display', 3840, 2160)
      ],
      'screen',
      { nativePrefix, minimumWidth: 3840, minimumHeight: 2160 }
    )

    assert.equal(device.id, 'screen:screencapturekit:3')
  })

  it('uses the smallest display that satisfies the requested dimensions', () => {
    const device = pickDevice(
      [
        screen('screen:screencapturekit:7', '5K Display', 5120, 2880),
        screen('screen:screencapturekit:3', '4K Display', 3840, 2160)
      ],
      'screen',
      { nativePrefix, minimumWidth: 3840, minimumHeight: 2160 }
    )

    assert.equal(device.id, 'screen:screencapturekit:3')
  })

  it('falls back to the largest native source below the requested dimensions', () => {
    const device = pickDevice(
      [
        screen('screen:screencapturekit:1', 'Built-in Display', 1512, 982),
        screen('screen:screencapturekit:3', 'External Display', 1920, 1080)
      ],
      'screen',
      { nativePrefix, minimumWidth: 3840, minimumHeight: 2160 }
    )

    assert.equal(device.id, 'screen:screencapturekit:3')
  })

  it('respects disabled and forced source overrides', () => {
    assert.equal(
      pickDevice([screen('screen:screencapturekit:1', 'Display 1')], 'screen', { disabled: true }),
      null
    )
    assert.deepEqual(pickDevice([], 'screen', { override: 'screen:screencapturekit:99' }), {
      id: 'screen:screencapturekit:99',
      name: '(forced)',
      kind: 'screen',
      status: 'forced'
    })
  })

  it('can require native ScreenCaptureKit screens instead of falling back to AVFoundation', () => {
    const device = pickDevice([screen('screen:avfoundation:1', 'Capture screen 0')], 'screen', {
      nativePrefix,
      requireNative: true
    })

    assert.equal(device, null)
  })
})

function screen(id, name, width, height) {
  return {
    id,
    name,
    kind: 'screen',
    status: 'available',
    width,
    height
  }
}
