import { describe, expect, it } from 'vitest'

import { cloudAiReadiness } from './ai-readiness'
import type { AiCapabilities, AiQuotaStatus, VideorcAccountSnapshot } from './backend'

const signedInAccount: VideorcAccountSnapshot = {
  status: 'signed-in',
  username: 'orc@videorc.com'
}

type AiCapabilitiesOverrides = Partial<
  Omit<
    AiCapabilities,
    | 'entitlement'
    | 'features'
    | 'limits'
    | 'models'
    | 'objectStorage'
    | 'readiness'
    | 'transcription'
    | 'workflow'
  >
> & {
  entitlement?: Partial<AiCapabilities['entitlement']>
  features?: Partial<AiCapabilities['features']>
  limits?: Partial<AiCapabilities['limits']>
  models?: Partial<AiCapabilities['models']>
  objectStorage?: Partial<AiCapabilities['objectStorage']>
  readiness?: Partial<AiCapabilities['readiness']> & {
    access?: Partial<AiCapabilities['readiness']['access']>
    gateway?: Partial<AiCapabilities['readiness']['gateway']>
    objectStorage?: Partial<AiCapabilities['readiness']['objectStorage']>
    transcription?: Partial<AiCapabilities['readiness']['transcription']>
    worker?: Partial<AiCapabilities['readiness']['worker']>
  }
  transcription?: Partial<AiCapabilities['transcription']>
  workflow?: Partial<AiCapabilities['workflow']>
}

function capabilities(overrides: AiCapabilitiesOverrides = {}): AiCapabilities {
  const base: AiCapabilities = {
    entitlement: {
      checkedAt: '2026-06-15T12:00:00.000Z',
      cloudAi: true,
      expiresAt: '2026-06-15T12:05:00.000Z',
      isPremium: true,
      subscriptionStatus: 'active',
      tier: 'premium'
    },
    features: {
      cloudAiEnabled: true,
      gatewayConfigured: true,
      modelTestingEnabled: true,
      multipartAudioJobsEnabled: true,
      objectBackedJobsEnabled: false,
      transcriptJobsEnabled: true,
      uploadTicketsEnabled: false
    },
    generatedAt: '2026-06-15T12:30:00.000Z',
    limits: {
      dailyJobs: 25,
      maxAudioBytes: 13_107_200,
      maxAudioMegabytes: 12.5,
      maxOutputTokens: 1900,
      maxTranscriptCharacters: 90_000,
      monthlyJobs: 600
    },
    models: {
      allowedTextModelCount: 2,
      allowedTextModelsConfigured: true,
      defaultTextModel: 'openai/gpt-5.5',
      fallbackTextModels: ['google/gemini']
    },
    objectStorage: {
      deleteConfigured: false,
      downloadConfigured: false,
      provider: null,
      providerError: null,
      proofConfigured: false,
      proofTtlMs: null,
      uploadConfigured: false
    },
    readiness: {
      access: {
        cloudAiEntitled: true,
        globallyDisabled: false
      },
      gateway: {
        configError: null,
        configured: true
      },
      objectStorage: {
        deleteConfigError: null,
        downloadConfigError: null,
        proofConfigError: null,
        providerError: null,
        uploadConfigError: null
      },
      transcription: {
        configError: null,
        configured: true
      },
      worker: {
        configError: null,
        configured: true,
        queuedJobDelayMs: 120_000,
        recentlyRanAt: null,
        runningJobTimeoutMs: 900_000,
        status: 'unknown'
      }
    },
    transcription: {
      configured: true,
      configError: null,
      maxAudioBytes: 13_107_200,
      maxAudioMegabytes: 12.5,
      requestTimeoutMs: 65_000
    },
    workflow: {
      inputModes: [
        { enabled: true, kind: 'transcript' },
        { enabled: true, kind: 'multipart-audio' },
        { enabled: false, kind: 'stored-audio-object' }
      ],
      kind: 'post-recording-publish-pack',
      outputs: ['summary']
    }
  }

  return {
    ...base,
    ...overrides,
    entitlement: { ...base.entitlement, ...overrides.entitlement },
    features: { ...base.features, ...overrides.features },
    limits: { ...base.limits, ...overrides.limits },
    models: { ...base.models, ...overrides.models },
    objectStorage: { ...base.objectStorage, ...overrides.objectStorage },
    readiness: {
      ...base.readiness,
      ...overrides.readiness,
      access: { ...base.readiness.access, ...overrides.readiness?.access },
      gateway: { ...base.readiness.gateway, ...overrides.readiness?.gateway },
      objectStorage: {
        ...base.readiness.objectStorage,
        ...overrides.readiness?.objectStorage
      },
      transcription: {
        ...base.readiness.transcription,
        ...overrides.readiness?.transcription
      },
      worker: {
        ...base.readiness.worker,
        ...overrides.readiness?.worker
      }
    },
    transcription: { ...base.transcription, ...overrides.transcription },
    workflow: { ...base.workflow, ...overrides.workflow }
  }
}

