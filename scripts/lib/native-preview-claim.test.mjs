import assert from 'node:assert/strict'
import test from 'node:test'

import {
  claimsNativePreview,
  formatTransportHonesty,
  strongestPreviewBacking,
  strongestPreviewTransport,
} from './native-preview-claim.mjs'

test('native preview claim requires both native transport and CAMetal backing', () => {
  assert.equal(claimsNativePreview({
    previewTransport: 'native-surface',
    diagnostics: { previewSurfaceBacking: 'electron-browser-window' },
  }), false)

  assert.equal(claimsNativePreview({
    previewTransport: 'electron-proof-surface',
    diagnostics: {
      transports: ['native-surface'],
      previewSurfaceBacking: 'cametal-layer',
    },
  }), true)

  assert.equal(claimsNativePreview({
    previewTransport: 'native-surface',
    diagnostics: { surfaceBackings: ['cametal-layer'] },
  }), true)
})

test('transport honesty summary does not call proof transport native just because polling is zero', () => {
  assert.match(
    formatTransportHonesty({
      previewTransport: 'electron-proof-surface',
      diagnostics: {
        transports: ['electron-proof-surface'],
        previewSurfaceBacking: 'electron-browser-window',
        imagePollDuringSession: { total: 0 },
      },
    }),
    /^NOT native/
  )

  assert.equal(
    formatTransportHonesty({
      previewTransport: 'native-surface',
      diagnostics: {
        transports: ['native-surface'],
        previewSurfaceBacking: 'cametal-layer',
        imagePollDuringSession: { total: 0 },
      },
    }),
    'native (0 image polls)'
  )
})

test('strongest preview status keeps live proof/native evidence over teardown samples', () => {
  assert.equal(
    strongestPreviewTransport(['unavailable', 'electron-proof-surface', 'unavailable']),
    'electron-proof-surface'
  )
  assert.equal(
    strongestPreviewTransport(['electron-proof-surface', 'native-surface']),
    'native-surface'
  )
  assert.equal(
    strongestPreviewBacking(['none', 'electron-browser-window', 'none']),
    'electron-browser-window'
  )
  assert.equal(
    strongestPreviewBacking(['electron-browser-window', 'cametal-layer']),
    'cametal-layer'
  )
})
