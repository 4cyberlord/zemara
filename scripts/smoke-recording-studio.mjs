import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

import {
  buildRecordingStudioGateSteps,
  formatRecordingStudioGatePlan
} from './lib/recording-studio-gates.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run') || args.has('--print-only')
const includeDeviceSmoke =
  args.has('--include-device-smoke') || process.env.VIDEORC_RECORDING_STUDIO_DEVICE_SMOKE === '1'
const includeAppSmoke = process.env.VIDEORC_RECORDING_STUDIO_SKIP_APP_SMOKE !== '1'
const steps = buildRecordingStudioGateSteps({ includeAppSmoke, includeDeviceSmoke })

console.log(formatRecordingStudioGatePlan({ steps }))
if (!includeAppSmoke) {
  console.warn(
    'recording-studio-gates: app smoke is skipped by VIDEORC_RECORDING_STUDIO_SKIP_APP_SMOKE=1; this is not a complete recording-studio gate.'
  )
}

if (dryRun) {
  process.exit(0)
}

for (const step of steps) {
  await runStep(step)
}

console.log('recording-studio-gates: PASS')

function runStep(step) {
  return new Promise((resolveStep, rejectStep) => {
    console.log(`\n[recording-studio-gates] ${step.label}`)
    const child = spawn(step.command, step.args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...step.env
      },
      shell: process.platform === 'win32',
      stdio: 'inherit'
    })

    child.on('error', rejectStep)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolveStep()
        return
      }
      rejectStep(
        new Error(
          `${step.label} failed: ${step.command} ${step.args.join(' ')} exited with code=${code} signal=${signal}`
        )
      )
    })
  })
}
