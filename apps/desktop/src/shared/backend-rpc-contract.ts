import type {
  AdminConnection,
  AdminConnectionTestResult,
  AdminEvent,
  AdminMember,
  AdminMemberInput,
  AdminRegisterResult,
  AdminSermon,
  AdminSermonInput,
  AdminSermonSeries,
  AdminVideo,
  AdminVideoInput,
  AttendanceList,
  AttendanceQr,
  AttendanceRecord,
  AttendanceSession,
  BackendHealth,
  CompositorFrameReady,
  CompositorStatus,
  CreateCampaignInput,
  CreateEventInput,
  CreateLocationInput,
  CreateTeamUserInput,
  CreateUnitInput,
  CreateUnitPositionInput,
  DeviceList,
  DiagnosticStats,
  EntitlementsSnapshot,
  FileAssessment,
  GateStatus,
  GeocodeResult,
  GeocodeReverseResult,
  LiveLayoutApplyStatus,
  LivingTextAvailableTranslation,
  LivingTextBook,
  LivingTextResolvedCitation,
  LivingTextSyncSummary,
  LivingTextTranslation,
  LivingTextVerse,
  Location,
  ManualCheckInInput,
  MembersPage,
  MembersQuery,
  NoiseCleanupJob,
  NotificationCampaign,
  OAuthCallbackResult,
  OAuthCompleteParams,
  OrganizationalUnit,
  OrganizationalUnitMembership,
  OrganizationalUnitPosition,
  OrganizationalUnitPositionAssignment,
  PreviewCameraStatus,
  PreviewLiveStatus,
  PreviewScreenStatus,
  PreviewSurfaceStatus,
  RecordingStatus,
  Scene,
  SceneCommitStatus,
  SceneConfigParams,
  ServerEvent,
  ServerResponse,
  SessionCommentsListParams,
  SessionCommentsPage,
  SessionDeletionOperation,
  SessionStorageTotals,
  SessionSummary,
  StartSessionParams,
  TeamUser,
  UnitMemberSummary,
  UpdateCampaignInput,
  UpdateEventInput,
  UpdateLocationInput,
  UpdateTeamUserInput,
  UpdateUnitInput,
  UploadedImage,
  UploadImageInput,
  VideoCategory,
  VideorcAccountSnapshot,
  YoutubeImportInput,
  YoutubeSearchResult
} from './backend'
import { LAYOUT_PRESET_VALUES } from './backend'
import {
  arraySchema,
  boundedJsonValueSchema,
  booleanSchema,
  enumSchema,
  literalSchema,
  nullableSchema,
  numberSchema,
  objectSchema,
  optionalSchema,
  runtimeSchema,
  stringSchema,
  undefinedSchema,
  unionSchema,
  type RuntimeSchema
} from './runtime-schema'

export interface BackendRpcDefinition<TParams, TResult> {
  params: TParams
  result: TResult
}

type LayoutTransactionResult = LiveLayoutApplyStatus & {
  intentId: number
  compositorStatus: CompositorStatus
  presentationProven: boolean
}

/**
 * Compile-time method map for the capture/account/file operations where a
 * misspelled method, request drift, or response drift is most destructive.
 * Less critical methods can remain on BackendClient's compatible untyped
 * overload while they are migrated incrementally.
 */
export interface BackendRpcMethodMap {
  'health.ping': BackendRpcDefinition<{ ffmpegPath?: string } | undefined, BackendHealth>
  'entitlements.get': BackendRpcDefinition<undefined, EntitlementsSnapshot>
  'entitlements.refresh': BackendRpcDefinition<undefined, EntitlementsSnapshot>
  'account.get': BackendRpcDefinition<undefined, VideorcAccountSnapshot>
  'account.complete_sign_in': BackendRpcDefinition<
    { code: string; state: string; verifier: string; intentGeneration: number },
    VideorcAccountSnapshot
  >
  'account.sign_out': BackendRpcDefinition<undefined, VideorcAccountSnapshot>
  'platformAccounts.oauth.complete': BackendRpcDefinition<OAuthCompleteParams, OAuthCallbackResult>
  'devices.list': BackendRpcDefinition<{ ffmpegPath?: string } | undefined, DeviceList>
  'recording.status': BackendRpcDefinition<undefined, RecordingStatus>
  'session.start': BackendRpcDefinition<StartSessionParams, RecordingStatus>
  'session.stop': BackendRpcDefinition<undefined, RecordingStatus>
  'scene.get': BackendRpcDefinition<undefined, Scene>
  'scene.load_from_capture_config': BackendRpcDefinition<SceneConfigParams, SceneCommitStatus>
  'scene.layout.apply_preview': BackendRpcDefinition<
    SceneConfigParams & { intentId: number },
    LayoutTransactionResult
  >
  'scene.layout.apply_live': BackendRpcDefinition<
    SceneConfigParams & { intentId: number },
    LayoutTransactionResult
  >
  'compositor.status': BackendRpcDefinition<undefined, CompositorStatus>
  'preview.live.status': BackendRpcDefinition<undefined, PreviewLiveStatus>
  'preview.surface.status': BackendRpcDefinition<undefined, PreviewSurfaceStatus>
  'preview.camera.status': BackendRpcDefinition<undefined, PreviewCameraStatus>
  'preview.screen.status': BackendRpcDefinition<undefined, PreviewScreenStatus>
  'diagnostics.stats': BackendRpcDefinition<undefined, DiagnosticStats>
  'sessions.list': BackendRpcDefinition<{ limit?: number } | undefined, SessionSummary[]>
  'sessions.storage': BackendRpcDefinition<undefined, SessionStorageTotals>
  'sessions.comments.list': BackendRpcDefinition<SessionCommentsListParams, SessionCommentsPage>
  'sessions.delete': BackendRpcDefinition<{ sessionIds: string[] }, SessionDeletionOperation[]>
  'sessions.delete.pending': BackendRpcDefinition<undefined, SessionDeletionOperation[]>
  'noiseCleanup.start': BackendRpcDefinition<{ sessionId: string }, NoiseCleanupJob>
  'noiseCleanup.cancel': BackendRpcDefinition<{ jobId: string }, NoiseCleanupJob>
  'noiseCleanup.list': BackendRpcDefinition<undefined, NoiseCleanupJob[]>
  'repair.assess_file': BackendRpcDefinition<{ sessionId: string }, FileAssessment>
  'repair.repair_file': BackendRpcDefinition<
    { sessionId: string; expectAudio?: boolean; intendedFps?: number },
    GateStatus
  >
  'repair.restore_file': BackendRpcDefinition<{ sessionId: string }, { restored: boolean }>
  'admin.connection.get': BackendRpcDefinition<undefined, AdminConnection>
  'admin.connection.set': BackendRpcDefinition<
    { baseUrl: string; apiKey?: string },
    AdminConnection
  >
  'admin.connection.clear': BackendRpcDefinition<undefined, AdminConnection>
  'admin.connection.test': BackendRpcDefinition<
    { baseUrl: string; apiKey: string },
    AdminConnectionTestResult
  >
  'admin.register': BackendRpcDefinition<
    {
      baseUrl: string
      organizationName: string
      ownerName: string
      ownerEmail: string
      ownerPassword: string
    },
    AdminRegisterResult
  >
  'livingText.books.list': BackendRpcDefinition<undefined, LivingTextBook[]>
  'livingText.availableTranslations.list': BackendRpcDefinition<undefined, LivingTextAvailableTranslation[]>
  'livingText.translations.list': BackendRpcDefinition<undefined, LivingTextTranslation[]>
  'livingText.sync': BackendRpcDefinition<{ translationCode: string }, LivingTextSyncSummary>
  'livingText.chapter.get': BackendRpcDefinition<
    { translationCode: string; book: string; chapter: number },
    LivingTextVerse[]
  >
  'livingText.detect': BackendRpcDefinition<
    { translationCode: string; text: string },
    LivingTextResolvedCitation[]
  >
  'admin.sermons.list': BackendRpcDefinition<undefined, AdminSermon[]>
  'admin.sermons.create': BackendRpcDefinition<
    Omit<AdminSermonInput, 'status'> & { title: string; status: 'draft' | 'published' },
    AdminSermon
  >
  'admin.sermons.update': BackendRpcDefinition<{ id: string } & AdminSermonInput, AdminSermon>
  'admin.sermons.delete': BackendRpcDefinition<{ id: string }, { deleted: boolean }>
  'admin.sermons.series.list': BackendRpcDefinition<undefined, AdminSermonSeries[]>
  'admin.sermons.series.create': BackendRpcDefinition<
    { title: string; description?: string; imagePath?: string },
    AdminSermonSeries
  >
  'admin.videos.list': BackendRpcDefinition<undefined, AdminVideo[]>
  'admin.videos.create': BackendRpcDefinition<
    Omit<AdminVideoInput, 'status'> & { title: string; videoUrl: string },
    AdminVideo
  >
  'admin.videos.update': BackendRpcDefinition<{ id: string } & AdminVideoInput, AdminVideo>
  'admin.videos.delete': BackendRpcDefinition<{ id: string }, { deleted: boolean }>
  'admin.videos.toggle_featured': BackendRpcDefinition<{ id: string }, { isFeatured: boolean }>
  'admin.videos.categories.list': BackendRpcDefinition<undefined, VideoCategory[]>
  'admin.videos.categories.create': BackendRpcDefinition<{ name: string }, VideoCategory>
  'admin.videos.youtube_search': BackendRpcDefinition<{ query: string }, YoutubeSearchResult[]>
  'admin.videos.youtube_import': BackendRpcDefinition<YoutubeImportInput, AdminVideo[]>
  'admin.members.list': BackendRpcDefinition<MembersQuery | undefined, MembersPage>
  'admin.members.create': BackendRpcDefinition<
    AdminMemberInput & { fullName: string; phone: string },
    AdminMember
  >
  'admin.members.update': BackendRpcDefinition<{ id: string } & AdminMemberInput, AdminMember>
  'admin.members.delete': BackendRpcDefinition<{ id: string }, { deleted: boolean }>
  'admin.notifications.list': BackendRpcDefinition<undefined, NotificationCampaign[]>
  'admin.notifications.create': BackendRpcDefinition<CreateCampaignInput, NotificationCampaign>
  'admin.notifications.update': BackendRpcDefinition<
    { id: string } & UpdateCampaignInput,
    NotificationCampaign
  >
  'admin.notifications.delete': BackendRpcDefinition<{ id: string }, { deleted: boolean }>
  'admin.notifications.send': BackendRpcDefinition<{ id: string }, NotificationCampaign>
  'admin.events.list': BackendRpcDefinition<undefined, AdminEvent[]>
  'admin.events.create': BackendRpcDefinition<CreateEventInput, AdminEvent>
  'admin.events.update': BackendRpcDefinition<{ id: string } & UpdateEventInput, AdminEvent>
  'admin.events.delete': BackendRpcDefinition<{ id: string }, { deleted: boolean }>
  'admin.uploads.image': BackendRpcDefinition<UploadImageInput, UploadedImage>
  'admin.attendance.open': BackendRpcDefinition<{ eventId: string }, AttendanceSession>
  'admin.attendance.close': BackendRpcDefinition<{ eventId: string }, AttendanceSession>
  'admin.attendance.qr': BackendRpcDefinition<{ eventId: string }, AttendanceQr>
  'admin.attendance.list': BackendRpcDefinition<{ eventId: string }, AttendanceList>
  'admin.attendance.manual': BackendRpcDefinition<{ eventId: string } & ManualCheckInInput, AttendanceRecord>
  'admin.attendance.delete': BackendRpcDefinition<{ eventId: string; recordId: string }, { deleted: boolean }>
  'admin.units.list': BackendRpcDefinition<undefined, OrganizationalUnit[]>
  'admin.units.get': BackendRpcDefinition<{ id: string }, OrganizationalUnit>
  'admin.units.create': BackendRpcDefinition<CreateUnitInput, OrganizationalUnit>
  'admin.units.update': BackendRpcDefinition<{ id: string } & UpdateUnitInput, OrganizationalUnit>
  'admin.units.delete': BackendRpcDefinition<{ id: string }, { deleted: boolean }>
  'admin.units.members.add': BackendRpcDefinition<{ unitId: string; memberId: string }, OrganizationalUnitMembership>
  'admin.units.members.remove': BackendRpcDefinition<
    { unitId: string; membershipId: string },
    { deleted: boolean }
  >
  'admin.units.positions.create': BackendRpcDefinition<
    { unitId: string } & CreateUnitPositionInput,
    OrganizationalUnitPosition
  >
  'admin.units.positions.delete': BackendRpcDefinition<
    { unitId: string; positionId: string },
    { deleted: boolean }
  >
  'admin.units.positions.assign': BackendRpcDefinition<
    { unitId: string; positionId: string; memberId: string },
    OrganizationalUnitPositionAssignment
  >
  'admin.units.positions.assignments.end': BackendRpcDefinition<
    { unitId: string; positionId: string; assignmentId: string },
    OrganizationalUnitPositionAssignment
  >
  'admin.locations.list': BackendRpcDefinition<undefined, Location[]>
  'admin.locations.create': BackendRpcDefinition<CreateLocationInput, Location>
  'admin.locations.update': BackendRpcDefinition<{ id: string } & UpdateLocationInput, Location>
  'admin.locations.delete': BackendRpcDefinition<{ id: string }, { deleted: boolean }>
  'admin.team.list': BackendRpcDefinition<undefined, TeamUser[]>
  'admin.team.create': BackendRpcDefinition<CreateTeamUserInput, TeamUser>
  'admin.team.update': BackendRpcDefinition<{ id: string } & UpdateTeamUserInput, TeamUser>
  'admin.team.delete': BackendRpcDefinition<{ id: string }, { deleted: boolean }>
  'geocoding.search': BackendRpcDefinition<{ query: string }, GeocodeResult[]>
  'geocoding.reverse': BackendRpcDefinition<{ lat: number; lng: number }, GeocodeReverseResult>
}

