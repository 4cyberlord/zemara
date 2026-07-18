// PowerSlider value math (Assets Tab plan, slice A3).
//
// Pure and framework-free so the exact clamping / stepping / formatting the UI
// relies on is unit-tested directly — the component never re-implements value
// logic, and "all values clamp through the same helpers used by tests" holds.
// No DOM, no React here.

export type SliderRange = {
  min: number
  max: number
  step: number
}

function stepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    return 0
  }
  const text = String(step)
  const dot = text.indexOf('.')
  return dot === -1 ? 0 : text.length - dot - 1
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// Clamp into [min,max] and snap to the step grid (anchored at min), fixing the
// floating-point drift that 0.1-style steps produce. NaN falls back to min so a
// bad numeric entry can never escape the range; ±Infinity clamps to its bound.
export function clampToRange(value: number, range: SliderRange): number {
  const { min, max, step } = range
  if (Number.isNaN(value)) {
    return min
  }
  const bounded = Math.min(max, Math.max(min, value))
  if (!Number.isFinite(step) || step <= 0) {
    return bounded
  }
  const snapped = min + Math.round((bounded - min) / step) * step
  return roundTo(Math.min(max, Math.max(min, snapped)), stepDecimals(step))
}

// One keyboard/arrow move. `large` (Shift+arrow) uses largeStep, defaulting to
// 10× step. `direction` is the sign of the move.
export function stepValue(
  value: number,
  range: SliderRange,
  direction: number,
  options: { large?: boolean; largeStep?: number } = {}
): number {
  const base = options.large ? (options.largeStep ?? range.step * 10) : range.step
  const sign = direction < 0 ? -1 : 1
  return clampToRange(value + base * sign, range)
}

// Parse a typed numeric field. Returns null (= no commit) for blank or
// non-numeric input; otherwise clamps/snaps into range.
export function parseNumericInput(raw: string, range: SliderRange): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return null
  }
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return clampToRange(parsed, range)
}

// Display string: fixed decimals (derived from step unless overridden), an
// optional unit suffix, and a leading '+' for positive bipolar values so
// pan/offset controls read signed.
export function formatValue(
  value: number,
  options: { suffix?: string; decimals?: number; bipolar?: boolean; step?: number } = {}
): string {
  const decimals = options.decimals ?? stepDecimals(options.step ?? 1)
  const rounded = roundTo(value, decimals)
  const sign = options.bipolar && rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(decimals)}${options.suffix ?? ''}`
}

// Position of a value along the track as a 0–100 percentage — used to place snap
// ticks and the bipolar midpoint marker.
export function valuePercent(value: number, range: SliderRange): number {
  const { min, max } = range
  if (max <= min) {
    return 0
  }
  const bounded = Math.min(max, Math.max(min, value))
  return roundTo(((bounded - min) / (max - min)) * 100, 3)
}
