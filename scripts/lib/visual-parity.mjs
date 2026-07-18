// Visual/timing parity fixtures.
//
// These build on the developer synthetic source (slice 5), whose composited frames carry a
// machine-decodable 16-bit frame-number strip plus a frame number and timecode. A fixture run
// records the synthetic source, extracts decoded frames, reads their frame numbers back, and
// checks two things:
//
//   1. Timing parity — the recorded frame-number sequence is monotonic and continuous (no gaps =
//      no dropped frames, no repeats = no freezes), so the recording faithfully contains the
//      source's program frames in order.
//   2. Visual parity — a preview screenshot and the decoded recording frame from the *same*
//      program-frame window match within a compression/scaling tolerance.
//
// The pure functions here are the deterministic core; an on-device fixture script feeds them
// real extracted frames, while the tests feed synthetic data.

const STRIP_BITS = 16
const WRAP = 1 << STRIP_BITS

/** Decode the synthetic frame number from `STRIP_BITS` cell luma samples (MSB-first), mirroring
 * the Rust `synthetic_diagnostic::decode_sequence`. Returns null on the wrong sample count. */
export function decodeSyntheticFrameNumber(cellLumas) {
  if (!Array.isArray(cellLumas) || cellLumas.length !== STRIP_BITS) {
    return null
  }
  let value = 0
  for (let bit = 0; bit < STRIP_BITS; bit += 1) {
    if (cellLumas[bit] >= 128) {
      value |= 1 << (STRIP_BITS - 1 - bit)
    }
  }
  return value >>> 0
}

/** Check that a recorded synthetic frame-number sequence advances one-per-frame with no dropped
 * frames (gaps) and no frozen frames (repeats). The numbers wrap modulo 2^16. */
export function evaluateFrameSequenceParity(frameNumbers = [], options = {}) {
  const maxGap = options.maxGap ?? 1
  const allowedRepeats = options.allowedRepeats ?? 0

  const measured = frameNumbers.filter((value) => Number.isFinite(value))
  if (measured.length < 2) {
    return {
      measured: false,
      inParity: false,
      frames: measured.length,
      drops: 0,
      repeats: 0,
      disorders: 0,
      maxObservedGap: 0,
      reasons: ['need at least two decoded frame numbers']
    }
  }

  let drops = 0
  let repeats = 0
  let disorders = 0
  let maxObservedGap = 0
  for (let i = 1; i < measured.length; i += 1) {
    let delta = measured[i] - measured[i - 1]
    if (delta < 0) {
      delta += WRAP // sequence wrapped past 2^16
    }
    if (delta > WRAP / 2) {
      // A near-full-wrap delta means the frame number went backwards: out of order.
      disorders += 1
    } else if (delta === 0) {
      repeats += 1
    } else if (delta > maxGap) {
      drops += delta - 1
      maxObservedGap = Math.max(maxObservedGap, delta)
    }
  }

  const reasons = []
  if (repeats > allowedRepeats) {
    reasons.push(`${repeats} repeated frame(s) (freeze) over the allowed ${allowedRepeats}`)
  }
  if (drops > 0) {
    reasons.push(`${drops} dropped frame(s); largest gap ${maxObservedGap}`)
  }
  if (disorders > 0) {
    reasons.push(`${disorders} out-of-order frame(s)`)
  }

  return {
    measured: true,
    inParity: repeats <= allowedRepeats && drops === 0 && disorders === 0,
    frames: measured.length,
    drops,
    repeats,
    disorders,
    maxObservedGap,
    reasons
  }
}

/** Compare two equal-length pixel buffers (e.g. preview screenshot vs decoded recording frame,
 * pre-scaled to a common size) by mean and max absolute difference, within a tolerance that
 * absorbs H.264/scaling noise. */
export function compareFramesWithinTolerance(a, b, options = {}) {
  const toleranceMeanAbsDiff = options.toleranceMeanAbsDiff ?? 12
  const toleranceMaxAbsDiff = options.toleranceMaxAbsDiff ?? 80

  if (!a || !b || a.length === 0 || a.length !== b.length) {
    return {
      match: false,
      meanAbsDiff: null,
      maxAbsDiff: null,
      reasons: ['frames are missing or not the same size']
    }
  }

  let total = 0
  let maxAbsDiff = 0
  for (let i = 0; i < a.length; i += 1) {
    const diff = Math.abs(a[i] - b[i])
    total += diff
    if (diff > maxAbsDiff) {
      maxAbsDiff = diff
    }
  }
  const meanAbsDiff = total / a.length

  const reasons = []
  if (meanAbsDiff > toleranceMeanAbsDiff) {
    reasons.push(`mean abs diff ${meanAbsDiff.toFixed(1)} over tolerance ${toleranceMeanAbsDiff}`)
  }
  if (maxAbsDiff > toleranceMaxAbsDiff) {
    reasons.push(`max abs diff ${maxAbsDiff} over tolerance ${toleranceMaxAbsDiff}`)
  }

  return {
    match: meanAbsDiff <= toleranceMeanAbsDiff && maxAbsDiff <= toleranceMaxAbsDiff,
    meanAbsDiff,
    maxAbsDiff,
    reasons
  }
}