export type BackendRpcMethod = keyof BackendRpcMethodMap
export type BackendRpcParams<TMethod extends BackendRpcMethod> =
  BackendRpcMethodMap[TMethod]['params']
export type BackendRpcResult<TMethod extends BackendRpcMethod> =
  BackendRpcMethodMap[TMethod]['result']

export interface BackendEventMap {
  'devices.changed': DeviceList
  'entitlements.updated': EntitlementsSnapshot
  'noiseCleanup.status': NoiseCleanupJob
  'platformAccounts.oauth.callback': OAuthCallbackResult
  'recording.status': RecordingStatus
  'scene.changed': Scene
  'compositor.status': CompositorStatus
  'preview.live.status': PreviewLiveStatus
  'preview.surface.status': PreviewSurfaceStatus
  'preview.camera.status': PreviewCameraStatus
  'preview.screen.status': PreviewScreenStatus
  'diagnostics.stats': DiagnosticStats
}

export type BackendEvent = keyof BackendEventMap

type RuntimeBackendRpcContract = {
  params: RuntimeSchema<unknown>
  result: RuntimeSchema<unknown>
}

const boundedString = stringSchema({ minLength: 1, maxLength: 16_384 })
const boundedPath = stringSchema({ minLength: 1, maxLength: 32_768 })
const timestamp = stringSchema({ minLength: 1, maxLength: 128 })
const optionalText = optionalSchema(stringSchema({ maxLength: 16_384 }))
const boundedBackendPayloadSchema = boundedJsonValueSchema()
const boundedBackendParamValueSchema = boundedJsonValueSchema({
  allowUndefinedObjectProperties: true
})
const boundedBackendParamsSchema = optionalSchema(boundedBackendParamValueSchema)
const MAX_BACKEND_WIRE_MESSAGE_CHARS = 16_000_000
const nonNegativeInteger = numberSchema({
  integer: true,
  min: 0,
  max: Number.MAX_SAFE_INTEGER
})

function boundedSemanticValue(
  description: string,
  semanticSchema: RuntimeSchema<unknown>
): RuntimeSchema<unknown> {
  return runtimeSchema(description, (value, path) => {
    boundedBackendPayloadSchema.parse(value, path)
    semanticSchema.parse(value, path)
    return value
  })
}

const accountSchema = objectSchema(
  {
    status: enumSchema(['signed-out', 'signed-in']),
    username: optionalText,
    displayName: optionalText,
    email: optionalText,
    avatarUrl: optionalText
  },
  { allowUnknown: false }
) as RuntimeSchema<VideorcAccountSnapshot>

const toolStatusSchema = objectSchema(
  {
    path: boundedPath,
    available: booleanSchema,
    version: optionalText,
    message: optionalText
  },
  { allowUnknown: false }
)

const backendHealthSchema = objectSchema(
  {
    status: boundedString,
    version: boundedString,
    platform: boundedString,
    ffmpeg: toolStatusSchema,
    databasePath: boundedPath,
    secretStoreBackend: boundedString
  },
  { allowUnknown: false }
) as RuntimeSchema<BackendHealth>

const entitlementCapabilitySchema = objectSchema(
  {
    featureId: enumSchema([
      'local-recording',
      'livestreaming',
      'multistreaming',
      'cloud-ai',
      'noise-cleanup'
    ]),
    state: enumSchema(['enabled', 'disabled', 'developer-override']),
    reason: optionalText
  },
  { allowUnknown: false }
)

const entitlementsSchema = objectSchema(
  {
    schemaVersion: nonNegativeInteger,
    tier: enumSchema(['basic', 'premium', 'developer']),
    source: enumSchema([
      'local-default',
      'env-override',
      'creem',
      'manual',
      'signed-cache',
      'future-license'
    ]),
    capabilities: arraySchema(entitlementCapabilitySchema, { maxLength: 32 }),
    limits: objectSchema(
      {
        recording: objectSchema(
          {
            maxWidth: numberSchema({ integer: true, min: 1, max: 65_536 }),
            maxHeight: numberSchema({ integer: true, min: 1, max: 65_536 }),
            maxFps: numberSchema({ integer: true, min: 1, max: 1000 }),
            maxBitrateKbps: optionalSchema(nonNegativeInteger)
          },
          { allowUnknown: false }
        ),
        streaming: objectSchema(
          {
            maxWidth: numberSchema({ integer: true, min: 1, max: 65_536 }),
            maxHeight: numberSchema({ integer: true, min: 1, max: 65_536 }),
            maxFps: numberSchema({ integer: true, min: 1, max: 1000 }),
            maxBitrateKbps: nonNegativeInteger,
            maxDestinations: numberSchema({ integer: true, min: 1, max: 1000 })
          },
          { allowUnknown: false }
        )
      },
      { allowUnknown: false }
    ),
    checkedAt: optionalSchema(timestamp),
    expiresAt: optionalSchema(timestamp)
  },
  { allowUnknown: false }
) as RuntimeSchema<EntitlementsSnapshot>

const deviceSchema = objectSchema(
  {
    id: boundedString,
    name: boundedString,
    kind: enumSchema(['screen', 'window', 'camera', 'microphone', 'system-audio']),
    status: enumSchema(['available', 'unavailable', 'permission-required']),
    detail: optionalText,
    width: optionalSchema(numberSchema({ integer: true, min: 0, max: 65_536 })),
    height: optionalSchema(numberSchema({ integer: true, min: 0, max: 65_536 }))
  },
  { allowUnknown: false }
)

const deviceListSchema = objectSchema(
  {
    devices: arraySchema(deviceSchema, { maxLength: 10_000 }),
    warnings: arraySchema(stringSchema({ maxLength: 16_384 }), { maxLength: 1000 })
  },
  { allowUnknown: false }
) as RuntimeSchema<DeviceList>

const recordingStatusSchema = objectSchema(
  {
    state: enumSchema(['idle', 'starting', 'recording', 'streaming', 'stopping', 'failed']),
    sessionId: optionalText,
    outputPath: optionalSchema(boundedPath),
    streamUrl: optionalText,
    startedAt: optionalSchema(timestamp),
    audioTracks: optionalSchema(arraySchema(boundedBackendPayloadSchema, { maxLength: 32 })),
    pipeline: optionalSchema(boundedBackendPayloadSchema),
    durationMs: optionalSchema(numberSchema({ min: 0 })),
    message: optionalText
  },
  { allowUnknown: false }
) as RuntimeSchema<RecordingStatus>

const sourceSelectionSchema = objectSchema(
  {
    screenId: optionalText,
    screenName: optionalText,
    windowId: optionalText,
    windowName: optionalText,
    cameraId: optionalText,
    cameraName: optionalText,
    microphoneId: optionalText,
    microphoneName: optionalText,
    testPattern: optionalSchema(booleanSchema)
  },
  { allowUnknown: false }
)

const layoutSchema = objectSchema(
  {
    layoutPreset: enumSchema(LAYOUT_PRESET_VALUES),
    cameraTransformMode: enumSchema(['preset', 'custom']),
    cameraTransform: nullableSchema(boundedBackendParamValueSchema),
    cameraCorner: enumSchema(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
    cameraSize: enumSchema(['small', 'medium', 'large']),
    cameraShape: enumSchema(['rectangle', 'rounded', 'circle']),
    cameraCornerRadiusPct: numberSchema({ min: 0, max: 100 }),
    cameraAspect: enumSchema(['source', 'square', 'portrait']),
    cameraChromaKeyEnabled: booleanSchema,
    cameraChromaKeyColor: stringSchema({ minLength: 1, maxLength: 16 }),
    cameraChromaKeySimilarityPct: numberSchema({ min: 0, max: 100 }),
    cameraChromaKeySmoothnessPct: numberSchema({ min: 0, max: 100 }),
    cameraChromaKeySpillPct: numberSchema({ min: 0, max: 100 }),
    cameraMargin: numberSchema({ min: 0 }),
    cameraFit: enumSchema(['fit', 'fill']),
    cameraMirror: booleanSchema,
    cameraZoom: numberSchema({ min: 0.01, max: 200 }),
    cameraOffsetX: numberSchema({ min: -100, max: 100 }),
    cameraOffsetY: numberSchema({ min: -100, max: 100 }),
    sideBySideSplit: enumSchema(['50-50', '60-40', '70-30']),
    sideBySideCameraSide: enumSchema(['left', 'right'])
  },
  { allowUnknown: false }
)

const sceneConfigSchema = objectSchema(
  {
    sources: sourceSelectionSchema,
    layout: layoutSchema,
    video: optionalSchema(boundedBackendParamValueSchema),
    background: optionalSchema(boundedBackendParamValueSchema),
    protectedOverlayWindowIds: optionalSchema(
      arraySchema(numberSchema({ integer: true, min: 0 }), { maxLength: 16 })
    )
  },
  { allowUnknown: false }
)

const layoutTransactionParamsSchema = runtimeSchema<unknown>(
  'a valid layout transaction',
  (value, path) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return sceneConfigSchema.parse(value, path)
    }
    const { intentId, ...sceneConfig } = value as Record<string, unknown>
    numberSchema({ integer: true, min: 1 }).parse(intentId, `${path}.intentId`)
    sceneConfigSchema.parse(sceneConfig, path)
    return value
  }
)

