import { execFileSync } from 'node:child_process'

import {
  evaluateProviderReadiness,
  formatProviderReadinessConsole,
  formatProviderReadinessMarkdown
} from './lib/provider-readiness.mjs'

const strict = process.env.VIDEORC_SMOKE_REQUIRE_PROVIDER_READY === '1'
const markdown = process.argv.includes('--markdown')

const result = evaluateProviderReadiness({
  env: process.env,
  strict,
  commit: commitSha()
})

if (markdown) {
  console.log(formatProviderReadinessMarkdown(result))
} else {
  console.log(formatProviderReadinessConsole(result))
}

if (!result.ready && strict) {
  process.exitCode = 1
}

function commitSha() {
  if (process.env.GITHUB_SHA?.trim()) {
    return process.env.GITHUB_SHA.trim()
  }
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}
