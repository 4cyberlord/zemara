import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  compareFramesWithinTolerance,
  decodeSyntheticFrameNumber,
  evaluateFrameSequenceParity
} from './visual-parity.mjs'

// Build the 16 MSB-first cell luma samples the synthetic strip would render for `value`.
function cellsFor(value) {
  return Array.from({ length: 16 }, (_, bit) => ((value >> (15 - bit)) & 1 ? 255 : 0))
}

test('synthetic frame number round-trips through the cell luma strip', () => {
  for (const value of [0, 1, 2, 255, 4096, 65535]) {
    assert.equal(decodeSyntheticFrameNumber(cellsFor(value)), value)
  }
})

test('decode rejects the wrong cell count', () => {
  assert.equal(decodeSyntheticFrameNumber([255, 0, 255]), null)
  assert.equal(decodeSyntheticFrameNumber('nope'), null)
})

test('a continuous frame sequence is in timing parity', () => {
  const result = evaluateFrameSequenceParity([10, 11, 12, 13, 14])
  assert.equal(result.inParity, true)
  assert.equal(result.drops, 0)
  assert.equal(result.repeats, 0)
})

test('a wrap at 2^16 stays in parity', () => {
  const result = evaluateFrameSequenceParity([65534, 65535, 0, 1])
  assert.equal(result.inParity, true)
  assert.equal(result.drops, 0)
})

test('a repeated frame number is flagged as a freeze', () => {
  const result = evaluateFrameSequenceParity([10, 11, 11, 12])
  assert.equal(result.inParity, false)
  assert.equal(result.repeats, 1)
  assert.match(result.reasons.join(' '), /freeze/)
})

test('a gap is flagged as dropped frames', () => {
  const result = evaluateFrameSequenceParity([10, 11, 14, 15])
  assert.equal(result.inParity, false)
  assert.equal(result.drops, 2)
  assert.equal(result.maxObservedGap, 3)
})

test('a backwards frame number is flagged as out of order', () => {
  const result = evaluateFrameSequenceParity([10, 11, 5, 6])
  assert.equal(result.inParity, false)
  assert.equal(result.disorders, 1)
  assert.equal(result.drops, 0)
})

test('fewer than two frames is not measured', () => {
  assert.equal(evaluateFrameSequenceParity([7]).measured, false)
})

test('identical frames match exactly', () => {
  const frame = [10, 20, 30, 40]
  assert.equal(compareFramesWithinTolerance(frame, frame).match, true)
})

test('small per-pixel differences are within tolerance', () => {
  const result = compareFramesWithinTolerance([100, 100, 100, 100], [105, 108, 102, 100])
  assert.equal(result.match, true)
  assert.ok(result.meanAbsDiff < 12)
})

test('large differences exceed the tolerance', () => {
  const result = compareFramesWithinTolerance([0, 0, 0, 0], [200, 200, 200, 200])
  assert.equal(result.match, false)
  assert.match(result.reasons.join(' '), /mean abs diff/)
})

test('mismatched frame sizes do not match', () => {
  assert.equal(compareFramesWithinTolerance([1, 2], [1, 2, 3]).match, false)
})
