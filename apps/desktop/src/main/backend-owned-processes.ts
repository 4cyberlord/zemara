import { createHash } from 'node:crypto'
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export interface OwnedProcessRecord {
  pid: number
  label: string
  startedAt: string
}

type KillProcess = (pid: number, signal: NodeJS.Signals) => void
type Schedule = (callback: () => void, delayMs: number) => unknown
type Sleep = (delayMs: number) => void
type OpenExclusiveFile = (path: string) => number
type CloseFile = (fileDescriptor: number) => void
type RemoveFile = (path: string) => void

export interface OwnedProcessRegistryOptions {
  ledgerPath: string | string[]
  currentPid?: number
  platform?: NodeJS.Platform
  now?: () => string
  readFile?: (path: string) => string
  writeFile?: (path: string, contents: string) => void
  makeDir?: (path: string) => void
  killProcess?: KillProcess
  schedule?: Schedule
}

export interface ReapOwnedProcessesOptions {
  disabled?: boolean
  killGraceMs?: number
}

export interface OwnedProcessStartupLockOptions {
  lockPath: string
  timeoutMs?: number
  retryMs?: number
  currentPid?: number
  nowMs?: () => number
  sleep?: Sleep
  makeDir?: (path: string) => void
  openFileExclusive?: OpenExclusiveFile
  closeFile?: CloseFile
  removeFile?: RemoveFile
  writeFile?: (path: string, contents: string) => void
}

export function ownedProcessLedgerPath(userDataPath: string, workspaceRoot: string): string {
  const key = createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 16)
  return join(userDataPath, 'owned-processes', `${key}.json`)
}

export function globalOwnedProcessLedgerPath(appDataPath: string, appName: string): string {
  return join(appDataPath, appName, 'owned-processes', 'global.json')
}

export function ownedProcessStartupLockPath(appDataPath: string, appName: string): string {
  return join(appDataPath, appName, 'owned-processes', 'startup.lock')
}

export function acquireOwnedProcessStartupLock(
  options: OwnedProcessStartupLockOptions
): () => void {
  const timeoutMs = options.timeoutMs ?? 5000
  const retryMs = options.retryMs ?? 50
  const currentPid = options.currentPid ?? process.pid
  const nowMs = options.nowMs ?? (() => Date.now())
  const sleep = options.sleep ?? sleepSync
  const makeDir = options.makeDir ?? ((path) => mkdirSync(path, { recursive: true }))
  const openFileExclusive = options.openFileExclusive ?? ((path) => openSync(path, 'wx', 0o600))
  const closeFile = options.closeFile ?? ((fileDescriptor) => closeSync(fileDescriptor))
  const removeFile = options.removeFile ?? ((path) => unlinkSync(path))
  const writeFile = options.writeFile ?? ((path, contents) => writeFileSync(path, contents))
  const startedAtMs = nowMs()

  makeDir(dirname(options.lockPath))

  for (;;) {
    let fileDescriptor: number | null = null
    try {
      fileDescriptor = openFileExclusive(options.lockPath)
      writeFile(
        options.lockPath,
        `${JSON.stringify({ pid: currentPid, acquiredAt: new Date().toISOString() }, null, 2)}\n`
      )
      const ownedFileDescriptor = fileDescriptor
      let released = false
      return () => {
        if (released) {
          return
        }
        released = true
        try {
          closeFile(ownedFileDescriptor)
        } catch {
          // The descriptor may already be closed; releasing the lock should be best-effort.
        }
        try {
          removeFile(options.lockPath)
        } catch {
          // A later process may already have cleaned up a stale lock.
        }
      }
    } catch (error) {
      if (fileDescriptor !== null) {
        try {
          closeFile(fileDescriptor)
        } catch {
          // Best effort.
        }
      }

      const code =
        typeof error === 'object' && error ? (error as { code?: string }).code : undefined
      if (code !== 'EEXIST') {
        throw error
      }
      if (nowMs() - startedAtMs >= timeoutMs) {
        throw new Error(`Timed out waiting for owned process startup lock at ${options.lockPath}`, {
          cause: error
        })
      }
      sleep(retryMs)
    }
  }
}

export class OwnedProcessRegistry {
  private readonly ledgerPaths: string[]
  private readonly currentPid: number
  private readonly platform: NodeJS.Platform
  private readonly now: () => string
  private readonly readFile: (path: string) => string
  private readonly writeFile: (path: string, contents: string) => void
  private readonly makeDir: (path: string) => void
  private readonly killProcess: KillProcess
  private readonly schedule: Schedule

