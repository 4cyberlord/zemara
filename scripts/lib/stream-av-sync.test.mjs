// Tests for the stream A/V sync gate logic (plan WS-A slice A1).
// Run: node --test scripts/lib/stream-av-sync.test.mjs

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DEFAULT_STREAM_AV_SYNC_GATES,
  classifyStreamAvSyncShape,
  classifySyncHypotheses,
  driftMsPer30Min,
  evaluateStreamAvSync,
  fitOffsetDrift,
  summarizeOffsetDrift,
  summarizeStreamAvSyncEvidence
} from './stream-av-sync.mjs'

function pairsWithSlope({ count = 20, stepSec = 5, interceptMs = 10, slopeMsPerSec = 0 }) {
  return Array.from({ length: count }, (_, i) => ({
    flash: i * stepSec,
    offsetMs: interceptMs + slopeMsPerSec * i * stepSec
  }))
}

function measurement(medianOffsetMs, pairs = []) {
  return { medianOffsetMs, pairs }
}

describe('fitOffsetDrift', () => {
  it('recovers a known slope and intercept', () => {
    const fit = fitOffsetDrift(pairsWithSlope({ interceptMs: 25, slopeMsPerSec: 0.5 }))
    assert.ok(fit)
    assert.ok(Math.abs(fit.slopeMsPerMinute - 30) < 1e-6, `slope ${fit.slopeMsPerMinute}`)
    assert.ok(Math.abs(fit.interceptMs - 25) < 1e-6)
    assert.equal(fit.samples, 20)
  })

  it('returns null for too few pairs or too short a span', () => {
    assert.equal(fitOffsetDrift(pairsWithSlope({ count: 3 })), null)
    assert.equal(fitOffsetDrift(pairsWithSlope({ count: 20, stepSec: 1 })), null)
    assert.equal(fitOffsetDrift([]), null)
    assert.equal(fitOffsetDrift(null), null)
  })

  it('extrapolates drift to the 30-minute horizon', () => {
    const fit = fitOffsetDrift(pairsWithSlope({ slopeMsPerSec: 0.01 }))
    assert.ok(Math.abs(driftMsPer30Min(fit) - 18) < 1e-6)
    assert.equal(driftMsPer30Min(null), null)
  })
})

describe('classifySyncHypotheses', () => {
  it('flags H1/H2 when record-only and record+stream medians diverge', () => {
    const findings = classifySyncHypotheses({
      recordOnly: measurement(5),
      recordStreamMkv: measurement(120),
      recordStreamFlv: measurement(118)
    })
    assert.equal(findings.length, 1)
    assert.match(findings[0], /H1\/H2 path-basis divergence/)
  })

  it('flags H3 when the tee legs diverge', () => {
    const findings = classifySyncHypotheses({
      recordOnly: measurement(5),
      recordStreamMkv: measurement(10),
      recordStreamFlv: measurement(90)
    })
    assert.equal(findings.length, 1)
    assert.match(findings[0], /H3 tee-leg divergence/)
  })

  it('flags H2 drift from the FLV fit', () => {
    const flvDrift = fitOffsetDrift(pairsWithSlope({ slopeMsPerSec: 0.05 }))
    const findings = classifySyncHypotheses({
      recordOnly: measurement(5),
      recordStreamMkv: measurement(10),
      recordStreamFlv: measurement(12),
      flvDrift
    })
    assert.equal(findings.length, 1)
    assert.match(findings[0], /H2 drift/)
  })

  it('stays silent when everything agrees', () => {
    const findings = classifySyncHypotheses({
      recordOnly: measurement(5),
      recordStreamMkv: measurement(15),
      recordStreamFlv: measurement(20)
    })
    assert.deepEqual(findings, [])
  })
})

