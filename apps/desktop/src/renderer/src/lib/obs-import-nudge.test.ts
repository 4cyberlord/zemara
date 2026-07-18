import { describe, expect, it } from 'vitest'

import { shouldShowObsNudge, sourcesConfigured } from './obs-import-nudge'

// O5 (OBS import plan): fresh smoke profiles see the nudge; an established
// profile (any capture source picked) or a dismissal silences it forever.
describe('shouldShowObsNudge', () => {
  it('shows only for a fresh profile with OBS present', () => {
    expect(shouldShowObsNudge({ obsAvailable: true, sources: {}, dismissed: false })).toBe(true)
  })

  it('never nags an established profile', () => {
    expect(
      shouldShowObsNudge({ obsAvailable: true, sources: { screenId: 's' }, dismissed: false })
    ).toBe(false)
    expect(
      shouldShowObsNudge({ obsAvailable: true, sources: { cameraId: 'c' }, dismissed: false })
    ).toBe(false)
    expect(
      shouldShowObsNudge({ obsAvailable: true, sources: { windowId: 'w' }, dismissed: false })
    ).toBe(false)
  })

  it('respects dismissal and OBS absence', () => {
    expect(shouldShowObsNudge({ obsAvailable: true, sources: {}, dismissed: true })).toBe(false)
    expect(shouldShowObsNudge({ obsAvailable: false, sources: {}, dismissed: false })).toBe(false)
  })

  it('sourcesConfigured treats a mic-only profile as fresh (capture is the signal)', () => {
    expect(sourcesConfigured({ microphoneId: 'm' })).toBe(false)
  })
})