type AiQuotaStatusOverrides = Partial<
  Omit<AiQuotaStatus, 'access' | 'entitlement' | 'monthly' | 'today'>
> & {
  access?: Partial<AiQuotaStatus['access']>
  entitlement?: Partial<AiQuotaStatus['entitlement']>
  monthly?: Partial<AiQuotaStatus['monthly']>
  today?: Partial<AiQuotaStatus['today']>
}

function quota(overrides: AiQuotaStatusOverrides = {}): AiQuotaStatus {
  const base: AiQuotaStatus = {
    access: {
      allowed: true,
      code: null,
      message: null,
      status: null
    },
    entitlement: {
      cancelAtPeriodEnd: false,
      checkedAt: '2026-06-15T12:00:00.000Z',
      cloudAi: true,
      currentPeriodEnd: '2026-07-15T00:00:00.000Z',
      expiresAt: '2026-06-15T12:05:00.000Z',
      isPremium: true,
      subscriptionStatus: 'active',
      tier: 'premium'
    },
    generatedAt: '2026-06-15T23:30:00.000Z',
    monthly: {
      limit: 50,
      remaining: 38,
      resetAt: '2026-07-01T00:00:00.000Z',
      used: 12
    },
    today: {
      limit: 5,
      remaining: 3,
      resetAt: '2026-06-16T00:00:00.000Z',
      used: 2
    }
  }

  return {
    ...base,
    ...overrides,
    access: { ...base.access, ...overrides.access },
    entitlement: { ...base.entitlement, ...overrides.entitlement },
    monthly: { ...base.monthly, ...overrides.monthly },
    today: { ...base.today, ...overrides.today }
  }
}

