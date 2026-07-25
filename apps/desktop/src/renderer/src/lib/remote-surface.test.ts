import { describe, expect, it, vi } from 'vitest'

import { executeRemoteIntent, type RemoteIntentContext } from './remote-surface'

function remoteIntentContext(overrides: Partial<RemoteIntentContext> = {}) {
  const requests: Array<{ method: string; params: unknown }> = []
  const context: RemoteIntentContext = {
    client: {
      request: async (method, params) => {
        requests.push({ method, params })
        return undefined as never
      }
    },
    sessionActive: false,
    streamEnabled: true,
    startSession: vi.fn(async () => {}),
    stopSession: vi.fn(async () => {}),
    setMicrophoneMuted: vi.fn(),
    knownLayoutPresets: ['screen-camera'],
    applyLayoutPreset: vi.fn(),
    hasTakeover: vi.fn(() => true),
    activateTakeover: vi.fn(async () => {}),
    clearTakeover: vi.fn(async () => {}),
    openWindow: vi.fn(async () => true),
    ...overrides
  }
  return { context, requests }
}

describe('executeRemoteIntent', () => {
  it('starts through the Studio handler and acknowledges success', async () => {
    const { context, requests } = remoteIntentContext()

    await executeRemoteIntent({ intentId: 'intent-1', intent: { kind: 'recordStart' } }, context)

    expect(context.startSession).toHaveBeenCalledOnce()
    expect(requests).toEqual([
      { method: 'remote.intent.ack', params: { intentId: 'intent-1', ok: true } }
    ])
  })

  it('rejects invalid scene presets without applying them', async () => {
    const { context, requests } = remoteIntentContext()

    await executeRemoteIntent(
      { intentId: 'intent-2', intent: { kind: 'sceneApply', layoutPreset: 'unknown' } },
      context
    )

    expect(context.applyLayoutPreset).not.toHaveBeenCalled()
    expect(requests.at(-1)).toEqual({
      method: 'remote.intent.ack',
      params: { intentId: 'intent-2', ok: false, message: 'Unknown layout preset "unknown".' }
    })
  })

  it('forwards microphone toggles and action failures', async () => {
    const { context, requests } = remoteIntentContext({
      startSession: vi.fn(async () => {
        throw new Error('start rejected')
      })
    })

    await executeRemoteIntent({ intentId: 'intent-3', intent: { kind: 'micToggle' } }, context)
    await executeRemoteIntent({ intentId: 'intent-4', intent: { kind: 'recordStart' } }, context)

    expect(context.setMicrophoneMuted).toHaveBeenCalledWith('toggle')
    expect(requests.at(-1)).toEqual({
      method: 'remote.intent.ack',
      params: { intentId: 'intent-4', ok: false, message: 'start rejected' }
    })
  })
})