const sceneSchema = objectSchema(
  {
    id: boundedString,
    name: boundedString,
    sources: arraySchema(boundedBackendPayloadSchema, { maxLength: 64 }),
    outputs: arraySchema(boundedBackendPayloadSchema, { maxLength: 16 }),
    background: optionalSchema(boundedBackendPayloadSchema)
  },
  { allowUnknown: false }
) as RuntimeSchema<Scene>

const compositorStatusSchema = objectSchema(
  {
    state: enumSchema(['stopped', 'starting', 'live', 'failed']),
    targetFps: numberSchema({ min: 0, max: 480 }),
    width: numberSchema({ integer: true, min: 0, max: 32_768 }),
    height: numberSchema({ integer: true, min: 0, max: 32_768 }),
    runId: optionalText,
    sceneRevision: optionalSchema(numberSchema({ integer: true, min: 0 })),
    frameSceneRevision: optionalSchema(numberSchema({ integer: true, min: 0 })),
    sceneId: optionalText,
    sceneLayout: optionalSchema(layoutSchema),
    activeScreenId: optionalText,
    sceneSources: arraySchema(boundedBackendPayloadSchema, { maxLength: 64 }),
    sources: arraySchema(boundedBackendPayloadSchema, { maxLength: 64 }),
    renderFps: optionalSchema(numberSchema({ min: 0, max: 1000 })),
    framesRendered: numberSchema({ integer: true, min: 0 }),
    repeatedFrames: numberSchema({ integer: true, min: 0 }),
    droppedFrames: numberSchema({ integer: true, min: 0 }),
    frameAgeMs: optionalSchema(numberSchema({ min: 0 })),
    frameTimeP95Ms: optionalSchema(numberSchema({ min: 0 })),
    metalTargetIosurfaceId: optionalSchema(numberSchema({ integer: true, min: 0 })),
    metalTargetWidth: optionalSchema(numberSchema({ integer: true, min: 0 })),
    metalTargetHeight: optionalSchema(numberSchema({ integer: true, min: 0 })),
    imageCache: optionalSchema(boundedBackendPayloadSchema),
    framePipeline: optionalSchema(boundedBackendPayloadSchema),
    updatedAt: timestamp,
    message: optionalText
  },
  { allowUnknown: false }
) as RuntimeSchema<CompositorStatus>

const compositorFrameReadySchema = boundedSemanticValue(
  'a compositor frame-ready event',
  objectSchema(
    {
      targetFps: numberSchema({ min: 0, max: 1000 }),
      width: nonNegativeInteger,
      height: nonNegativeInteger,
      framesRendered: nonNegativeInteger,
      frameAgeMs: optionalSchema(nonNegativeInteger),
      updatedAt: timestamp
    },
    { allowUnknown: true }
  )
) as RuntimeSchema<CompositorFrameReady>

const previewLiveStatusSchema = objectSchema(
  {
    state: enumSchema(['connecting', 'live', 'reconnecting', 'unavailable']),
    source: enumSchema(['idle-preview', 'recording-session', 'unavailable']),
    transport: enumSchema([
      'native-surface',
      'electron-proof-surface',
      'latest-jpeg-polling',
      'mjpeg-stream',
      'unavailable'
    ]),
    backing: enumSchema(['cametal-layer', 'electron-browser-window', 'none']),
    targetFps: optionalSchema(numberSchema({ min: 0, max: 1000 })),
    width: optionalSchema(nonNegativeInteger),
    height: optionalSchema(nonNegativeInteger),
    url: optionalText,
    message: optionalText
  },
  { allowUnknown: false }
) as RuntimeSchema<PreviewLiveStatus>

const previewSurfaceStatusSchema = boundedSemanticValue(
  'a native preview surface status',
  objectSchema(
    {
      state: enumSchema(['unavailable', 'starting', 'live', 'stopped', 'failed']),
      source: enumSchema(['synthetic', 'camera', 'screen', 'window']),
      transport: enumSchema([
        'native-surface',
        'electron-proof-surface',
        'latest-jpeg-polling',
        'mjpeg-stream',
        'unavailable'
      ]),
      backing: enumSchema(['cametal-layer', 'electron-browser-window', 'none']),
      targetFps: numberSchema({ min: 0, max: 1000 }),
      width: nonNegativeInteger,
      height: nonNegativeInteger,
      framesRendered: nonNegativeInteger,
      droppedFrames: nonNegativeInteger,
      framePollingSuppressed: booleanSchema,
      sourcePixelsPresent: booleanSchema,
      pendingHostCommandCount: nonNegativeInteger,
      updatedAt: timestamp
    },
    { allowUnknown: true }
  )
) as RuntimeSchema<PreviewSurfaceStatus>

const previewCameraStatusSchema = boundedSemanticValue(
  'a preview camera status',
  objectSchema(
    {
      state: enumSchema(['starting', 'live', 'permission-needed', 'device-missing', 'failed']),
      targetFps: numberSchema({ min: 0, max: 1000 }),
      framesCaptured: nonNegativeInteger,
      droppedFrames: nonNegativeInteger,
      frameAgeMs: optionalSchema(nonNegativeInteger),
      updatedAt: timestamp
    },
    { allowUnknown: true }
  )
) as RuntimeSchema<PreviewCameraStatus>

const previewScreenStatusSchema = boundedSemanticValue(
  'a preview screen status',
  objectSchema(
    {
      state: enumSchema(['starting', 'live', 'permission-needed', 'source-missing', 'failed']),
      targetFps: numberSchema({ min: 0, max: 1000 }),
      framesCaptured: nonNegativeInteger,
      droppedFrames: nonNegativeInteger,
      frameAgeMs: optionalSchema(nonNegativeInteger),
      includeCursor: booleanSchema,
      excludeCurrentProcessWindows: booleanSchema,
      updatedAt: timestamp
    },
    { allowUnknown: true }
  )
) as RuntimeSchema<PreviewScreenStatus>

const diagnosticStatsSchema = boundedSemanticValue(
  'bounded diagnostic statistics',
  objectSchema(
    {
      skippedFrames: nonNegativeInteger,
      droppedFrames: nonNegativeInteger,
      updatedAt: optionalSchema(timestamp)
    },
    { allowUnknown: true }
  )
) as RuntimeSchema<DiagnosticStats>

const layoutTransactionResultSchema = runtimeSchema<unknown>(
  'a committed layout transaction result',
  (value, path) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`${path} must be a committed layout transaction result.`)
    }
    const record = value as Record<string, unknown>
    booleanSchema.parse(record.applied, `${path}.applied`)
    enumSchema(['idle', 'hot', 'warm']).parse(record.mode, `${path}.mode`)
    numberSchema({ integer: true, min: 0 }).parse(record.sceneRevision, `${path}.sceneRevision`)
    numberSchema({ integer: true, min: 1 }).parse(record.intentId, `${path}.intentId`)
    booleanSchema.parse(record.presentationProven, `${path}.presentationProven`)
    sceneSchema.parse(record.scene, `${path}.scene`)
    compositorStatusSchema.parse(record.compositorStatus, `${path}.compositorStatus`)
    optionalText.parse(record.message, `${path}.message`)
    return value
  }
)

const sceneCommitStatusSchema = boundedSemanticValue(
  'a committed scene result',
  objectSchema(
    {
      applied: booleanSchema,
      mode: enumSchema(['idle', 'hot', 'warm']),
      sceneRevision: nonNegativeInteger,
      scene: sceneSchema,
      compositorStatus: compositorStatusSchema,
      message: optionalText
    },
    { allowUnknown: false }
  )
)

const sessionSummarySchema = boundedSemanticValue(
  'a session summary',
  objectSchema(
    {
      id: boundedString,
      title: stringSchema({ maxLength: 16_384 }),
      startedAt: timestamp,
      status: boundedString,
      mode: boundedString,
      commentCount: nonNegativeInteger,
      derivedFromSessionId: optionalSchema(boundedString),
      sourceTitle: optionalSchema(stringSchema({ maxLength: 16_384 })),
      processingKind: optionalSchema(literalSchema('noise-cleanup'))
    },
    { allowUnknown: true }
  )
)

const sessionDeletionOperationSchema: RuntimeSchema<SessionDeletionOperation> = objectSchema(
  {
    operationId: boundedString,
    sessionId: boundedString,
    pathCount: numberSchema({ integer: true, min: 0, max: 16 }),
    blockedPathCount: numberSchema({ integer: true, min: 0, max: 16 })
  },
  { allowUnknown: false }
)

const noiseCleanupJobFieldsSchema = objectSchema(
  {
    id: boundedString,
    sourceSessionId: boundedString,
    status: enumSchema(['queued', 'processing', 'validating', 'completed', 'failed', 'cancelled']),
    progressPercent: numberSchema({ integer: true, min: 0, max: 100 }),
    preset: literalSchema('speech-v1'),
    outputSessionId: optionalSchema(boundedString),
    outputPath: optionalSchema(boundedPath),
    errorCode: optionalText,
    errorMessage: optionalText,
    createdAt: timestamp,
    updatedAt: timestamp
  },
  { allowUnknown: false }
)
const noiseCleanupJobSchema = runtimeSchema<NoiseCleanupJob>(
  'a Noise Cleanup job',
  (value, path) => {
    const job = noiseCleanupJobFieldsSchema.parse(value, path) as NoiseCleanupJob
    if (job.status === 'completed' && (!job.outputSessionId || !job.outputPath)) {
      throw new Error(`${path} must identify the completed output session and path.`)
    }
    if (job.status === 'failed' && (!job.errorCode || !job.errorMessage)) {
      throw new Error(`${path} must include a stable failure code and message.`)
    }
    return job
  }
)

const fileAssessmentSchema = boundedSemanticValue(
  'a file assessment',
  objectSchema(
    {
      path: boundedPath,
      verdict: enumSchema(['clean', 'repairable', 'needs-review']),
      issues: arraySchema(boundedBackendPayloadSchema, { maxLength: 1000 }),
      reasons: arraySchema(stringSchema({ maxLength: 16_384 }), { maxLength: 1000 }),
      repairable: booleanSchema,
      hasBackup: booleanSchema
    },
    { allowUnknown: false }
  )
)

