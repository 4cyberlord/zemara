export function buildObsSideBySideManifest({
  generatedAtIso = new Date().toISOString(),
  commit = 'unknown',
  command = [],
  outputDirectory,
  stimulus,
  launchObs,
  launchVideorc,
  videorcOutput,
  obsApp,
  obsAppDetected,
  obsProfile,
  obsCollection,
  obsScene,
  obsVideo,
  obsSceneSummary
}) {
  return {
    schemaVersion: 1,
    generatedAtIso,
    outputDirectory,
    command,
    stimulus,
    videorc: {
      commit,
      appMode: launchVideorc ? 'dev' : 'not-launched',
      requestedOutput: {
        width: videorcOutput.width,
        height: videorcOutput.height,
        fps: videorcOutput.fps,
        bitrateKbps: videorcOutput.bitrateKbps
      }
    },
    obs: {
      appPath: obsApp,
      appDetected: obsAppDetected === true,
      profile: obsProfile,
      collection: obsCollection,
      sceneName: obsSceneSummary?.name ?? obsScene,
      videoProfile: obsVideo
        ? {
            baseWidth: numberOrNull(obsVideo.BaseCX),
            baseHeight: numberOrNull(obsVideo.BaseCY),
            outputWidth: numberOrNull(obsVideo.OutputCX),
            outputHeight: numberOrNull(obsVideo.OutputCY),
            fps: obsVideo.FPSCommon ?? obsVideo.FPSInt ?? null,
            scaleType: obsVideo.ScaleType ?? null,
            colorSpace: obsVideo.ColorSpace ?? null,
            colorRange: obsVideo.ColorRange ?? null
          }
        : 'manual-match-required',
      visibleSources: obsSceneSummary?.visibleSources ?? [],
      hasScreenSource: obsSceneSummary?.hasScreenSource === true,
      automation: launchObs ? 'launch-only-no-settings-mutation' : 'not-used',
      settingsAutomation: 'unavailable-manual-match-required'
    },
    manualInstructions: {
      matchOutputSettings: true,
      sameSourcesRequired: true,
      obsSettingsMutation: false,
      humanVisualPassRequired: true
    }
  }
}

function numberOrNull(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