describe('cloudAiReadiness', () => {
  it('requires sign-in before cloud AI can run', () => {
    const readiness = cloudAiReadiness({
      account: { status: 'signed-out' },
      capabilities: null,
      error: null,
      loading: false,
      quota: null
    })

    expect(readiness.state).toBe('signed-out')
    expect(readiness.ready).toBe(false)
  })

  it('maps an expired token (401 "Sign in…" error while signed-in) to session-expired, never signed-out copy', () => {
    const readiness = cloudAiReadiness({
      account: signedInAccount,
      capabilities: null,
      error: 'Sign in to use cloud AI.',
      loading: false,
      quota: null
    })

    expect(readiness.state).toBe('session-expired')
    expect(readiness.ready).toBe(false)
    expect(readiness.title).toBe('Zemara session expired')
    expect(readiness.description).toMatch(/sign in again/i)
  })

  it('keeps non-auth capability errors on the plain error state', () => {
    const readiness = cloudAiReadiness({
      account: signedInAccount,
      capabilities: null,
      error: 'Videorc API request failed (503): upstream down',
      loading: false,
      quota: null
    })

    expect(readiness.state).toBe('error')
    expect(readiness.description).toMatch(/503/)
  })

  it('blocks Basic accounts with a Premium reason from server capabilities', () => {
    const readiness = cloudAiReadiness({
      account: signedInAccount,
      capabilities: capabilities({
        entitlement: { cloudAi: false, isPremium: false, tier: 'basic' },
        features: {
          cloudAiEnabled: false,
          modelTestingEnabled: false,
          multipartAudioJobsEnabled: false,
          objectBackedJobsEnabled: false,
          transcriptJobsEnabled: false,
          uploadTicketsEnabled: false
        },
        readiness: {
          access: { cloudAiEntitled: false, globallyDisabled: false }
        },
        workflow: {
          inputModes: [
            { enabled: false, kind: 'transcript' },
            { enabled: false, kind: 'multipart-audio' }
          ],
          kind: 'post-recording-publish-pack',
          outputs: ['summary']
        }
      }),
      error: null,
      loading: false,
      quota: null
    })

    expect(readiness.state).toBe('premium-required')
    expect(readiness.title).toContain('Premium')
  })

  it('surfaces server Gateway configuration failures', () => {
    const readiness = cloudAiReadiness({
      account: signedInAccount,
      capabilities: capabilities({
        readiness: {
          gateway: {
            configured: false,
            configError: 'AI Gateway key is missing.'
          }
        }
      }),
      error: null,
      loading: false,
      quota: null
    })

    expect(readiness.state).toBe('server-unconfigured')
    expect(readiness.description).toBe('AI Gateway key is missing.')
  })

  it('surfaces missing server worker configuration', () => {
    const readiness = cloudAiReadiness({
      account: signedInAccount,
      capabilities: capabilities({
        readiness: {
          worker: {
            configured: false,
            configError: 'AI worker secret is missing.',
            queuedJobDelayMs: 120_000,
            recentlyRanAt: null,
            runningJobTimeoutMs: 900_000,
            status: 'unconfigured'
          }
        }
      }),
      error: null,
      loading: false,
      quota: null
    })

    expect(readiness.state).toBe('server-unconfigured')
    expect(readiness.description).toBe('AI worker secret is missing.')
  })

  it('allows transcript-only jobs when server transcription is not configured', () => {
    const readiness = cloudAiReadiness({
      account: signedInAccount,
      capabilities: capabilities({
        features: {
          multipartAudioJobsEnabled: false,
          objectBackedJobsEnabled: false,
          transcriptJobsEnabled: true
        },
        readiness: {
          transcription: {
            configured: false,
            configError: 'Transcription provider missing.'
          }
        },
        transcription: {
          configured: false,
          configError: 'Transcription provider missing.'
        },
        workflow: {
          inputModes: [
            { enabled: true, kind: 'transcript' },
            { enabled: false, kind: 'multipart-audio' },
            { enabled: false, kind: 'stored-audio-object' }
          ],
          kind: 'post-recording-publish-pack',
          outputs: ['summary']
        }
      }),
      error: null,
      loading: false,
      quota: null
    })

    expect(readiness.ready).toBe(true)
    expect(readiness.inputModeLabels).toEqual(['transcript'])
  })

  it('blocks exhausted quota even when capabilities are ready', () => {
    const readiness = cloudAiReadiness({
      account: signedInAccount,
      capabilities: capabilities(),
      error: null,
      loading: false,
      quota: quota({
        access: {
          allowed: false,
          code: 'ai-daily-quota-exhausted',
          message: 'Daily AI quota exhausted.',
          status: 429
        },
        today: {
          remaining: 0
        }
      })
    })

    expect(readiness.state).toBe('quota-exhausted')
    expect(readiness.quotaLabel).toBe('0/5 today, 38/50 this month')
  })

  it('reports ready input modes and quota for Premium accounts', () => {
    const readiness = cloudAiReadiness({
      account: signedInAccount,
      capabilities: capabilities(),
      error: null,
      loading: false,
      quota: quota()
    })

    expect(readiness.ready).toBe(true)
    expect(readiness.inputModeLabels).toEqual(['transcript', 'audio upload'])
    expect(readiness.description).toContain('openai/gpt-5.5')
  })
})