const gateStatusSchema = boundedSemanticValue(
  'a repair gate status',
  runtimeSchema('a repair gate status', (value, path) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new Error(`${path} must be a repair gate status.`)
    }
    const record = value as Record<string, unknown>
    enumSchema(['ready', 'repaired', 'not-hundred-percent', 'failed']).parse(
      record.status,
      `${path}.status`
    )
    boundedPath.parse(record.path, `${path}.path`)
    return value
  })
)

const sessionStartParamsSchema = objectSchema(
  {
    sources: sourceSelectionSchema,
    layout: layoutSchema,
    scene: optionalSchema(sceneSchema),
    output: objectSchema(
      {
        recordEnabled: booleanSchema,
        streamEnabled: booleanSchema,
        outputDirectoryCapability: optionalSchema(boundedString),
        video: boundedBackendParamValueSchema,
        rtmp: boundedBackendParamValueSchema
      },
      { allowUnknown: false }
    ),
    audio: optionalSchema(boundedBackendParamValueSchema),
    streaming: optionalSchema(boundedBackendParamValueSchema),
    captions: optionalSchema(boundedBackendParamValueSchema)
  },
  { allowUnknown: false }
)

const undefinedOrFfmpegPathSchema = unionSchema([
  undefinedSchema,
  objectSchema({ ffmpegPath: optionalSchema(boundedPath) }, { allowUnknown: false })
])

const oauthStateSchema = stringSchema({ minLength: 8, maxLength: 2048 })
const oauthCompleteParamsSchema = objectSchema(
  {
    state: oauthStateSchema,
    code: optionalSchema(stringSchema({ maxLength: 8192 })),
    error: optionalSchema(stringSchema({ maxLength: 1024 })),
    errorDescription: optionalSchema(stringSchema({ maxLength: 16_384 }))
  },
  { allowUnknown: false }
) as RuntimeSchema<OAuthCompleteParams>

const oauthCallbackResultFields = {
  status: enumSchema(['success', 'failed', 'expired', 'unknown-state']),
  codePresent: booleanSchema,
  error: optionalSchema(stringSchema({ maxLength: 1024 })),
  message: optionalSchema(stringSchema({ maxLength: 16_384 })),
  tokenStored: booleanSchema,
  accountConnected: booleanSchema,
  retryable: booleanSchema,
  receivedAt: timestamp
}
const oauth2CallbackResultSchema = objectSchema(
  {
    ...oauthCallbackResultFields,
    platform: optionalSchema(enumSchema(['youtube', 'twitch', 'x', 'custom'])),
    state: oauthStateSchema
  },
  { allowUnknown: false }
)
const xOAuth1CallbackResultSchema = objectSchema(
  {
    ...oauthCallbackResultFields,
    platform: literalSchema('x'),
    // X live uses OAuth 1.0a's request-token/verifier pair rather than an
    // OAuth2 state value. Keep that exception exact to X instead of
    // weakening state validation for every provider event.
    state: literalSchema('')
  },
  { allowUnknown: false }
)
const oauthCallbackResultSchema = runtimeSchema<OAuthCallbackResult>(
  'an OAuth2 or X OAuth1 callback result',
  (value, path) => {
    const record =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null
    return record?.platform === 'x' && record.state === ''
      ? xOAuth1CallbackResultSchema.parse(value, path)
      : oauth2CallbackResultSchema.parse(value, path)
  }
)

const adminConnectionSchema = objectSchema(
  {
    baseUrl: nullableSchema(stringSchema({ maxLength: 2048 })),
    apiKeyConfigured: booleanSchema,
    apiKeyHint: nullableSchema(stringSchema({ maxLength: 64 }))
  },
  { allowUnknown: false }
)
const adminConnectionTestResultSchema = objectSchema(
  {
    reachable: booleanSchema,
    databaseOk: booleanSchema,
    authOk: booleanSchema,
    message: stringSchema({ maxLength: 2048 })
  },
  { allowUnknown: false }
)
const adminRegisterResultSchema = objectSchema(
  {
    appId: boundedString,
    appSlug: boundedString,
    apiKey: boundedString
  },
  { allowUnknown: false }
)
// Rust's AdminSermon/SermonSeries serialize every Option<T> as an explicit
// JSON `null` (no skip_serializing_if on these result types), matching the
// admin API's own JSON. Nullable, not optional/undefined.
const livingTextBookSchema = objectSchema(
  {
    bookNumber: numberSchema({ integer: true, min: 1, max: 66 }),
    name: stringSchema({ minLength: 1, maxLength: 64 })
  },
  { allowUnknown: false }
)
const livingTextAvailableTranslationSchema = objectSchema(
  {
    id: boundedString,
    code: stringSchema({ minLength: 1, maxLength: 20 }),
    name: stringSchema({ minLength: 1, maxLength: 255 }),
    language: stringSchema({ minLength: 1, maxLength: 10 })
  },
  { allowUnknown: false }
)
const livingTextTranslationSchema = objectSchema(
  {
    code: stringSchema({ minLength: 1, maxLength: 20 }),
    name: stringSchema({ minLength: 1, maxLength: 255 }),
    language: stringSchema({ minLength: 1, maxLength: 10 }),
    verseCount: numberSchema({ integer: true, min: 0 })
  },
  { allowUnknown: false }
)
const livingTextVerseSchema = objectSchema(
  {
    book: stringSchema({ minLength: 1, maxLength: 64 }),
    bookNumber: numberSchema({ integer: true, min: 1, max: 66 }),
    chapter: numberSchema({ integer: true, min: 1, max: 150 }),
    verse: numberSchema({ integer: true, min: 1, max: 999 }),
    text: stringSchema({ minLength: 1, maxLength: 16_384 })
  },
  { allowUnknown: false }
)
// Rust's DetectedCitation/ResolvedCitation serialize every Option<T> as an
// explicit JSON `null` — same convention as AdminSermon above.
const livingTextCitationFields = {
  book: stringSchema({ minLength: 1, maxLength: 64 }),
  bookNumber: numberSchema({ integer: true, min: 1, max: 66 }),
  chapter: numberSchema({ integer: true, min: 1, max: 150 }),
  verseStart: nullableSchema(numberSchema({ integer: true, min: 1, max: 999 })),
  verseEnd: nullableSchema(numberSchema({ integer: true, min: 1, max: 999 })),
  matchType: enumSchema(['explicit', 'chapter']),
  sourceText: stringSchema({ minLength: 1, maxLength: 512 }),
  index: numberSchema({ integer: true, min: 0 })
}
const livingTextResolvedCitationSchema = objectSchema(
  {
    ...livingTextCitationFields,
    resolved: booleanSchema,
    verses: arraySchema(livingTextVerseSchema, { maxLength: 200 })
  },
  { allowUnknown: false }
)
const adminSermonSeriesSchema = objectSchema(
  {
    id: boundedString,
    title: stringSchema({ minLength: 1, maxLength: 512 }),
    slug: nullableSchema(stringSchema({ maxLength: 512 })),
    description: nullableSchema(stringSchema({ maxLength: 8192 })),
    imagePath: nullableSchema(stringSchema({ maxLength: 2048 }))
  },
  { allowUnknown: false }
)
const adminSermonSchema = objectSchema(
  {
    id: boundedString,
    title: stringSchema({ minLength: 1, maxLength: 512 }),
    seriesId: nullableSchema(stringSchema({ maxLength: 255 })),
    speakerName: nullableSchema(stringSchema({ maxLength: 512 })),
    scripture: nullableSchema(stringSchema({ maxLength: 512 })),
    summary: nullableSchema(stringSchema({ maxLength: 8192 })),
    notes: nullableSchema(stringSchema({ maxLength: 16_384 })),
    audioUrl: nullableSchema(stringSchema({ maxLength: 2048 })),
    videoId: nullableSchema(stringSchema({ maxLength: 255 })),
    thumbnailPath: nullableSchema(stringSchema({ maxLength: 2048 })),
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    publishedAt: nullableSchema(stringSchema({ maxLength: 64 })),
    viewsCount: numberSchema({ integer: true, min: 0 }),
    savesCount: numberSchema({ integer: true, min: 0 }),
    createdAt: timestamp,
    updatedAt: timestamp,
    series: nullableSchema(adminSermonSeriesSchema),
    topics: arraySchema(stringSchema({ maxLength: 255 }), { maxLength: 100 })
  },
  { allowUnknown: false }
)
const adminSermonInputFields = {
  seriesId: optionalSchema(stringSchema({ maxLength: 255 })),
  speakerName: optionalSchema(stringSchema({ maxLength: 512 })),
  scripture: optionalSchema(stringSchema({ maxLength: 512 })),
  summary: optionalSchema(stringSchema({ maxLength: 8192 })),
  notes: optionalSchema(stringSchema({ maxLength: 16_384 })),
  audioUrl: optionalSchema(stringSchema({ maxLength: 2048 })),
  videoId: optionalSchema(stringSchema({ maxLength: 255 })),
  thumbnailPath: optionalSchema(stringSchema({ maxLength: 2048 })),
  topics: optionalSchema(arraySchema(stringSchema({ maxLength: 255 }), { maxLength: 100 }))
}
const adminSermonDeleteResultSchema = objectSchema(
  { deleted: booleanSchema },
  { allowUnknown: false }
)

const videoCategorySchema = objectSchema(
  {
    id: boundedString,
    name: stringSchema({ minLength: 1, maxLength: 512 }),
    slug: nullableSchema(stringSchema({ maxLength: 512 }))
  },
  { allowUnknown: false }
)
const adminVideoSchema = objectSchema(
  {
    id: boundedString,
    title: stringSchema({ minLength: 1, maxLength: 512 }),
    speakerName: nullableSchema(stringSchema({ maxLength: 512 })),
    thumbnailPath: nullableSchema(stringSchema({ maxLength: 2048 })),
    videoPath: nullableSchema(stringSchema({ maxLength: 2048 })),
    videoUrl: nullableSchema(stringSchema({ maxLength: 2048 })),
    storageDisk: stringSchema({ minLength: 1, maxLength: 32 }),
    durationSeconds: nullableSchema(numberSchema({ integer: true, min: 0 })),
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    visibility: stringSchema({ minLength: 1, maxLength: 32 }),
    isFeatured: numberSchema({ integer: true, min: 0, max: 1 }),
    viewsCount: numberSchema({ integer: true, min: 0 }),
    savesCount: numberSchema({ integer: true, min: 0 }),
    publishedAt: nullableSchema(stringSchema({ maxLength: 64 })),
    createdAt: timestamp,
    updatedAt: timestamp,
    category: nullableSchema(videoCategorySchema)
  },
  { allowUnknown: false }
)
const adminVideoDeleteResultSchema = objectSchema(
  { deleted: booleanSchema },
  { allowUnknown: false }
)

