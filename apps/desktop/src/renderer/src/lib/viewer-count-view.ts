import type { ViewerSample } from '@/lib/backend'

// Viewer rider V2: chip presentation rules. Terminology honesty — the count
// is concurrent VIEWERS ("watching"), never "subs". A sample older than 2×
// the sampler cadence greys out instead of freezing at a confident number.

const SAMPLE_STALE_AFTER_MS = 75_000

export function formatViewerCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  }
  return String(count)
}

export function viewerSampleStale(sample: ViewerSample, nowMs: number): boolean {
  const at = Date.parse(sample.at)
  if (!Number.isFinite(at)) {
    return true
  }
  return nowMs - at > SAMPLE_STALE_AFTER_MS
}

export function viewerChipLabel(sample: ViewerSample): string {
  return `${formatViewerCount(sample.total)} watching`
}

export function viewerChipDetail(sample: ViewerSample): string {
  return sample.platforms
    .map((entry) => `${entry.platform}: ${formatViewerCount(entry.count)}`)
    .join(' · ')
}
