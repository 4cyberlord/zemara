export interface ConsoleLike {
  log: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export const safeConsole = createSafeConsole(console)

// A dead stdout/stderr pipe (the launching terminal or parent process went
// away) delivers write failures ASYNCHRONOUSLY as 'error' events on the
// stream — writeSafely's try/catch never sees them, and with no 'error'
// listener Node turns them into an uncaught exception: the "A JavaScript
// error occurred in the main process / write EPIPE" dialog (field report,
// 2026-07-06, via console.warn mid-session). A console transport failure
// must never take the app down, so swallow stream errors outright.
export function guardStreamAgainstConsoleCrash(
  stream: Pick<NodeJS.WriteStream, 'on'> | undefined
): void {
  stream?.on?.('error', () => {
    // Deliberately empty: there is nowhere left to report a broken console.
  })
}

guardStreamAgainstConsoleCrash(process.stdout)
guardStreamAgainstConsoleCrash(process.stderr)

export function createSafeConsole(consoleLike: ConsoleLike): ConsoleLike {
  return {
    log: (...args) => writeSafely(consoleLike, consoleLike.log, args),
    warn: (...args) => writeSafely(consoleLike, consoleLike.warn, args),
    error: (...args) => writeSafely(consoleLike, consoleLike.error, args)
  }
}

export function isBrokenPipeError(error: unknown): boolean {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
  return (
    code === 'EPIPE' || code === 'ERR_STREAM_DESTROYED' || code === 'ERR_STREAM_WRITE_AFTER_END'
  )
}

function writeSafely(
  receiver: ConsoleLike,
  method: (...args: unknown[]) => void,
  args: unknown[]
): void {
  try {
    method.apply(receiver, args)
  } catch (error) {
    if (!isBrokenPipeError(error)) {
      throw error
    }
  }
}