// Rust's AdminMember/MemberDevice serialize every Option<T> as an explicit
// JSON `null` — same nullable-not-optional convention as adminSermonSchema
// above.
const memberDeviceSchema = objectSchema(
  {
    id: boundedString,
    platform: stringSchema({ minLength: 1, maxLength: 64 }),
    deviceToken: nullableSchema(stringSchema({ maxLength: 2048 })),
    appVersion: nullableSchema(stringSchema({ maxLength: 64 })),
    buildNumber: nullableSchema(stringSchema({ maxLength: 64 })),
    notificationPermission: nullableSchema(stringSchema({ maxLength: 64 })),
    lastSeenAt: timestamp
  },
  { allowUnknown: false }
)
const adminMemberSchema = objectSchema(
  {
    id: boundedString,
    locationId: nullableSchema(boundedString),
    fullName: stringSchema({ minLength: 1, maxLength: 512 }),
    phone: nullableSchema(stringSchema({ maxLength: 64 })),
    email: nullableSchema(stringSchema({ maxLength: 320 })),
    country: nullableSchema(stringSchema({ maxLength: 128 })),
    birthYear: nullableSchema(numberSchema({ integer: true, min: 0, max: 9999 })),
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    notificationEnabled: numberSchema({ integer: true, min: 0, max: 1 }),
    lastLoginAt: nullableSchema(stringSchema({ maxLength: 64 })),
    address: nullableSchema(stringSchema({ maxLength: 1024 })),
    avatarUrl: nullableSchema(stringSchema({ maxLength: 2048 })),
    username: nullableSchema(stringSchema({ maxLength: 255 })),
    createdAt: timestamp,
    updatedAt: timestamp,
    devices: arraySchema(memberDeviceSchema, { maxLength: 100 }),
    defaultPassword: nullableSchema(stringSchema({ maxLength: 128 }))
  },
  { allowUnknown: false }
)
const adminMemberInputFields = {
  fullName: optionalSchema(stringSchema({ minLength: 1, maxLength: 512 })),
  locationId: optionalSchema(stringSchema({ maxLength: 255 })),
  phone: optionalSchema(stringSchema({ minLength: 1, maxLength: 64 })),
  email: optionalSchema(stringSchema({ maxLength: 320 })),
  country: optionalSchema(stringSchema({ maxLength: 128 })),
  address: optionalSchema(stringSchema({ maxLength: 1024 })),
  status: optionalSchema(enumSchema(['active', 'inactive'])),
  notificationEnabled: optionalSchema(booleanSchema)
}
const adminMemberDeleteResultSchema = objectSchema(
  { deleted: booleanSchema },
  { allowUnknown: false }
)

// Rust's NotificationCampaign serializes every Option<T> as an explicit
// JSON `null` — same nullable-not-optional convention as adminMemberSchema
// above.
const notificationCampaignSchema = objectSchema(
  {
    id: boundedString,
    title: stringSchema({ minLength: 1, maxLength: 512 }),
    body: stringSchema({ minLength: 1, maxLength: 4096 }),
    target: stringSchema({ minLength: 1, maxLength: 128 }),
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    imagePath: nullableSchema(stringSchema({ maxLength: 2048 })),
    showInApp: numberSchema({ integer: true, min: 0, max: 1 }),
    sendPush: numberSchema({ integer: true, min: 0, max: 1 }),
    scheduledAt: nullableSchema(stringSchema({ maxLength: 64 })),
    sentAt: nullableSchema(stringSchema({ maxLength: 64 })),
    sentCount: numberSchema({ integer: true, min: 0 }),
    failedCount: numberSchema({ integer: true, min: 0 }),
    openedCount: numberSchema({ integer: true, min: 0 }),
    createdAt: timestamp,
    updatedAt: timestamp
  },
  { allowUnknown: false }
)
const notificationCampaignDeleteResultSchema = objectSchema(
  { deleted: booleanSchema },
  { allowUnknown: false }
)

// Rust's AdminEvent serializes every Option<T> as an explicit JSON `null` —
// same nullable-not-optional convention as adminMemberSchema above.
const adminEventSchema = objectSchema(
  {
    id: boundedString,
    churchLocationId: nullableSchema(boundedString),
    title: stringSchema({ minLength: 1, maxLength: 512 }),
    slug: stringSchema({ minLength: 1, maxLength: 512 }),
    description: nullableSchema(stringSchema({ maxLength: 8192 })),
    category: stringSchema({ minLength: 1, maxLength: 255 }),
    eventType: stringSchema({ minLength: 1, maxLength: 64 }),
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    startsAt: timestamp,
    endsAt: nullableSchema(timestamp),
    timezone: nullableSchema(stringSchema({ maxLength: 128 })),
    locationName: nullableSchema(stringSchema({ maxLength: 255 })),
    locationAddress: nullableSchema(stringSchema({ maxLength: 255 })),
    locationLat: nullableSchema(numberSchema()),
    locationLng: nullableSchema(numberSchema()),
    onlineUrl: nullableSchema(stringSchema({ maxLength: 2048 })),
    imagePath: nullableSchema(stringSchema({ maxLength: 2048 })),
    capacity: nullableSchema(numberSchema({ integer: true, min: 0 })),
    registeredCount: numberSchema({ integer: true, min: 0 }),
    isRecurring: booleanSchema,
    recurrenceRule: nullableSchema(stringSchema({ maxLength: 512 })),
    recurrenceGroupId: nullableSchema(boundedString),
    createdAt: timestamp,
    updatedAt: timestamp
  },
  { allowUnknown: false }
)
const eventDeleteResultSchema = objectSchema({ deleted: booleanSchema }, { allowUnknown: false })

const eventInputFields = {
  title: stringSchema({ minLength: 1, maxLength: 512 }),
  churchLocationId: optionalSchema(stringSchema({ maxLength: 255 })),
  description: optionalSchema(stringSchema({ maxLength: 8192 })),
  category: optionalSchema(stringSchema({ maxLength: 255 })),
  eventType: optionalSchema(stringSchema({ maxLength: 64 })),
  status: optionalSchema(enumSchema(['draft', 'published', 'cancelled'])),
  startsAt: stringSchema({ minLength: 1, maxLength: 64 }),
  endsAt: optionalSchema(stringSchema({ maxLength: 64 })),
  timezone: optionalSchema(stringSchema({ maxLength: 128 })),
  locationName: optionalSchema(stringSchema({ maxLength: 255 })),
  locationAddress: optionalSchema(stringSchema({ maxLength: 255 })),
  locationLat: optionalSchema(numberSchema()),
  locationLng: optionalSchema(numberSchema()),
  onlineUrl: optionalSchema(stringSchema({ maxLength: 2048 })),
  imagePath: optionalSchema(stringSchema({ maxLength: 2048 })),
  capacity: optionalSchema(numberSchema({ integer: true, min: 0 })),
  isRecurring: optionalSchema(booleanSchema),
  recurrenceFreq: optionalSchema(enumSchema(['weekly', 'monthly'])),
  recurrenceInterval: optionalSchema(numberSchema({ integer: true, min: 1 })),
  recurrenceUntil: optionalSchema(stringSchema({ maxLength: 64 }))
}

const attendanceSessionSchema = objectSchema(
  {
    id: boundedString,
    eventId: boundedString,
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    qrRotationSeconds: numberSchema({ integer: true, min: 1 }),
    geofenceRadiusMeters: numberSchema({ integer: true, min: 0 }),
    openedBy: boundedString,
    openedAt: timestamp,
    closedBy: nullableSchema(boundedString),
    closedAt: nullableSchema(timestamp),
    createdAt: timestamp,
    updatedAt: timestamp
  },
  { allowUnknown: false }
)

const attendanceRecordSchema = objectSchema(
  {
    id: boundedString,
    sessionId: boundedString,
    eventId: boundedString,
    memberId: boundedString,
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    method: stringSchema({ minLength: 1, maxLength: 16 }),
    checkedInAt: timestamp,
    minutesLate: nullableSchema(numberSchema({ integer: true, min: 0 })),
    displayNameSnapshot: stringSchema({ minLength: 1, maxLength: 255 }),
    qrNonce: nullableSchema(stringSchema({ maxLength: 255 })),
    deviceInstallationId: nullableSchema(stringSchema({ maxLength: 255 })),
    latitude: nullableSchema(numberSchema()),
    longitude: nullableSchema(numberSchema()),
    accuracyMeters: nullableSchema(numberSchema()),
    distanceFromEventMeters: nullableSchema(numberSchema()),
    insideGeofence: nullableSchema(booleanSchema),
    recordedByUserId: nullableSchema(boundedString),
    manualReason: nullableSchema(stringSchema({ maxLength: 4096 })),
    createdAt: timestamp,
    updatedAt: timestamp
  },
  { allowUnknown: false }
)

const attendanceQrSchema = objectSchema(
  {
    token: stringSchema({ minLength: 1, maxLength: 4096 }),
    rotation: numberSchema({ integer: true, min: 0 }),
    expiresAt: timestamp,
    rotationSeconds: numberSchema({ integer: true, min: 1 })
  },
  { allowUnknown: false }
)

const attendanceListSchema = objectSchema(
  {
    session: nullableSchema(attendanceSessionSchema),
    records: arraySchema(attendanceRecordSchema, { maxLength: 10_000 })
  },
  { allowUnknown: false }
)

const manualCheckInFields = {
  memberId: stringSchema({ minLength: 1, maxLength: 255 }),
  manualReason: stringSchema({ minLength: 1, maxLength: 2048 })
}

const unitMemberSummarySchema = objectSchema(
  {
    id: boundedString,
    fullName: stringSchema({ minLength: 1, maxLength: 255 }),
    avatarUrl: nullableSchema(stringSchema({ maxLength: 2048 })),
    phone: optionalSchema(nullableSchema(stringSchema({ maxLength: 255 }))),
    email: optionalSchema(nullableSchema(stringSchema({ maxLength: 255 }))),
    status: optionalSchema(nullableSchema(stringSchema({ maxLength: 255 })))
  },
  { allowUnknown: false }
)

// A bare unit row, with no nested collections — this is the shape of
// `parentUnit` and `childUnits` entries within a detailed unit response
// (the API doesn't recurse further than one level).
const unitBareSchema = objectSchema(
  {
    id: boundedString,
    parentUnitId: nullableSchema(boundedString),
    type: stringSchema({ minLength: 1, maxLength: 32 }),
    name: stringSchema({ minLength: 1, maxLength: 255 }),
    description: nullableSchema(stringSchema({ maxLength: 8192 })),
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    createdAt: timestamp,
    updatedAt: timestamp
  },
  { allowUnknown: false }
)

const organizationalUnitPositionAssignmentSchema = objectSchema(
  {
    id: boundedString,
    unitId: boundedString,
    positionId: boundedString,
    memberId: boundedString,
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    startedAt: timestamp,
    endedAt: nullableSchema(timestamp),
    createdAt: timestamp,
    updatedAt: timestamp,
    member: optionalSchema(unitMemberSummarySchema)
  },
  { allowUnknown: false }
)

const organizationalUnitPositionSchema = objectSchema(
  {
    id: boundedString,
    unitId: boundedString,
    name: stringSchema({ minLength: 1, maxLength: 255 }),
    isLeadershipPosition: booleanSchema,
    createdAt: timestamp,
    updatedAt: timestamp,
    assignments: optionalSchema(
      arraySchema(organizationalUnitPositionAssignmentSchema, { maxLength: 1_000 })
    )
  },
  { allowUnknown: false }
)

const organizationalUnitMembershipSchema = objectSchema(
  {
    id: boundedString,
    unitId: boundedString,
    memberId: boundedString,
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    joinedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    member: optionalSchema(unitMemberSummarySchema)
  },
  { allowUnknown: false }
)