describe('summarizeStreamAvSyncEvidence', () => {
  it('summarizes slopes and 30-minute drift estimates', () => {
    const drift = fitOffsetDrift(pairsWithSlope({ slopeMsPerSec: 0.01 }))
    const summary = summarizeOffsetDrift(drift)

    assert.ok(summary)
    assert.ok(Math.abs(summary.slopeMsPerMinute - 0.6) < 1e-6)
    assert.ok(Math.abs(summary.estimatedDriftMsPer30Min - 18) < 1e-6)
    assert.equal(summary.samples, 20)
    assert.equal(summary.spanSec, 95)
    assert.equal(summarizeOffsetDrift(null), null)
  })

  it('classifies fixed-offset evidence when legs agree and drift is within gate', () => {
    const summary = summarizeStreamAvSyncEvidence({
      recordStreamMkv: measurement(50),
      recordStreamFlv: measurement(55),
      mkvDrift: fitOffsetDrift(pairsWithSlope({ slopeMsPerSec: 0.005 })),
      flvDrift: fitOffsetDrift(pairsWithSlope({ slopeMsPerSec: 0.005 }))
    })

    assert.equal(summary.classification, 'fixed-offset')
    assert.ok(summary.recordStreamMkvDrift)
    assert.ok(summary.receivedFlvDrift)
  })

  it('classifies stream-leg divergence before drift', () => {
    const classification = classifyStreamAvSyncShape({
      recordStreamMkv: measurement(10),
      recordStreamFlv: measurement(90),
      flvDrift: fitOffsetDrift(pairsWithSlope({ slopeMsPerSec: 0.05 }))
    })

    assert.equal(classification, 'stream-leg-divergence')
  })

  it('classifies drift when either stream-session leg drifts beyond the gate', () => {
    const classification = classifyStreamAvSyncShape({
      recordStreamMkv: measurement(10),
      recordStreamFlv: measurement(12),
      mkvDrift: fitOffsetDrift(pairsWithSlope({ slopeMsPerSec: 0.05 }))
    })

    assert.equal(classification, 'drift')
  })

  it('classifies missing measurements as unmeasured', () => {
    const classification = classifyStreamAvSyncShape({
      recordStreamMkv: measurement(null),
      recordStreamFlv: measurement(12)
    })

    assert.equal(classification, 'unmeasured')
  })
})

describe('evaluateStreamAvSync', () => {
  it('passes when both record+stream measurements are inside the gate', () => {
    const verdict = evaluateStreamAvSync({
      recordOnly: measurement(5),
      recordStreamMkv: measurement(-20),
      recordStreamFlv: measurement(30),
      durationSec: 60
    })
    assert.equal(verdict.pass, true, verdict.failures.join('; '))
    assert.deepEqual(verdict.failures, [])
  })

  it('fails when the received FLV median exceeds the plan gate', () => {
    const verdict = evaluateStreamAvSync({
      recordOnly: measurement(5),
      recordStreamMkv: measurement(10),
      recordStreamFlv: measurement(95),
      durationSec: 60
    })
    assert.equal(verdict.pass, false)
    assert.match(
      verdict.failures.join('; '),
      /RTMP-received FLV A\/V offset \+95ms exceeds plan gate 60ms/
    )
  })

  it('fails hard above the hard-fail ceiling', () => {
    const verdict = evaluateStreamAvSync({
      recordOnly: measurement(5),
      recordStreamMkv: measurement(200),
      recordStreamFlv: measurement(10),
      durationSec: 60
    })
    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /hard-fail 150ms/)
  })

  it('fails when a required file was not measured', () => {
    const verdict = evaluateStreamAvSync({
      recordOnly: measurement(5),
      recordStreamMkv: measurement(10),
      recordStreamFlv: null,
      durationSec: 60
    })
    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /RTMP-received FLV was not measured/)
  })

  it('fails when no flash/click pairs were detected', () => {
    const verdict = evaluateStreamAvSync({
      recordOnly: measurement(5),
      recordStreamMkv: measurement(null),
      recordStreamFlv: measurement(10),
      durationSec: 60
    })
    assert.equal(verdict.pass, false)
    assert.match(verdict.failures.join('; '), /no flash\/click pairs/)
  })

  it('only warns about drift on short runs, fails on long runs', () => {
    const flvDrift = fitOffsetDrift(pairsWithSlope({ slopeMsPerSec: 0.05 }))
    const base = {
      recordOnly: measurement(5),
      recordStreamMkv: measurement(10),
      recordStreamFlv: measurement(12),
      flvDrift
    }
    const short = evaluateStreamAvSync({ ...base, durationSec: 60 })
    assert.equal(short.pass, true, short.failures.join('; '))
    assert.match(short.warnings.join('; '), /drift/)

    const long = evaluateStreamAvSync({
      ...base,
      durationSec: DEFAULT_STREAM_AV_SYNC_GATES.driftMinDurationSec
    })
    assert.equal(long.pass, false)
    assert.match(long.failures.join('; '), /drift/)
  })

  it('treats a skipped record-only baseline as a warning, not a failure', () => {
    const verdict = evaluateStreamAvSync({
      recordOnly: undefined,
      recordStreamMkv: measurement(10),
      recordStreamFlv: measurement(12),
      durationSec: 60
    })
    assert.equal(verdict.pass, true, verdict.failures.join('; '))
    assert.match(verdict.warnings.join('; '), /record-only baseline session was skipped/)
  })
})
