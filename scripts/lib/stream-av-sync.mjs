// Stream A/V sync evidence — plan WS-A slice A1 (Studio Shell And Live Control Plan).
//
// The record-only av-sync gate proves the local file; it says nothing about what a
// platform RECEIVES. This module holds the pure logic for the stream-leg gate: drift
// fitting over flash/click pairs, the three-way comparison (record-only MKV vs
// record+stream MKV leg vs RTMP-received FLV), and the hypothesis classification the
// plan's slice A1 requires (H1 timeline-start offset / H2 drift / H3 tee-leg divergence).
//
// Pure functions only — the orchestrator (scripts/stream-av-sync-baseline.mjs) owns
// processes and files so this logic is unit-testable against synthetic measurements.

export const DEFAULT_STREAM_AV_SYNC_GATES = Object.freeze({
  // Plan acceptance: |median offset| <= 60ms on the RTMP-received FLV and the MKV leg.
  medianTargetMs: 60,
  // Hard ceiling matching the existing lip-sync hard fail.
  hardFailMs: 150,
  // Legs of one tee share one encode; medians further apart than this implicate H3.
  legDivergenceMs: 40,
  // Record-only vs record+stream medians further apart than this implicate H1/H2
  // (the two bridge paths do not share a timestamp basis).
  pathDivergenceMs: 40,
  // Drift gate: <= 20ms over 30 minutes, only meaningful on runs long enough to fit.
  driftMaxMsPer30Min: 20,
  driftMinDurationSec: 600,
  // Below this many flash/click pairs a drift fit is noise, not evidence.
  driftMinPairs: 5
})

/**
 * Least-squares fit of pair offset (ms) against flash time (s). Returns null when the
 * pairs cannot support a fit (too few, or too short a span to say anything).
 * @param {{flash:number, offsetMs:number}[]} pairs
 * @returns {{slopeMsPerMinute:number, interceptMs:number, samples:number, spanSec:number}|null}
 */
export function fitOffsetDrift(
  pairs,
  { minPairs = DEFAULT_STREAM_AV_SYNC_GATES.driftMinPairs, minSpanSec = 30 } = {}
) {
  const usable = (pairs ?? []).filter(
    (pair) => Number.isFinite(pair?.flash) && Number.isFinite(pair?.offsetMs)
  )
  if (usable.length < minPairs) return null
  const times = usable.map((pair) => pair.flash)
  const spanSec = Math.max(...times) - Math.min(...times)
  if (spanSec < minSpanSec) return null
  const n = usable.length
  const meanT = times.reduce((sum, t) => sum + t, 0) / n
  const meanY = usable.reduce((sum, pair) => sum + pair.offsetMs, 0) / n
  let covariance = 0
  let variance = 0
  for (const pair of usable) {
    covariance += (pair.flash - meanT) * (pair.offsetMs - meanY)
    variance += (pair.flash - meanT) ** 2
  }
  if (variance === 0) return null
  const slopeMsPerSec = covariance / variance
  return {
    slopeMsPerMinute: slopeMsPerSec * 60,
    interceptMs: meanY - slopeMsPerSec * meanT,
    samples: n,
    spanSec
  }
}

/** Drift extrapolated to the plan's 30-minute horizon, or null without a fit. */
export function driftMsPer30Min(drift) {
  if (!drift || !Number.isFinite(drift.slopeMsPerMinute)) return null
  return drift.slopeMsPerMinute * 30
}

export function summarizeOffsetDrift(drift) {
  const estimatedDriftMsPer30Min = driftMsPer30Min(drift)
  if (!drift || estimatedDriftMsPer30Min === null) return null
  return {
    slopeMsPerMinute: drift.slopeMsPerMinute,
    estimatedDriftMsPer30Min,
    samples: drift.samples,
    spanSec: drift.spanSec
  }
}

export function classifyStreamAvSyncShape(
  { recordStreamMkv, recordStreamFlv, flvDrift, mkvDrift },
  gates = DEFAULT_STREAM_AV_SYNC_GATES
) {
  const mkvMedian = recordStreamMkv?.medianOffsetMs
  const flvMedian = recordStreamFlv?.medianOffsetMs
  if (!isFiniteNumber(mkvMedian) || !isFiniteNumber(flvMedian)) {
    return 'unmeasured'
  }

  if (Math.abs(flvMedian - mkvMedian) > gates.legDivergenceMs) {
    return 'stream-leg-divergence'
  }

  const drift30s = [driftMsPer30Min(flvDrift), driftMsPer30Min(mkvDrift)].filter(isFiniteNumber)
  if (drift30s.some((drift30) => Math.abs(drift30) > gates.driftMaxMsPer30Min)) {
    return 'drift'
  }

  return 'fixed-offset'
}

export function summarizeStreamAvSyncEvidence(
  { recordStreamMkv, recordStreamFlv, flvDrift, mkvDrift },
  gates = DEFAULT_STREAM_AV_SYNC_GATES
) {
  return {
    classification: classifyStreamAvSyncShape(
      { recordStreamMkv, recordStreamFlv, flvDrift, mkvDrift },
      gates
    ),
    recordStreamMkvDrift: summarizeOffsetDrift(mkvDrift),
    receivedFlvDrift: summarizeOffsetDrift(flvDrift)
  }
}

