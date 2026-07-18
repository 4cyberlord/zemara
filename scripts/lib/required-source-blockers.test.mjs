// Run: node --test scripts/lib/required-source-blockers.test.mjs
import assert from 'node:assert/strict'
import test from 'node:test'

import { requiredSourceBlocker } from './required-source-blockers.mjs'

test('allows an override only when the selected device is actually available', () => {
  assert.equal(
    requiredSourceBlocker(
      'microphone',
      device('microphone:coreaudio:99', 'MacBook Pro Microphone', 'available'),
      {
        override: 'microphone:coreaudio:99',
        disableHint: 'VIDEORC_BASELINE_NO_MIC=1'
      }
    ),
    null
  )
})

test('blocks stale forced microphone overrides', () => {
  assert.match(
    requiredSourceBlocker('microphone', device('microphone:coreaudio:98', '(forced)', 'forced'), {
      override: 'microphone:coreaudio:98',
      disableHint: 'VIDEORC_BASELINE_NO_MIC=1'
    }),
    /microphone .* is forced/
  )
})

test('can intentionally allow missing forced screen overrides', () => {
  assert.equal(
    requiredSourceBlocker('screen', device('screen:screencapturekit:99', '(forced)', 'forced'), {
      override: 'screen:screencapturekit:99',
      requiredPrefix: 'screen:screencapturekit:',
      allowForcedOverride: true,
      disableHint: 'VIDEORC_BASELINE_NO_SCREEN=1'
    }),
    null
  )
})

test('blocks forced legacy screen overrides for real screen recording gates', () => {
  assert.match(
    requiredSourceBlocker('screen', device('screen:avfoundation:1', '(forced)', 'forced'), {
      override: 'screen:avfoundation:1',
      requiredPrefix: 'screen:screencapturekit:',
      allowForcedOverride: true,
      disableHint: 'VIDEORC_BASELINE_NO_SCREEN=1'
    }),
    /not a native ScreenCaptureKit source/
  )
})

test('disabled sources do not block the run', () => {
  assert.equal(
    requiredSourceBlocker('microphone', null, {
      disabled: true,
      disableHint: 'VIDEORC_BASELINE_NO_MIC=1'
    }),
    null
  )
})

function device(id, name, status) {
  return { id, name, kind: 'microphone', status }
}
