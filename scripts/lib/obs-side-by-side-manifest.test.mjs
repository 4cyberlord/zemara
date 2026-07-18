import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildObsSideBySideManifest } from './obs-side-by-side-manifest.mjs'

describe('buildObsSideBySideManifest', () => {
  it('records comparable Videorc and OBS settings without mutating OBS', () => {
    const manifest = buildObsSideBySideManifest({
      generatedAtIso: '2026-06-13T20:00:00Z',
      commit: 'abc123',
      command: ['node', 'scripts/obs-side-by-side-acceptance.mjs', '--stimulus=motion'],
      outputDirectory: '/tmp/videorc-obs',
      stimulus: 'motion',
      launchObs: true,
      launchVideorc: true,
      videorcOutput: { width: 3840, height: 2160, fps: 30, bitrateKbps: 30000 },
      obsApp: '/Applications/OBS.app',
      obsAppDetected: true,
      obsProfile: 'Profile',
      obsCollection: 'Collection',
      obsScene: 'Long',
      obsVideo: {
        BaseCX: '3840',
        BaseCY: '2160',
        OutputCX: '3840',
        OutputCY: '2160',
        FPSCommon: '30',
        ScaleType: 'lanczos',
        ColorSpace: '709',
        ColorRange: 'Partial'
      },
      obsSceneSummary: {
        name: 'Long',
        hasScreenSource: true,
        visibleSources: [{ name: 'Display', id: 'screen_capture' }]
      }
    })

    assert.equal(manifest.schemaVersion, 1)
    assert.equal(manifest.videorc.commit, 'abc123')
    assert.deepEqual(manifest.videorc.requestedOutput, {
      width: 3840,
      height: 2160,
      fps: 30,
      bitrateKbps: 30000
    })
    assert.equal(manifest.obs.automation, 'launch-only-no-settings-mutation')
    assert.equal(manifest.obs.settingsAutomation, 'unavailable-manual-match-required')
    assert.deepEqual(manifest.obs.videoProfile, {
      baseWidth: 3840,
      baseHeight: 2160,
      outputWidth: 3840,
      outputHeight: 2160,
      fps: '30',
      scaleType: 'lanczos',
      colorSpace: '709',
      colorRange: 'Partial'
    })
    assert.equal(manifest.manualInstructions.humanVisualPassRequired, true)
  })

  it('keeps missing OBS settings explicit for manual matching', () => {
    const manifest = buildObsSideBySideManifest({
      command: [],
      outputDirectory: '/tmp/videorc-obs',
      stimulus: 'av-sync',
      launchObs: false,
      launchVideorc: false,
      videorcOutput: { width: 1920, height: 1080, fps: 30, bitrateKbps: 6000 },
      obsApp: '/Applications/OBS.app',
      obsAppDetected: false,
      obsProfile: 'Untitled',
      obsCollection: 'Untitled',
      obsScene: 'Long',
      obsVideo: null,
      obsSceneSummary: null
    })

    assert.equal(manifest.videorc.appMode, 'not-launched')
    assert.equal(manifest.obs.videoProfile, 'manual-match-required')
    assert.deepEqual(manifest.obs.visibleSources, [])
    assert.equal(manifest.obs.automation, 'not-used')
  })
})