/**
 * Classify which plan hypotheses the measurements support. Inputs are measurement
 * summaries: `{ medianOffsetMs }` (or null when that session/file was not measured).
 * @returns {string[]} human-readable hypothesis findings (empty = no divergence found)
 */
export function classifySyncHypotheses(
  { recordOnly, recordStreamMkv, recordStreamFlv, flvDrift },
  gates = DEFAULT_STREAM_AV_SYNC_GATES
) {
  const findings = []
  const mkvMedian = recordStreamMkv?.medianOffsetMs
  const flvMedian = recordStreamFlv?.medianOffsetMs
  const recordOnlyMedian = recordOnly?.medianOffsetMs

  if (isFiniteNumber(mkvMedian) && isFiniteNumber(recordOnlyMedian)) {
    const delta = mkvMedian - recordOnlyMedian
    if (Math.abs(delta) > gates.pathDivergenceMs) {
      findings.push(
        `H1/H2 path-basis divergence: record+stream MKV median ${formatMs(mkvMedian)} vs record-only median ` +
          `${formatMs(recordOnlyMedian)} (Δ ${formatMs(delta)}) — the raw-YUV stream path and the pre-encoded ` +
          `record path do not share a timestamp basis.`
      )
    }
  }
  if (isFiniteNumber(flvMedian) && isFiniteNumber(mkvMedian)) {
    const delta = flvMedian - mkvMedian
    if (Math.abs(delta) > gates.legDivergenceMs) {
      findings.push(
        `H3 tee-leg divergence: RTMP-received FLV median ${formatMs(flvMedian)} vs MKV leg median ` +
          `${formatMs(mkvMedian)} (Δ ${formatMs(delta)}) — the two tee legs disagree about the same encode.`
      )
    }
  }
  const flvDrift30 = driftMsPer30Min(flvDrift)
  if (flvDrift30 !== null && Math.abs(flvDrift30) > gates.driftMaxMsPer30Min) {
    findings.push(
      `H2 drift: received FLV offset drifts ${flvDrift30.toFixed(1)}ms per 30min ` +
        `(${flvDrift.samples} pairs over ${flvDrift.spanSec.toFixed(0)}s).`
    )
  }
  return findings
}

/**
 * Apply the stream A/V sync gates. `measurements` carries `measureAvSync` results (or
 * null where a file was not produced/measured); `durationSec` is the record+stream
 * session length (drives whether the drift gate is binding).
 * @returns {{pass:boolean, failures:string[], warnings:string[], hypotheses:string[]}}
 */
export function evaluateStreamAvSync(
  { recordOnly, recordStreamMkv, recordStreamFlv, flvDrift, mkvDrift, durationSec },
  gates = DEFAULT_STREAM_AV_SYNC_GATES
) {
  const failures = []
  const warnings = []

  failures.push(...requireMeasurement('record+stream MKV leg', recordStreamMkv))
  failures.push(...requireMeasurement('RTMP-received FLV', recordStreamFlv))
  if (recordOnly === undefined) {
    warnings.push('record-only baseline session was skipped — H1/H2 path comparison unavailable.')
  } else {
    failures.push(...requireMeasurement('record-only baseline', recordOnly))
  }

  for (const [label, measurement] of [
    ['record+stream MKV leg', recordStreamMkv],
    ['RTMP-received FLV', recordStreamFlv]
  ]) {
    const median = measurement?.medianOffsetMs
    if (!isFiniteNumber(median)) continue
    if (Math.abs(median) > gates.hardFailMs) {
      failures.push(
        `${label} A/V offset ${formatMs(median)} exceeds hard-fail ${gates.hardFailMs}ms`
      )
    } else if (Math.abs(median) > gates.medianTargetMs) {
      failures.push(
        `${label} A/V offset ${formatMs(median)} exceeds plan gate ${gates.medianTargetMs}ms`
      )
    }
  }

  const driftBinding = isFiniteNumber(durationSec) && durationSec >= gates.driftMinDurationSec
  for (const [label, drift] of [
    ['RTMP-received FLV', flvDrift],
    ['record+stream MKV leg', mkvDrift]
  ]) {
    const drift30 = driftMsPer30Min(drift)
    if (drift30 === null) continue
    if (Math.abs(drift30) > gates.driftMaxMsPer30Min) {
      const message =
        `${label} drift ${drift30.toFixed(1)}ms/30min exceeds gate ${gates.driftMaxMsPer30Min}ms/30min ` +
        `(${drift.samples} pairs over ${drift.spanSec.toFixed(0)}s)`
      if (driftBinding) {
        failures.push(message)
      } else {
        warnings.push(`${message} — run >= ${gates.driftMinDurationSec}s for a binding drift gate`)
      }
    }
  }

  const hypotheses = classifySyncHypotheses(
    { recordOnly, recordStreamMkv, recordStreamFlv, flvDrift },
    gates
  )
  return { pass: failures.length === 0, failures, warnings, hypotheses }
}

function requireMeasurement(label, measurement) {
  if (measurement === null) {
    return [`${label} was not measured (file missing or unreadable).`]
  }
  if (measurement && !isFiniteNumber(measurement.medianOffsetMs)) {
    return [`${label} produced no flash/click pairs — record against the flash+click stimulus.`]
  }
  return []
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatMs(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(0)}ms`
}
