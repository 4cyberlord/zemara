import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { stopBackendProcess } from './backend-process-shutdown'

class FakeChildProcess extends EventEmitter {
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null
  kills: NodeJS.Signals[] = []

  kill(signal: NodeJS.Signals): boolean {
    this.kills.push(signal)
    return true
  }
}

describe('stopBackendProcess', () => {
  it('sends SIGTERM and waits for the backend to close', async () => {
    const child = new FakeChildProcess()
    const stopped = stopBackendProcess(child as never, {
      killGraceMs: 50,
      timeoutMs: 100
    })

    expect(child.kills).toEqual(['SIGTERM'])
    child.emit('close', 0, null)

    await expect(stopped).resolves.toBe('closed')
    expect(child.kills).toEqual(['SIGTERM'])
  })

  it('escalates to SIGKILL when graceful shutdown hangs', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeChildProcess()
      const stopped = stopBackendProcess(child as never, {
        killGraceMs: 50,
        timeoutMs: 100
      })

      await vi.advanceTimersByTimeAsync(51)
      expect(child.kills).toEqual(['SIGTERM', 'SIGKILL'])

      child.emit('exit', null, 'SIGKILL')
      await expect(stopped).resolves.toBe('closed')
    } finally {
      vi.useRealTimers()
    }
  })

  it('resolves after the bounded timeout even when no close event arrives', async () => {
    vi.useFakeTimers()
    try {
      const child = new FakeChildProcess()
      const stopped = stopBackendProcess(child as never, {
        killGraceMs: 50,
        timeoutMs: 100
      })

      await vi.advanceTimersByTimeAsync(101)

      await expect(stopped).resolves.toBe('timed-out')
      expect(child.kills).toEqual(['SIGTERM', 'SIGKILL'])
    } finally {
      vi.useRealTimers()
    }
  })
})