const organizationalUnitSchema = objectSchema(
  {
    id: boundedString,
    parentUnitId: nullableSchema(boundedString),
    type: stringSchema({ minLength: 1, maxLength: 32 }),
    name: stringSchema({ minLength: 1, maxLength: 255 }),
    description: nullableSchema(stringSchema({ maxLength: 8192 })),
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    createdAt: timestamp,
    updatedAt: timestamp,
    _count: optionalSchema(objectSchema({ memberships: numberSchema({ integer: true, min: 0 }) }, { allowUnknown: false })),
    positions: optionalSchema(arraySchema(organizationalUnitPositionSchema, { maxLength: 1_000 })),
    memberships: optionalSchema(arraySchema(organizationalUnitMembershipSchema, { maxLength: 10_000 })),
    childUnits: optionalSchema(arraySchema(unitBareSchema, { maxLength: 1_000 })),
    parentUnit: optionalSchema(nullableSchema(unitBareSchema))
  },
  { allowUnknown: false }
)

const createUnitFields = {
  type: stringSchema({ minLength: 1, maxLength: 32 }),
  name: stringSchema({ minLength: 1, maxLength: 255 }),
  description: optionalSchema(stringSchema({ maxLength: 8192 })),
  parentUnitId: optionalSchema(stringSchema({ maxLength: 255 }))
}

const updateUnitFields = {
  name: optionalSchema(stringSchema({ minLength: 1, maxLength: 255 })),
  type: optionalSchema(stringSchema({ minLength: 1, maxLength: 32 })),
  description: optionalSchema(stringSchema({ maxLength: 8192 })),
  parentUnitId: optionalSchema(stringSchema({ maxLength: 255 })),
  status: optionalSchema(stringSchema({ minLength: 1, maxLength: 32 }))
}

const createUnitPositionFields = {
  name: stringSchema({ minLength: 1, maxLength: 255 }),
  isLeadershipPosition: optionalSchema(booleanSchema)
}

const locationSchema = objectSchema(
  {
    id: boundedString,
    type: stringSchema({ minLength: 1, maxLength: 32 }),
    name: stringSchema({ minLength: 1, maxLength: 255 }),
    description: nullableSchema(stringSchema({ maxLength: 8192 })),
    addressLine1: nullableSchema(stringSchema({ maxLength: 255 })),
    addressLine2: nullableSchema(stringSchema({ maxLength: 255 })),
    city: nullableSchema(stringSchema({ maxLength: 255 })),
    stateOrRegion: nullableSchema(stringSchema({ maxLength: 255 })),
    postalCode: nullableSchema(stringSchema({ maxLength: 64 })),
    country: nullableSchema(stringSchema({ maxLength: 255 })),
    latitude: nullableSchema(numberSchema()),
    longitude: nullableSchema(numberSchema()),
    timezone: nullableSchema(stringSchema({ maxLength: 128 })),
    isHeadquarters: booleanSchema,
    isOnline: booleanSchema,
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    createdAt: timestamp,
    updatedAt: timestamp,
    _count: optionalSchema(
      objectSchema(
        { members: numberSchema({ integer: true, min: 0 }), events: numberSchema({ integer: true, min: 0 }) },
        { allowUnknown: false }
      )
    )
  },
  { allowUnknown: false }
)

const createLocationFields = {
  type: stringSchema({ minLength: 1, maxLength: 32 }),
  name: stringSchema({ minLength: 1, maxLength: 255 }),
  description: optionalSchema(stringSchema({ maxLength: 8192 })),
  addressLine1: optionalSchema(stringSchema({ maxLength: 255 })),
  addressLine2: optionalSchema(stringSchema({ maxLength: 255 })),
  city: optionalSchema(stringSchema({ maxLength: 255 })),
  stateOrRegion: optionalSchema(stringSchema({ maxLength: 255 })),
  postalCode: optionalSchema(stringSchema({ maxLength: 64 })),
  country: optionalSchema(stringSchema({ maxLength: 255 })),
  latitude: optionalSchema(numberSchema()),
  longitude: optionalSchema(numberSchema()),
  timezone: optionalSchema(stringSchema({ maxLength: 128 })),
  isHeadquarters: optionalSchema(booleanSchema),
  isOnline: optionalSchema(booleanSchema)
}

const updateLocationFields = {
  name: optionalSchema(stringSchema({ minLength: 1, maxLength: 255 })),
  type: optionalSchema(stringSchema({ minLength: 1, maxLength: 32 })),
  description: optionalSchema(stringSchema({ maxLength: 8192 })),
  addressLine1: optionalSchema(stringSchema({ maxLength: 255 })),
  addressLine2: optionalSchema(stringSchema({ maxLength: 255 })),
  city: optionalSchema(stringSchema({ maxLength: 255 })),
  stateOrRegion: optionalSchema(stringSchema({ maxLength: 255 })),
  postalCode: optionalSchema(stringSchema({ maxLength: 64 })),
  country: optionalSchema(stringSchema({ maxLength: 255 })),
  latitude: optionalSchema(numberSchema()),
  longitude: optionalSchema(numberSchema()),
  timezone: optionalSchema(stringSchema({ maxLength: 128 })),
  isHeadquarters: optionalSchema(booleanSchema),
  isOnline: optionalSchema(booleanSchema),
  status: optionalSchema(stringSchema({ minLength: 1, maxLength: 32 }))
}

const teamUserSchema = objectSchema(
  {
    id: boundedString,
    name: stringSchema({ minLength: 1, maxLength: 255 }),
    email: stringSchema({ minLength: 1, maxLength: 320 }),
    role: stringSchema({ minLength: 1, maxLength: 64 }),
    status: stringSchema({ minLength: 1, maxLength: 32 }),
    lastLoginAt: nullableSchema(stringSchema({ maxLength: 64 })),
    createdAt: timestamp,
    updatedAt: timestamp
  },
  { allowUnknown: false }
)

const createTeamUserFields = {
  name: stringSchema({ minLength: 1, maxLength: 255 }),
  email: stringSchema({ minLength: 1, maxLength: 320 }),
  role: stringSchema({ minLength: 1, maxLength: 64 })
}

const updateTeamUserFields = {
  name: optionalSchema(stringSchema({ minLength: 1, maxLength: 255 })),
  role: optionalSchema(stringSchema({ minLength: 1, maxLength: 64 })),
  status: optionalSchema(stringSchema({ minLength: 1, maxLength: 32 }))
}

const geocodeResultSchema = objectSchema(
  {
    displayName: stringSchema({ minLength: 1, maxLength: 1024 }),
    lat: numberSchema(),
    lon: numberSchema()
  },
  { allowUnknown: false }
)

const geocodeReverseResultSchema = objectSchema(
  { label: stringSchema({ maxLength: 1024 }) },
  { allowUnknown: false }
)

const uploadedImageSchema = objectSchema(
  {
    url: stringSchema({ minLength: 1, maxLength: 2048 }),
    path: stringSchema({ minLength: 1, maxLength: 2048 })
  },
  { allowUnknown: false }
)
const membersStatsSchema = objectSchema(
  {
    totalMembers: numberSchema({ integer: true, min: 0 }),
    activeMembers: numberSchema({ integer: true, min: 0 }),
    pushEnabled: numberSchema({ integer: true, min: 0 }),
    newThisMonth: numberSchema({ integer: true, min: 0 }),
    countriesCount: numberSchema({ integer: true, min: 0 }),
    countries: arraySchema(stringSchema({ minLength: 1, maxLength: 128 }), { maxLength: 1000 })
  },
  { allowUnknown: false }
)
const membersPageSchema = objectSchema(
  {
    items: arraySchema(adminMemberSchema, { maxLength: 10_000 }),
    total: numberSchema({ integer: true, min: 0 }),
    page: numberSchema({ integer: true, min: 1 }),
    pageSize: numberSchema({ integer: true, min: 1 }),
    totalPages: numberSchema({ integer: true, min: 1 }),
    stats: membersStatsSchema
  },
  { allowUnknown: false }
)

const youtubeSearchResultSchema = objectSchema(
  {
    videoId: stringSchema({ minLength: 1, maxLength: 64 }),
    title: stringSchema({ minLength: 1, maxLength: 512 }),
    channelTitle: stringSchema({ minLength: 0, maxLength: 512 }),
    thumbnailUrl: stringSchema({ minLength: 1, maxLength: 2048 }),
    durationSeconds: nullableSchema(numberSchema({ integer: true, min: 0 })),
    publishedAt: nullableSchema(stringSchema({ maxLength: 64 })),
    videoUrl: stringSchema({ minLength: 1, maxLength: 2048 })
  },
  { allowUnknown: false }
)

