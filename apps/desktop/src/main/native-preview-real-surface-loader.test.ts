import { describe, expect, it } from 'vitest'

import type { NativePreviewRealSurfaceDriver } from '../shared/native-preview-host-driver'
import { loadNativePreviewRealSurfaceDriver } from './native-preview-real-surface-loader'

function driver(): NativePreviewRealSurfaceDriver {
  return {
    applyHostCommands: async () => null,
    presentCompositorHandoff: async () => null
  }
}

describe('native-preview-real-surface-loader', () => {
  it('stays disabled when no module path is configured', () => {
    const result = loadNativePreviewRealSurfaceDriver({
      loadModule: () => driver()
    })

    expect(result.driver).toBeNull()
    expect(result.unavailableReason).toContain('not configured')
  })

  it('loads a direct driver export', async () => {
    const realDriver = driver()
    const result = loadNativePreviewRealSurfaceDriver({
      modulePath: '/tmp/native-preview-host.node',
      loadModule: () => realDriver
    })

    expect(result.driver).toBe(realDriver)
    await expect(result.driver?.presentCompositorHandoff({} as never)).resolves.toBeNull()
  })

  it('loads a factory export', () => {
    const realDriver = driver()
    const result = loadNativePreviewRealSurfaceDriver({
      modulePath: '/tmp/native-preview-host.node',
      loadModule: () => ({
        createNativePreviewRealSurfaceDriver: () => realDriver
      })
    })

    expect(result.driver).toBe(realDriver)
  })

  it('loads a default factory export', () => {
    const realDriver = driver()
    const result = loadNativePreviewRealSurfaceDriver({
      modulePath: '/tmp/native-preview-host.node',
      loadModule: () => ({
        default: {
          createNativePreviewRealSurfaceDriver: () => realDriver
        }
      })
    })

    expect(result.driver).toBe(realDriver)
  })

  it('reports invalid or failing modules as unavailable', () => {
    const invalid = loadNativePreviewRealSurfaceDriver({
      modulePath: '/tmp/native-preview-host.node',
      loadModule: () => ({})
    })
    const failing = loadNativePreviewRealSurfaceDriver({
      modulePath: '/tmp/native-preview-host.node',
      loadModule: () => {
        throw new Error('boom')
      }
    })

    expect(invalid.driver).toBeNull()
    expect(invalid.unavailableReason).toContain('did not export')
    expect(failing.driver).toBeNull()
    expect(failing.unavailableReason).toContain('boom')
  })

  it('rejects modules that can present but cannot receive host lifecycle commands', () => {
    const result = loadNativePreviewRealSurfaceDriver({
      modulePath: '/tmp/native-preview-host.node',
      loadModule: () => ({
        presentCompositorHandoff: async () => null
      })
    })

    expect(result.driver).toBeNull()
    expect(result.unavailableReason).toContain('valid native-preview driver')
  })
})
