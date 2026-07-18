import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { launchDevApp, repoRoot } from './lib/app-launcher.mjs'
import {
  collectProcessCensus,
  formatCensus,
  ownedProcessLedgerPaths,
  pruneDeadOwnedProcessRecords,
  waitForCleanProcessState,
  waitForNoLiveProcessState
} from './lib/process-census.mjs'

const timeoutMs = Number(process.env.VIDEORC_SMOKE_TIMEOUT_MS ?? 120000)
const stateRoot = mkdtempSync(join(tmpdir(), 'videorc-process-lifecycle-'))
const appDataDir = join(stateRoot, 'app-data')
const userDataDir = join(stateRoot, 'user-data')
const ledgerPaths = ownedProcessLedgerPaths({
  appDataDir,
  userDataDir,
  workspaceRoot: repoRoot
})

let launched

try {
  launched = await launchDevApp({
    env: {
      VIDEORC_APP_DATA_DIR: appDataDir,
      VIDEORC_USER_DATA_DIR: userDataDir,
      VIDEORC_DISABLE_AUTO_PREVIEW: '1',
      VIDEORC_DISABLE_BACKEND_REAP: '0'
    },
    timeoutMs,
    requiredMarkers: ['backend-ready'],
    onLine: (line) => {
      if (/Reaping|Backend exited|Native preview host helper|error|panic/i.test(line)) {
        console.log(line)
      }
    }
  })

  const running = await collectProcessCensus({
    ledgerPaths,
    pgid: launched.process.pid
  })
  console.log('\n=== running process census ===')
  console.log(formatCensus(running))

  assert.ok(running.records.length > 0, 'running app should record at least one owned process')
  assert.ok(
    running.aliveRecords.length > 0,
    'running app should have at least one live owned process record'
  )
} finally {
  if (launched) {
    await launched.stop()
  }

  console.log('\n=== teardown process census ===')
  const stopped = await waitForNoLiveProcessState({
    ledgerPaths,
    pgid: launched?.process?.pid,
    timeoutMs: 10000
  })
  console.log(formatCensus(stopped))

  const pruned = await pruneDeadOwnedProcessRecords({ ledgerPaths })
  for (const entry of pruned) {
    console.log(
      `pruned ${entry.removed.length} dead owned process record(s) from ${entry.ledgerPath}`
    )
  }

  const clean = await waitForCleanProcessState({
    ledgerPaths,
    pgid: launched?.process?.pid,
    timeoutMs: 1000
  })
  console.log('\n=== clean process census ===')
  console.log(formatCensus(clean))

  await rm(stateRoot, { recursive: true, force: true })
}

console.log('Process lifecycle smoke OK - owned process records and process group cleaned up.')