const runtimeContracts = {
  'health.ping': { params: undefinedOrFfmpegPathSchema, result: backendHealthSchema },
  'entitlements.get': { params: undefinedSchema, result: entitlementsSchema },
  'entitlements.refresh': { params: undefinedSchema, result: entitlementsSchema },
  'account.get': { params: undefinedSchema, result: accountSchema },
  'account.complete_sign_in': {
    params: objectSchema(
      {
        code: stringSchema({ minLength: 16, maxLength: 16_384 }),
        state: stringSchema({ minLength: 16, maxLength: 512 }),
        verifier: stringSchema({ minLength: 43, maxLength: 128 }),
        intentGeneration: numberSchema({ integer: true, min: 1, max: Number.MAX_SAFE_INTEGER })
      },
      { allowUnknown: false }
    ),
    result: accountSchema
  },
  'account.sign_out': { params: undefinedSchema, result: accountSchema },
  'platformAccounts.oauth.complete': {
    params: oauthCompleteParamsSchema,
    result: oauthCallbackResultSchema
  },
  'devices.list': { params: undefinedOrFfmpegPathSchema, result: deviceListSchema },
  'recording.status': { params: undefinedSchema, result: recordingStatusSchema },
  'session.start': { params: sessionStartParamsSchema, result: recordingStatusSchema },
  'session.stop': { params: undefinedSchema, result: recordingStatusSchema },
  'scene.get': { params: undefinedSchema, result: sceneSchema },
  'scene.load_from_capture_config': {
    params: sceneConfigSchema,
    result: sceneCommitStatusSchema
  },
  'scene.layout.apply_preview': {
    params: layoutTransactionParamsSchema,
    result: layoutTransactionResultSchema
  },
  'scene.layout.apply_live': {
    params: layoutTransactionParamsSchema,
    result: layoutTransactionResultSchema
  },
  'compositor.status': { params: undefinedSchema, result: compositorStatusSchema },
  'preview.live.status': { params: undefinedSchema, result: previewLiveStatusSchema },
  'preview.surface.status': { params: undefinedSchema, result: previewSurfaceStatusSchema },
  'preview.camera.status': { params: undefinedSchema, result: previewCameraStatusSchema },
  'preview.screen.status': { params: undefinedSchema, result: previewScreenStatusSchema },
  'diagnostics.stats': { params: undefinedSchema, result: diagnosticStatsSchema },
  'sessions.list': {
    params: unionSchema([
      undefinedSchema,
      objectSchema(
        { limit: optionalSchema(numberSchema({ integer: true, min: 1, max: 1000 })) },
        { allowUnknown: false }
      )
    ]),
    result: arraySchema(sessionSummarySchema, { maxLength: 1000 })
  },
  'sessions.storage': {
    params: undefinedSchema,
    result: objectSchema(
      {
        count: numberSchema({ integer: true, min: 0 }),
        totalBytes: numberSchema({ integer: true, min: 0 })
      },
      { allowUnknown: false }
    )
  },
  'sessions.comments.list': {
    params: objectSchema(
      {
        sessionId: boundedString,
        cursor: optionalSchema(stringSchema({ minLength: 1, maxLength: 4096 })),
        limit: optionalSchema(numberSchema({ integer: true, min: 1, max: 1000 }))
      },
      { allowUnknown: false }
    ),
    result: objectSchema(
      {
        messages: arraySchema(boundedBackendPayloadSchema, { maxLength: 1000 }),
        nextCursor: optionalSchema(stringSchema({ minLength: 1, maxLength: 4096 }))
      },
      { allowUnknown: false }
    )
  },
  'sessions.delete': {
    params: objectSchema(
      {
        sessionIds: arraySchema(boundedString, { maxLength: 500 })
      },
      { allowUnknown: false }
    ),
    result: arraySchema(sessionDeletionOperationSchema, { maxLength: 500 })
  },
  'sessions.delete.pending': {
    params: undefinedSchema,
    result: arraySchema(sessionDeletionOperationSchema, { maxLength: 500 })
  },
  'noiseCleanup.start': {
    params: objectSchema({ sessionId: boundedString }, { allowUnknown: false }),
    result: noiseCleanupJobSchema
  },
  'noiseCleanup.cancel': {
    params: objectSchema({ jobId: boundedString }, { allowUnknown: false }),
    result: noiseCleanupJobSchema
  },
  'noiseCleanup.list': {
    params: undefinedSchema,
    result: arraySchema(noiseCleanupJobSchema, { maxLength: 1000 })
  },
  'repair.assess_file': {
    params: objectSchema({ sessionId: boundedString }, { allowUnknown: false }),
    result: fileAssessmentSchema
  },
  'repair.repair_file': {
    params: objectSchema(
      {
        sessionId: boundedString,
        expectAudio: optionalSchema(booleanSchema),
        intendedFps: optionalSchema(numberSchema({ min: 1, max: 480 }))
      },
      { allowUnknown: false }
    ),
    result: gateStatusSchema
  },
  'repair.restore_file': {
    params: objectSchema({ sessionId: boundedString }, { allowUnknown: false }),
    result: objectSchema({ restored: booleanSchema }, { allowUnknown: false })
  },
  'admin.connection.get': { params: undefinedSchema, result: adminConnectionSchema },
  'admin.connection.set': {
    params: objectSchema(
      {
        baseUrl: stringSchema({ minLength: 1, maxLength: 2048 }),
        apiKey: optionalSchema(stringSchema({ minLength: 1, maxLength: 512 }))
      },
      { allowUnknown: false }
    ),
    result: adminConnectionSchema
  },
  'admin.connection.clear': { params: undefinedSchema, result: adminConnectionSchema },
  'admin.connection.test': {
    params: objectSchema(
      {
        baseUrl: stringSchema({ minLength: 1, maxLength: 2048 }),
        apiKey: stringSchema({ minLength: 1, maxLength: 512 })
      },
      { allowUnknown: false }
    ),
    result: adminConnectionTestResultSchema
  },
  'admin.register': {
    params: objectSchema(
      {
        baseUrl: stringSchema({ minLength: 1, maxLength: 2048 }),
        organizationName: stringSchema({ minLength: 2, maxLength: 255 }),
        ownerName: stringSchema({ minLength: 2, maxLength: 255 }),
        ownerEmail: stringSchema({ minLength: 3, maxLength: 255 }),
        ownerPassword: stringSchema({ minLength: 8, maxLength: 512 })
      },
      { allowUnknown: false }
    ),
    result: adminRegisterResultSchema
  },
  'livingText.books.list': {
    params: undefinedSchema,
    result: arraySchema(livingTextBookSchema, { maxLength: 66 })
  },
  'livingText.availableTranslations.list': {
    params: undefinedSchema,
    result: arraySchema(livingTextAvailableTranslationSchema, { maxLength: 100 })
  },
  'livingText.translations.list': {
    params: undefinedSchema,
    result: arraySchema(livingTextTranslationSchema, { maxLength: 100 })
  },
  'livingText.sync': {
    params: objectSchema(
      { translationCode: stringSchema({ minLength: 1, maxLength: 20 }) },
      { allowUnknown: false }
    ),
    result: objectSchema(
      {
        code: stringSchema({ minLength: 1, maxLength: 20 }),
        name: stringSchema({ minLength: 1, maxLength: 255 }),
        verseCount: numberSchema({ integer: true, min: 0 })
      },
      { allowUnknown: false }
    )
  },
  'livingText.chapter.get': {
    params: objectSchema(
      {
        translationCode: stringSchema({ minLength: 1, maxLength: 20 }),
        book: stringSchema({ minLength: 1, maxLength: 64 }),
        chapter: numberSchema({ integer: true, min: 1, max: 150 })
      },
      { allowUnknown: false }
    ),
    result: arraySchema(livingTextVerseSchema, { maxLength: 200 })
  },
  'livingText.detect': {
    params: objectSchema(
      {
        translationCode: stringSchema({ minLength: 1, maxLength: 20 }),
        text: stringSchema({ minLength: 1, maxLength: 20_000 })
      },
      { allowUnknown: false }
    ),
    result: arraySchema(livingTextResolvedCitationSchema, { maxLength: 200 })
  },
  'admin.sermons.list': {
    params: undefinedSchema,
    result: arraySchema(adminSermonSchema, { maxLength: 10_000 })
  },
  'admin.sermons.create': {
    params: objectSchema(
      {
        title: stringSchema({ minLength: 1, maxLength: 512 }),
        status: enumSchema(['draft', 'published']),
        ...adminSermonInputFields
      },
      { allowUnknown: false }
    ),
    result: adminSermonSchema
  },
  'admin.sermons.update': {
    params: objectSchema(
      {
        id: boundedString,
        title: optionalSchema(stringSchema({ minLength: 1, maxLength: 512 })),
        status: optionalSchema(enumSchema(['draft', 'published'])),
        ...adminSermonInputFields
      },
      { allowUnknown: false }
    ),
    result: adminSermonSchema
  },
  'admin.sermons.delete': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: adminSermonDeleteResultSchema
  },
  'admin.sermons.series.list': {
    params: undefinedSchema,
    result: arraySchema(adminSermonSeriesSchema, { maxLength: 10_000 })
  },
  'admin.sermons.series.create': {
    params: objectSchema(
      {
        title: stringSchema({ minLength: 1, maxLength: 512 }),
        description: optionalSchema(stringSchema({ maxLength: 8192 })),
        imagePath: optionalSchema(stringSchema({ maxLength: 2048 }))
      },
      { allowUnknown: false }
    ),
    result: adminSermonSeriesSchema
  },
  'admin.videos.list': {
    params: undefinedSchema,
    result: arraySchema(adminVideoSchema, { maxLength: 10_000 })
  },
  'admin.videos.create': {
    params: objectSchema(
      {
        title: stringSchema({ minLength: 1, maxLength: 512 }),
        videoUrl: stringSchema({ minLength: 1, maxLength: 2048 }),
        speakerName: optionalSchema(stringSchema({ maxLength: 512 })),
        categoryId: optionalSchema(stringSchema({ maxLength: 255 }))
      },
      { allowUnknown: false }
    ),
    result: adminVideoSchema
  },
  'admin.videos.update': {
    params: objectSchema(
      {
        id: boundedString,
        title: optionalSchema(stringSchema({ minLength: 1, maxLength: 512 })),
        videoUrl: optionalSchema(stringSchema({ maxLength: 2048 })),
        speakerName: optionalSchema(stringSchema({ maxLength: 512 })),
        status: optionalSchema(enumSchema(['draft', 'published'])),
        categoryId: optionalSchema(stringSchema({ maxLength: 255 }))
      },
      { allowUnknown: false }
    ),
    result: adminVideoSchema
  },
  'admin.videos.delete': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: adminVideoDeleteResultSchema
  },
  'admin.videos.toggle_featured': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: objectSchema({ isFeatured: booleanSchema }, { allowUnknown: false })
  },
  'admin.videos.categories.list': {
    params: undefinedSchema,
    result: arraySchema(videoCategorySchema, { maxLength: 1000 })
  },
  'admin.videos.youtube_search': {
    params: objectSchema(
      { query: stringSchema({ minLength: 1, maxLength: 512 }) },
      { allowUnknown: false }
    ),
    result: arraySchema(youtubeSearchResultSchema, { maxLength: 100 })
  },
  'admin.videos.youtube_import': {
    params: objectSchema(
      {
        videos: arraySchema(
          objectSchema(
            {
              videoId: stringSchema({ minLength: 1, maxLength: 64 }),
              title: stringSchema({ minLength: 1, maxLength: 512 }),
              channelTitle: optionalSchema(stringSchema({ maxLength: 512 })),
              thumbnailUrl: stringSchema({ minLength: 1, maxLength: 2048 }),
              durationSeconds: optionalSchema(numberSchema({ integer: true, min: 0 })),
              videoUrl: stringSchema({ minLength: 1, maxLength: 2048 })
            },
            { allowUnknown: false }
          ),
          { maxLength: 50 }
        ),
        categoryId: optionalSchema(stringSchema({ maxLength: 255 })),
        status: enumSchema(['draft', 'published'])
      },
      { allowUnknown: false }
    ),
    result: arraySchema(adminVideoSchema, { maxLength: 50 })
  },
  'admin.members.list': {
    params: optionalSchema(
      objectSchema(
        {
          query: optionalSchema(stringSchema({ maxLength: 512 })),
          status: optionalSchema(enumSchema(['active', 'inactive', 'push', 'all'])),
          country: optionalSchema(stringSchema({ maxLength: 128 })),
          page: optionalSchema(numberSchema({ integer: true, min: 1 })),
          pageSize: optionalSchema(numberSchema({ integer: true, min: 1, max: 50 }))
        },
        { allowUnknown: false }
      )
    ),
    result: membersPageSchema
  },
  'admin.members.create': {
    params: objectSchema(
      {
        ...adminMemberInputFields,
        fullName: stringSchema({ minLength: 1, maxLength: 512 }),
        phone: stringSchema({ minLength: 1, maxLength: 64 })
      },
      { allowUnknown: false }
    ),
    result: adminMemberSchema
  },
  'admin.members.update': {
    params: objectSchema({ id: boundedString, ...adminMemberInputFields }, { allowUnknown: false }),
    result: adminMemberSchema
  },
  'admin.members.delete': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: adminMemberDeleteResultSchema
  },
  'admin.notifications.list': {
    params: undefinedSchema,
    result: arraySchema(notificationCampaignSchema, { maxLength: 10_000 })
  },
  'admin.notifications.create': {
    params: objectSchema(
      {
        title: stringSchema({ minLength: 1, maxLength: 512 }),
        body: stringSchema({ minLength: 1, maxLength: 4096 }),
        target: optionalSchema(stringSchema({ maxLength: 128 })),
        scheduledAt: optionalSchema(stringSchema({ maxLength: 64 })),
        showInApp: optionalSchema(booleanSchema),
        sendPush: optionalSchema(booleanSchema),
        imagePath: optionalSchema(stringSchema({ maxLength: 2048 }))
      },
      { allowUnknown: false }
    ),
    result: notificationCampaignSchema
  },
  'admin.notifications.update': {
    params: objectSchema(
      {
        id: boundedString,
        title: optionalSchema(stringSchema({ minLength: 1, maxLength: 512 })),
        body: optionalSchema(stringSchema({ minLength: 1, maxLength: 4096 })),
        target: optionalSchema(stringSchema({ maxLength: 128 })),
        scheduledAt: optionalSchema(stringSchema({ maxLength: 64 }))
      },
      { allowUnknown: false }
    ),
    result: notificationCampaignSchema
  },
  'admin.notifications.delete': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: notificationCampaignDeleteResultSchema
  },
  'admin.notifications.send': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: notificationCampaignSchema
  },
  'admin.videos.categories.create': {
    params: objectSchema(
      { name: stringSchema({ minLength: 1, maxLength: 512 }) },
      { allowUnknown: false }
    ),
    result: videoCategorySchema
  },
  'admin.events.list': {
    params: undefinedSchema,
    result: arraySchema(adminEventSchema, { maxLength: 10_000 })
  },
  'admin.events.create': {
    params: objectSchema(eventInputFields, { allowUnknown: false }),
    result: adminEventSchema
  },
  'admin.events.update': {
    params: objectSchema(
      {
        id: boundedString,
        ...eventInputFields,
        title: optionalSchema(eventInputFields.title),
        startsAt: optionalSchema(eventInputFields.startsAt),
        applyToSeries: optionalSchema(booleanSchema)
      },
      { allowUnknown: false }
    ),
    result: adminEventSchema
  },
  'admin.events.delete': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: eventDeleteResultSchema
  },
  'admin.uploads.image': {
    params: objectSchema(
      {
        folder: stringSchema({ minLength: 1, maxLength: 32 }),
        fileName: stringSchema({ minLength: 1, maxLength: 255 }),
        mimeType: stringSchema({ minLength: 1, maxLength: 128 }),
        dataBase64: stringSchema({ minLength: 1, maxLength: 30_000_000 })
      },
      { allowUnknown: false }
    ),
    result: uploadedImageSchema
  },
  'admin.attendance.open': {
    params: objectSchema({ eventId: boundedString }, { allowUnknown: false }),
    result: attendanceSessionSchema
  },
  'admin.attendance.close': {
    params: objectSchema({ eventId: boundedString }, { allowUnknown: false }),
    result: attendanceSessionSchema
  },
  'admin.attendance.qr': {
    params: objectSchema({ eventId: boundedString }, { allowUnknown: false }),
    result: attendanceQrSchema
  },
  'admin.attendance.list': {
    params: objectSchema({ eventId: boundedString }, { allowUnknown: false }),
    result: attendanceListSchema
  },
  'admin.attendance.manual': {
    params: objectSchema({ eventId: boundedString, ...manualCheckInFields }, { allowUnknown: false }),
    result: attendanceRecordSchema
  },
  'admin.attendance.delete': {
    params: objectSchema({ eventId: boundedString, recordId: boundedString }, { allowUnknown: false }),
    result: objectSchema({ deleted: booleanSchema }, { allowUnknown: false })
  },
  'admin.units.list': {
    params: undefinedSchema,
    result: arraySchema(organizationalUnitSchema, { maxLength: 10_000 })
  },
  'admin.units.get': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: organizationalUnitSchema
  },
  'admin.units.create': {
    params: objectSchema(createUnitFields, { allowUnknown: false }),
    result: organizationalUnitSchema
  },
  'admin.units.update': {
    params: objectSchema({ id: boundedString, ...updateUnitFields }, { allowUnknown: false }),
    result: organizationalUnitSchema
  },
  'admin.units.delete': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: objectSchema({ deleted: booleanSchema }, { allowUnknown: false })
  },
  'admin.units.members.add': {
    params: objectSchema(
      { unitId: boundedString, memberId: stringSchema({ minLength: 1, maxLength: 255 }) },
      { allowUnknown: false }
    ),
    result: organizationalUnitMembershipSchema
  },
  'admin.units.members.remove': {
    params: objectSchema({ unitId: boundedString, membershipId: boundedString }, { allowUnknown: false }),
    result: objectSchema({ deleted: booleanSchema }, { allowUnknown: false })
  },
  'admin.units.positions.create': {
    params: objectSchema({ unitId: boundedString, ...createUnitPositionFields }, { allowUnknown: false }),
    result: organizationalUnitPositionSchema
  },
  'admin.units.positions.delete': {
    params: objectSchema({ unitId: boundedString, positionId: boundedString }, { allowUnknown: false }),
    result: objectSchema({ deleted: booleanSchema }, { allowUnknown: false })
  },
  'admin.units.positions.assign': {
    params: objectSchema(
      { unitId: boundedString, positionId: boundedString, memberId: stringSchema({ minLength: 1, maxLength: 255 }) },
      { allowUnknown: false }
    ),
    result: organizationalUnitPositionAssignmentSchema
  },
  'admin.units.positions.assignments.end': {
    params: objectSchema(
      { unitId: boundedString, positionId: boundedString, assignmentId: boundedString },
      { allowUnknown: false }
    ),
    result: organizationalUnitPositionAssignmentSchema
  },
  'admin.locations.list': {
    params: undefinedSchema,
    result: arraySchema(locationSchema, { maxLength: 10_000 })
  },
  'admin.locations.create': {
    params: objectSchema(createLocationFields, { allowUnknown: false }),
    result: locationSchema
  },
  'admin.locations.update': {
    params: objectSchema({ id: boundedString, ...updateLocationFields }, { allowUnknown: false }),
    result: locationSchema
  },
  'admin.locations.delete': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: objectSchema({ deleted: booleanSchema }, { allowUnknown: false })
  },
  'admin.team.list': {
    params: undefinedSchema,
    result: arraySchema(teamUserSchema, { maxLength: 10_000 })
  },
  'admin.team.create': {
    params: objectSchema(createTeamUserFields, { allowUnknown: false }),
    result: teamUserSchema
  },
  'admin.team.update': {
    params: objectSchema({ id: boundedString, ...updateTeamUserFields }, { allowUnknown: false }),
    result: teamUserSchema
  },
  'admin.team.delete': {
    params: objectSchema({ id: boundedString }, { allowUnknown: false }),
    result: objectSchema({ deleted: booleanSchema }, { allowUnknown: false })
  },
  'geocoding.search': {
    params: objectSchema(
      { query: stringSchema({ minLength: 1, maxLength: 512 }) },
      { allowUnknown: false }
    ),
    result: arraySchema(geocodeResultSchema, { maxLength: 50 })
  },
  'geocoding.reverse': {
    params: objectSchema(
      { lat: numberSchema(), lng: numberSchema() },
      { allowUnknown: false }
    ),
    result: geocodeReverseResultSchema
  }
} satisfies Record<BackendRpcMethod, RuntimeBackendRpcContract>

