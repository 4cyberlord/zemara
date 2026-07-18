import type { ChildProcessWithoutNullStreams } from 'node:child_process'

export type BackendShutdownResult = 'skipped' | 'closed' | 'already-exited' | 'timed-out'

export type BackendShutdownOptions = {
  killGraceMs?: number
  timeoutMs?: number
}

export async function stopBackendProcess(
  child: ChildProcessWithoutNullStreams | null,
  options: BackendShutdownOptions = {}
): Promise<BackendShutdownResult> {
  if (!child) {
    return 'skipped'
  }

  if (child.exitCode !== null || child.signalCode !== null) {
    return 'already-exited'
  }

  const killGraceMs = options.killGraceMs ?? 5000
  const timeoutMs = options.timeoutMs ?? 10000

  return await new Promise<BackendShutdownResult>((resolve) => {
    let settled = false
    let killTimer: ReturnType<typeof setTimeout> | null = null
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null

    const finish = (result: BackendShutdownResult): void => {
      if (settled) {
        return
      }
      settled = true
      if (killTimer) {
        clearTimeout(killTimer)
      }
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
      }
      child.off('close', onClose)
      child.off('exit', onExit)
      resolve(result)
    }

    const onClose = (): void => finish('closed')
    const onExit = (): void => finish('closed')

    child.once('close', onClose)
    child.once('exit', onExit)

    try {
      child.kill('SIGTERM')
    } catch {
      finish('already-exited')
      return
    }

    killTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        finish('already-exited')
      }
    }, killGraceMs)

    timeoutTimer = setTimeout(() => finish('timed-out'), timeoutMs)
  })
}
