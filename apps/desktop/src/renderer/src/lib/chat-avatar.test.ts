import { describe, expect, it } from 'vitest'

import { monogramInitials } from './chat-avatar'

describe('monogramInitials', () => {
  it('takes the first letters of up to two words, uppercased', () => {
    expect(monogramInitials('Orc Dev')).toBe('OD')
    expect(monogramInitials('viewer')).toBe('V')
    expect(monogramInitials('three word name')).toBe('TW')
  })

  it('survives emptiness, whitespace, and multi-byte glyphs', () => {
    expect(monogramInitials('')).toBe('?')
    expect(monogramInitials('   ')).toBe('?')
    expect(monogramInitials('🦊 fox')).toBe('🦊F')
  })
})