export function isTypedBackendRpcMethod(method: string): method is BackendRpcMethod {
  return method in runtimeContracts
}

export function validateBackendRpcParams(method: string, params: unknown): unknown {
  const contract = runtimeContracts[method as keyof typeof runtimeContracts] as
    | RuntimeBackendRpcContract
    | undefined
  return (contract?.params ?? boundedBackendParamsSchema).parse(params, `backend.${method}.params`)
}

export function validateBackendRpcResult(method: string, result: unknown): unknown {
  const contract = runtimeContracts[method as keyof typeof runtimeContracts] as
    | RuntimeBackendRpcContract
    | undefined
  return (contract?.result ?? boundedBackendPayloadSchema).parse(result, `backend.${method}.result`)
}

/** Runtime-validated method names, exported for protocol coverage tests. */
export const runtimeValidatedBackendRpcMethods = Object.freeze(
  Object.keys(runtimeContracts) as BackendRpcMethod[]
)

const runtimeEventSchemas = {
  'devices.changed': deviceListSchema,
  'entitlements.updated': entitlementsSchema,
  'noiseCleanup.status': noiseCleanupJobSchema,
  'platformAccounts.oauth.callback': oauthCallbackResultSchema,
  'recording.status': recordingStatusSchema,
  'scene.changed': sceneSchema,
  'compositor.status': compositorStatusSchema,
  'preview.live.status': previewLiveStatusSchema,
  'preview.surface.status': previewSurfaceStatusSchema,
  'preview.camera.status': previewCameraStatusSchema,
  'preview.screen.status': previewScreenStatusSchema,
  'diagnostics.stats': diagnosticStatsSchema
} satisfies Record<BackendEvent, RuntimeSchema<unknown>>

export function validateBackendEventPayload(event: string, payload: unknown): unknown {
  const schema = runtimeEventSchemas[event as keyof typeof runtimeEventSchemas] as
    | RuntimeSchema<unknown>
    | undefined
  return (schema ?? boundedBackendPayloadSchema).parse(payload, `backend.event.${event}`)
}

export function validateCompositorFrameReadyPayload(payload: unknown): CompositorFrameReady {
  return compositorFrameReadySchema.parse(payload, 'backend.event.preview.frameReady')
}

/** Parse the websocket envelope before any `in` checks or payload dispatch. */
export function parseBackendWireMessage(raw: string): ServerResponse | ServerEvent {
  if (typeof raw !== 'string' || raw.length > MAX_BACKEND_WIRE_MESSAGE_CHARS) {
    throw new Error('Backend sent an oversized websocket message.')
  }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('Backend sent invalid JSON.')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Backend sent an invalid websocket envelope.')
  }
  const record = value as Record<string, unknown>
  if ('id' in record) {
    const id = boundedString.parse(record.id, 'backend.response.id')
    const ok = booleanSchema.parse(record.ok, 'backend.response.ok')
    if (ok) {
      assertExactEnvelopeFields(record, ['id', 'ok', 'payload'], 'backend.response')
      return { id, ok, payload: record.payload }
    }
    assertExactEnvelopeFields(record, ['id', 'ok', 'error'], 'backend.response')
    const error = objectSchema(
      {
        code: stringSchema({ minLength: 1, maxLength: 1024 }),
        message: stringSchema({ minLength: 1, maxLength: 16_384 })
      },
      { allowUnknown: false }
    ).parse(record.error, 'backend.response.error')
    return { id, ok, error }
  }
  assertExactEnvelopeFields(record, ['event', 'payload'], 'backend.event')
  const event = boundedString.parse(record.event, 'backend.event.name')
  return { event, payload: record.payload }
}

function assertExactEnvelopeFields(
  record: Record<string, unknown>,
  expectedFields: readonly string[],
  path: string
): void {
  const expected = new Set(expectedFields)
  for (const field of Object.keys(record)) {
    if (!expected.has(field)) {
      throw new Error(`${path}.${field} must be a known field.`)
    }
  }
  for (const field of expectedFields) {
    if (!Object.hasOwn(record, field)) {
      throw new Error(`${path}.${field} is required.`)
    }
  }
}
