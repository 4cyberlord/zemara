import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { assertSourceCompleteCompositorHealthy } from './native-preview-source-gates.mjs'

const healthyStats = () => ({
  maxCompositorCpuFallbackFrames: 0,
  maxEncoderBridgeMetalTargetFrames: 120,
  maxCompositorSourceImportFailures: 0,
  maxCompositorScreenSourceIosurfaceImportFrames: 120,
  maxCompositorScreenSourceCvpixelbufferImportFrames: 0,
  maxCompositorScreenSourceByteUploadFrames: 0,
  maxCompositorScreenSourceImportFailures: 0,
  maxCompositorCameraSourceIosurfaceImportFrames: 0,
  maxCompositorCameraSourceCvpixelbufferImportFrames: 60,
  maxCompositorCameraSourceByteUploadFrames: 0,
  maxCompositorCameraSourceImportFailures: 0,
  lastCompositorFallbackReason: null
})

describe('assertSourceCompleteCompositorHealthy', () => {
  it('does not apply source-complete gates to fallback-repro smoke scenes', () => {
    assert.doesNotThrow(() =>
      assertSourceCompleteCompositorHealthy({
        scenarioLabel: 'fallback-repro',
        sourceComplete: false,
        stats: {
          maxCompositorCpuFallbackFrames: 42,
          maxEncoderBridgeMetalTargetFrames: 0
        }
      })
    )
  })

  it('passes a source-complete Metal run without CPU fallback frames', () => {
    assert.doesNotThrow(() =>
      assertSourceCompleteCompositorHealthy({
        scenarioLabel: 'source-complete',
        sourceComplete: true,
        requiredLiveSourceKinds: ['screen'],
        stats: healthyStats()
      })
    )
  })

  it('fails source-complete runs that fall back to the CPU compositor', () => {
    const stats = healthyStats()
    stats.maxCompositorCpuFallbackFrames = 3
    stats.lastCompositorFallbackReason = 'camera source "Camera" frame unavailable'

    assert.throws(
      () =>
        assertSourceCompleteCompositorHealthy({
          scenarioLabel: 'source-complete',
          sourceComplete: true,
          requiredLiveSourceKinds: ['screen'],
          stats
        }),
      /3 CPU fallback frame\(s\): camera source "Camera"/
    )
  })

  it('fails source-complete runs that never reach Metal targets', () => {
    const stats = healthyStats()
    stats.maxEncoderBridgeMetalTargetFrames = 0

    assert.throws(
      () =>
        assertSourceCompleteCompositorHealthy({
          scenarioLabel: 'source-complete',
          sourceComplete: true,
          requiredLiveSourceKinds: ['screen'],
          stats
        }),
      /never reached the Metal compositor target path/
    )
  })

  it('fails source-complete runs that do not declare required live sources', () => {
    assert.throws(
      () =>
        assertSourceCompleteCompositorHealthy({
          scenarioLabel: 'source-complete',
          sourceComplete: true,
          stats: healthyStats()
        }),
      /declared no required live source kinds/
    )
  })

  it('passes a source-complete synthetic-source run without live source imports', () => {
    const stats = healthyStats()
    stats.maxCompositorScreenSourceIosurfaceImportFrames = 0

    assert.doesNotThrow(() =>
      assertSourceCompleteCompositorHealthy({
        scenarioLabel: 'source-complete-synthetic',
        sourceComplete: true,
        allowSyntheticSourceOnly: true,
        requiredLiveSourceKinds: [],
        stats
      })
    )
  })

  it('fails source-complete runs with source import failures', () => {
    const stats = healthyStats()
    stats.maxCompositorSourceImportFailures = 1

    assert.throws(
      () =>
        assertSourceCompleteCompositorHealthy({
          scenarioLabel: 'source-complete',
          sourceComplete: true,
          requiredLiveSourceKinds: ['screen'],
          stats
        }),
      /1 source import failure/
    )
  })

  it('fails source-complete runs when the required screen source uses byte upload', () => {
    const stats = healthyStats()
    stats.maxCompositorScreenSourceByteUploadFrames = 4

    assert.throws(
      () =>
        assertSourceCompleteCompositorHealthy({
          scenarioLabel: 'source-complete',
          sourceComplete: true,
          requiredLiveSourceKinds: ['screen'],
          stats
        }),
      /4 screen source byte-upload frame/
    )
  })

  it('fails source-complete runs when required source imports are missing', () => {
    const stats = healthyStats()
    stats.maxCompositorCameraSourceIosurfaceImportFrames = 0
    stats.maxCompositorCameraSourceCvpixelbufferImportFrames = 0

    assert.throws(
      () =>
        assertSourceCompleteCompositorHealthy({
          scenarioLabel: 'source-complete',
          sourceComplete: true,
          requiredLiveSourceKinds: ['camera'],
          stats
        }),
      /expected camera source zero-copy import frames/
    )
  })
})
