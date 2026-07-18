import { describe, expect, it } from 'vitest'

import {
  isPremiumUpgradeMessage,
  premiumRequiredIssueMessage,
  VIDEORC_PREMIUM_URL
} from './premium-upgrade'

describe('premium upgrade helpers', () => {
  it('uses the public Videorc premium URL', () => {
    expect(VIDEORC_PREMIUM_URL).toBe('https://www.videorc.com/premium')
  })

  it('detects premium blocker copy', () => {
    expect(
      isPremiumUpgradeMessage(
        'Multistreaming requires Videorc Premium. Basic can stream to one destination at HD.'
      )
    ).toBe(true)
    expect(isPremiumUpgradeMessage('Cloud AI is a Videorc Premium feature.')).toBe(true)
    expect(isPremiumUpgradeMessage('No streaming destination is ready.')).toBe(false)
  })

  it('returns the first premium error issue from Go Live preflight', () => {
    expect(
      premiumRequiredIssueMessage({
        issues: [
          {
            severity: 'warning',
            message: 'Twitch category is missing.'
          },
          {
            severity: 'error',
            message:
              'Multistreaming requires Videorc Premium. Basic can stream to one destination at HD.'
          }
        ]
      })
    ).toBe('Multistreaming requires Videorc Premium. Basic can stream to one destination at HD.')
  })
})
