// Run: node --test scripts/lib/source-preflight.test.mjs

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { evaluateRequired4kSourcePreflight } from './source-preflight.mjs'

const requested4k = { width: 3840, height: 2160, fps: 30 }

describe('evaluateRequired4kSourcePreflight', () => {
  it('passes non-4K requests without requiring 4K source dimensions', () => {
    const result = evaluateRequired4kSourcePreflight(
      { screen: { id: 'screen:screencapturekit:1', name: 'Display 1', width: 1512, height: 982 } },
      { width: 1920, height: 1080, fps: 30 }
    )

    assert.equal(result.pass, true)
    assert.deepEqual(result.failures, [])
  })

  it('passes a 4K ScreenCaptureKit source', () => {
    const result = evaluateRequired4kSourcePreflight(
      { screen: { id: 'screen:screencapturekit:1', name: 'Display 1', width: 3840, height: 2160 } },
      requested4k
    )

    assert.equal(result.pass, true)
    assert.deepEqual(result.failures, [])
  })

  it('fails a 4K request when the selected ScreenCaptureKit display is below 4K', () => {
    const result = evaluateRequired4kSourcePreflight(
      { screen: { id: 'screen:screencapturekit:1', name: 'Built-in Display', width: 1512, height: 982 } },
      requested4k
    )

    assert.equal(result.pass, false)
    assert.match(result.failures.join(' '), /Built-in Display/)
    assert.match(result.failures.join(' '), /1512x982/)
  })

  it('fails a 4K request when the selected screen is not ScreenCaptureKit native', () => {
    const result = evaluateRequired4kSourcePreflight(
      { screen: { id: 'screen:avfoundation:1', name: 'Fallback Display', width: 3840, height: 2160 } },
      requested4k
    )

    assert.equal(result.pass, false)
    assert.match(result.failures.join(' '), /requires a ScreenCaptureKit screen source/)
  })

  it('allows unknown dimensions so forced ids can still run to runtime diagnostics', () => {
    const result = evaluateRequired4kSourcePreflight(
      { screen: { id: 'screen:screencapturekit:42', name: 'Forced Display' } },
      requested4k
    )

    assert.equal(result.pass, true)
    assert.deepEqual(result.failures, [])
  })
})