  constructor(private readonly options: OwnedProcessRegistryOptions) {
    const ledgerPaths = Array.isArray(options.ledgerPath)
      ? options.ledgerPath
      : [options.ledgerPath]
    this.ledgerPaths = Array.from(new Set(ledgerPaths))
    this.currentPid = options.currentPid ?? process.pid
    this.platform = options.platform ?? process.platform
    this.now = options.now ?? (() => new Date().toISOString())
    this.readFile = options.readFile ?? ((path) => readFileSync(path, 'utf8'))
    this.writeFile = options.writeFile ?? ((path, contents) => writeFileSync(path, contents))
    this.makeDir = options.makeDir ?? ((path) => mkdirSync(path, { recursive: true }))
    this.killProcess = options.killProcess ?? ((pid, signal) => process.kill(pid, signal))
    this.schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
  }

  record(pid: number | undefined, label: string): void {
    if (!validPid(pid) || pid === this.currentPid) {
      return
    }

    const records = this.readRecords().filter((record) => record.pid !== pid)
    records.push({ pid, label, startedAt: this.now() })
    this.writeRecords(records)
  }

  remove(pid: number | undefined): void {
    if (!validPid(pid)) {
      return
    }

    const records = this.readRecords().filter((record) => record.pid !== pid)
    this.writeRecords(records)
  }

  reapStale(options: ReapOwnedProcessesOptions = {}): OwnedProcessRecord[] {
    if (options.disabled) {
      return []
    }

    const stale = dedupeRecords(
      this.readRecords().filter((record) => record.pid !== this.currentPid && validPid(record.pid))
    )
    if (stale.length === 0) {
      return []
    }

    this.writeRecords([])

    if (this.platform === 'win32') {
      // Windows has no graceful signal: Node maps every signal to
      // TerminateProcess, so the SIGTERM → grace → SIGKILL ladder collapses
      // into one hard kill. Only ledger-recorded PIDs are touched, same as
      // the Unix arm.
      for (const record of stale) {
        this.tryKill(record.pid, 'SIGKILL')
      }
      return stale
    }

    for (const record of stale) {
      this.tryKill(record.pid, 'SIGTERM')
    }

    const killGraceMs = options.killGraceMs ?? 1500
    this.schedule(() => {
      for (const record of stale) {
        this.tryKill(record.pid, 'SIGKILL')
      }
    }, killGraceMs)

    return stale
  }

  private tryKill(pid: number, signal: NodeJS.Signals): void {
    try {
      this.killProcess(pid, signal)
    } catch {
      // The process may have already exited; stale ledgers should not fail app startup.
    }
  }

  private readRecords(): OwnedProcessRecord[] {
    return dedupeRecords(
      this.ledgerPaths.flatMap((ledgerPath) => this.readLedgerRecords(ledgerPath))
    )
  }

  private readLedgerRecords(ledgerPath: string): OwnedProcessRecord[] {
    try {
      const parsed = JSON.parse(this.readFile(ledgerPath)) as unknown
      if (!Array.isArray(parsed)) {
        return []
      }
      return parsed.filter(isOwnedProcessRecord)
    } catch {
      return []
    }
  }

  private writeRecords(records: OwnedProcessRecord[]): void {
    for (const ledgerPath of this.ledgerPaths) {
      this.makeDir(dirname(ledgerPath))
      this.writeFile(ledgerPath, `${JSON.stringify(records, null, 2)}\n`)
    }
  }
}

function dedupeRecords(records: OwnedProcessRecord[]): OwnedProcessRecord[] {
  const seen = new Set<number>()
  const deduped: OwnedProcessRecord[] = []
  for (const record of records) {
    if (seen.has(record.pid)) {
      continue
    }
    seen.add(record.pid)
    deduped.push(record)
  }
  return deduped
}

function isOwnedProcessRecord(value: unknown): value is OwnedProcessRecord {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Partial<OwnedProcessRecord>
  return (
    validPid(record.pid) && typeof record.label === 'string' && typeof record.startedAt === 'string'
  )
}

function validPid(pid: unknown): pid is number {
  return typeof pid === 'number' && Number.isInteger(pid) && pid > 1
}

function sleepSync(delayMs: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs)
}
