import { describe, expect, it } from 'vitest'

import { isTransientBackendError, shouldToastBackendError } from './backend-transport'

// Plan 024 S1: a permission grant restarts the backend; the transient
// transport strings must not paint red toasts while the badge already shows
// the restart window, but a genuine failure — and a connected-state blip —
// must still surface.
describe('backend transport error classification', () => {
  const transient = [
    'Backend WebSocket is not connected.',
    'Backend connection closed.',
    'Could not connect to the Rust backend.'
  ]

  it('classifies exactly the three BackendClient-minted strings as transient', () => {
    for (const message of transient) {
      expect(isTransientBackendError(message)).toBe(true)
    }
    expect(isTransientBackendError('  Backend connection closed.  ')).toBe(true)
    // The user-gesture pre-check guard is a DIFFERENT string and a different
    // concern — never treat it as a transport transient.
    expect(isTransientBackendError('Backend socket is not connected.')).toBe(false)
    expect(isTransientBackendError('Scene apply failed: invalid layout')).toBe(false)
  })

  it('suppresses transient transport errors only while the socket is not connected', () => {
    for (const message of transient) {
      expect(shouldToastBackendError(message, 'connecting')).toBe(false)
      expect(shouldToastBackendError(message, 'closed')).toBe(false)
      expect(shouldToastBackendError(message, 'failed')).toBe(false)
      expect(shouldToastBackendError(message, 'waiting')).toBe(false)
      // A transient string while CONNECTED is a real blip — toast it (once, keyed).
      expect(shouldToastBackendError(message, 'connected')).toBe(true)
    }
  })

  it('always toasts a genuine RPC error, at any status', () => {
    for (const status of ['waiting', 'connecting', 'connected', 'failed', 'closed'] as const) {
      expect(shouldToastBackendError('Scene apply failed: invalid layout', status)).toBe(true)
    }
  })
})
