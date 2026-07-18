import { describe, expect, it } from 'vitest'

import { avatarCacheFileName, avatarHostAllowed } from './avatar-cache'

describe('avatarHostAllowed', () => {
  it('allows the platform CDNs over https only', () => {
    expect(avatarHostAllowed('https://yt3.ggpht.com/abc/photo=s64')).toBe(true)
    expect(avatarHostAllowed('https://lh3.googleusercontent.com/a/user=s96')).toBe(true)
    expect(avatarHostAllowed('https://static-cdn.jtvnw.net/jtv_user_pictures/x.png')).toBe(true)
    expect(avatarHostAllowed('http://yt3.ggpht.com/abc')).toBe(false)
  })

  it('rejects lookalike hosts, other origins, and garbage', () => {
    expect(avatarHostAllowed('https://evil-yt3.ggpht.com.attacker.dev/x.png')).toBe(false)
    expect(avatarHostAllowed('https://notgoogleusercontent.com/x.png')).toBe(false)
    expect(avatarHostAllowed('https://example.com/avatar.png')).toBe(false)
    expect(avatarHostAllowed('file:///etc/passwd')).toBe(false)
    expect(avatarHostAllowed('not a url')).toBe(false)
  })
})

describe('avatarCacheFileName', () => {
  it('is deterministic and keeps a safe extension from the URL path', () => {
    const first = avatarCacheFileName('https://static-cdn.jtvnw.net/pic/user.png')
    expect(first).toBe(avatarCacheFileName('https://static-cdn.jtvnw.net/pic/user.png'))
    expect(first).toMatch(/^[0-9a-f]{32}\.png$/)
    expect(avatarCacheFileName('https://yt3.ggpht.com/abc=s64')).toMatch(/^[0-9a-f]{32}\.img$/)
  })

  it('never leaks path characters into the file name', () => {
    expect(avatarCacheFileName('https://yt3.ggpht.com/../../../etc/passwd')).toMatch(
      /^[0-9a-f]{32}\.img$/
    )
  })
})
