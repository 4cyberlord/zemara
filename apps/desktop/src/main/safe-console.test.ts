import { EventEmitter } from 'node:events'

import { describe, expect, it } from 'vitest'

import {
  createSafeConsole,
  guardStreamAgainstConsoleCrash,
  isBrokenPipeError,
  type ConsoleLike
} from './safe-console'

describe('safe-console', () => {
  it('swallows broken pipe writes from console methods', () => {
    const logger = createSafeConsole(
      consoleThatThrows(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))
    )

    expect(() => logger.log('[backend:info] hello')).not.toThrow()
    expect(() => logger.warn('[backend:warn] hello')).not.toThrow()
    expect(() => logger.error('[backend:error] hello')).not.toThrow()
  })

  it('rethrows non-pipe console write failures', () => {
    const logger = createSafeConsole(consoleThatThrows(new Error('unexpected console failure')))

    expect(() => logger.log('hello')).toThrow(/unexpected console failure/)
  })

  it('forwards arguments to the wrapped console method', () => {
    const writes: unknown[][] = []
    const logger = createSafeConsole({
      log: (...args) => writes.push(args),
      warn: (...args) => writes.push(args),
      error: (...args) => writes.push(args)
    })

    logger.log('one', { two: true })

    expect(writes).toEqual([['one', { two: true }]])
  })

  // A dead stdout pipe surfaces as an ASYNC 'error' event on the stream —
  // writeSafely's try/catch never sees it, and an unlistened 'error' event is
  // an uncaught exception (the "write EPIPE" main-process crash dialog,
  // field report 2026-07-06). The guard must make the emit harmless.
  it('guards a stream so async write errors cannot crash the process', () => {
    const stream = new EventEmitter()
    const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })

    // Unguarded, EventEmitter turns an unlistened 'error' emit into a throw.
    expect(() => stream.emit('error', epipe)).toThrow(/EPIPE/)

    guardStreamAgainstConsoleCrash(stream as unknown as NodeJS.WriteStream)
    expect(() => stream.emit('error', epipe)).not.toThrow()

    // A missing/odd stream (tests, exotic embedding) must be a no-op.
    expect(() => guardStreamAgainstConsoleCrash(undefined)).not.toThrow()
  })

  it('recognizes stream-destroyed write errors as broken pipes', () => {
    expect(isBrokenPipeError({ code: 'ERR_STREAM_DESTROYED' })).toBe(true)
    expect(isBrokenPipeError({ code: 'ERR_STREAM_WRITE_AFTER_END' })).toBe(true)
    expect(isBrokenPipeError({ code: 'EACCES' })).toBe(false)
  })
})

function consoleThatThrows(error: Error): ConsoleLike {
  return {
    log: () => {
      throw error
    },
    warn: () => {
      throw error
    },
    error: () => {
      throw error
    }
  }
}
