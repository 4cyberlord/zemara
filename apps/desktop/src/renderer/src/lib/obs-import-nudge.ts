import type { SourceSelection } from '@/lib/backend'

// O5 (OBS import plan): the nudge is for FRESH profiles only — an established
// setup must never be nagged. "Fresh" = the user has not picked any capture
// source yet; one dismissal is forever (localStorage flag).

export const OBS_NUDGE_DISMISSED_KEY = 'videorc.obsImportNudgeDismissed'

export function sourcesConfigured(sources: Partial<SourceSelection>): boolean {
  return Boolean(sources.screenId ?? sources.windowId ?? sources.cameraId)
}

export function shouldShowObsNudge(params: {
  obsAvailable: boolean
  sources: Partial<SourceSelection>
  dismissed: boolean
}): boolean {
  return params.obsAvailable && !params.dismissed && !sourcesConfigured(params.sources)
}
