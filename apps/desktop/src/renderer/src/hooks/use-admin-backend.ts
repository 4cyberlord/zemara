import { useCallback, useEffect, useRef, useState } from 'react'

import { BackendClient } from '@/backendClient'
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
  BackendConnection,
  CreateCampaignInput,
  CreateEventInput,
  CreateLocationInput,
  CreateTeamUserInput,
  CreateUnitInput,
  CreateUnitPositionInput,
  GeocodeResult,
  GeocodeReverseResult,
  LivingTextAvailableTranslation,
  LivingTextBook,
  LivingTextResolvedCitation,
  LivingTextSyncSummary,
  LivingTextTranslation,
  LivingTextVerse,
  Location,
  ManualCheckInInput,
  MembersQuery,
  MembersStats,
  NotificationCampaign,
  OrganizationalUnit,
  OrganizationalUnitMembership,
  OrganizationalUnitPosition,
  OrganizationalUnitPositionAssignment,
  TeamUser,
  UpdateCampaignInput,
  UpdateEventInput,
  UpdateLocationInput,
  UpdateTeamUserInput,
  UpdateUnitInput,
  UploadedImage,
  UploadImageInput,
  VideoCategory,
  YoutubeImportInput,
  YoutubeSearchResult
} from '@/lib/backend'

// Deliberately its own small BackendClient rather than threading through the
// central useStudioCore() provider (use-studio.tsx): Admin/Sermons has no
// dependency on the capture/recording state machine that hook orchestrates,
// and BackendClient opens its own WebSocket, so a second lightweight
// connection is the lower-risk, single-responsibility choice here.
export type UseAdminBackend = {
  connection: AdminConnection | null
  connectionLoading: boolean
  connectionError: string | null
  refreshConnection: () => Promise<void>
  saveConnection: (baseUrl: string, apiKey?: string) => Promise<AdminConnection>
  clearConnection: () => Promise<AdminConnection>
  testConnection: (baseUrl: string, apiKey: string) => Promise<AdminConnectionTestResult>
  registerOrganization: (
    baseUrl: string,
    organizationName: string,
    ownerName: string,
    ownerEmail: string,
    ownerPassword: string
  ) => Promise<AdminRegisterResult>
  sermons: AdminSermon[]
  sermonsLoading: boolean
  sermonsError: string | null
  refreshSermons: () => Promise<void>
  createSermon: (
    input: AdminSermonInput & { title: string; status: 'draft' | 'published' }
  ) => Promise<AdminSermon>
  updateSermon: (id: string, input: AdminSermonInput) => Promise<AdminSermon>
  deleteSermon: (id: string) => Promise<void>
  series: AdminSermonSeries[]
  seriesLoading: boolean
  refreshSeries: () => Promise<void>
  createSeries: (input: {
    title: string
    description?: string
    imagePath?: string
  }) => Promise<AdminSermonSeries>
  videos: AdminVideo[]
  videosLoading: boolean
  videosError: string | null
  refreshVideos: () => Promise<void>
  createVideo: (
    input: Omit<AdminVideoInput, 'status'> & { title: string; videoUrl: string }
  ) => Promise<AdminVideo>
  updateVideo: (id: string, input: AdminVideoInput) => Promise<AdminVideo>
  deleteVideo: (id: string) => Promise<void>
  toggleVideoFeatured: (id: string) => Promise<boolean>
  videoCategories: VideoCategory[]
  videoCategoriesLoading: boolean
  refreshVideoCategories: () => Promise<void>
  createVideoCategory: (input: { name: string }) => Promise<VideoCategory>
  searchYoutube: (query: string) => Promise<YoutubeSearchResult[]>
  importFromYoutube: (input: YoutubeImportInput) => Promise<AdminVideo[]>
  members: AdminMember[]
  membersLoading: boolean
  membersError: string | null
  membersStats: MembersStats | null
  membersPage: number
  membersTotalPages: number
  refreshMembers: (query?: MembersQuery) => Promise<void>
  createMember: (
    input: AdminMemberInput & { fullName: string; phone: string }
  ) => Promise<AdminMember>
  updateMember: (id: string, input: AdminMemberInput) => Promise<AdminMember>
  deleteMember: (id: string) => Promise<void>
  fetchAllMembers: (query?: Omit<MembersQuery, 'page' | 'pageSize'>) => Promise<AdminMember[]>
  campaigns: NotificationCampaign[]
  campaignsLoading: boolean
  campaignsError: string | null
  refreshCampaigns: () => Promise<void>
  createCampaign: (input: CreateCampaignInput) => Promise<NotificationCampaign>
  updateCampaign: (id: string, input: UpdateCampaignInput) => Promise<NotificationCampaign>
  deleteCampaign: (id: string) => Promise<void>
  sendCampaignNow: (id: string) => Promise<NotificationCampaign>
  events: AdminEvent[]
  eventsLoading: boolean
  eventsError: string | null
  refreshEvents: () => Promise<void>
  createEvent: (input: CreateEventInput) => Promise<AdminEvent>
  updateEvent: (id: string, input: UpdateEventInput) => Promise<AdminEvent>
  deleteEvent: (id: string) => Promise<void>
  searchLocations: (query: string) => Promise<GeocodeResult[]>
  reverseGeocode: (lat: number, lng: number) => Promise<GeocodeReverseResult>
  uploadImage: (input: UploadImageInput) => Promise<UploadedImage>
  openAttendance: (eventId: string) => Promise<AttendanceSession>
  closeAttendance: (eventId: string) => Promise<AttendanceSession>
  getAttendanceQr: (eventId: string) => Promise<AttendanceQr>
  listAttendance: (eventId: string) => Promise<AttendanceList>
  manualCheckIn: (eventId: string, input: ManualCheckInInput) => Promise<AttendanceRecord>
  deleteAttendanceRecord: (eventId: string, recordId: string) => Promise<void>
  units: OrganizationalUnit[]
  unitsLoading: boolean
  unitsError: string | null
  refreshUnits: () => Promise<void>
  getUnit: (id: string) => Promise<OrganizationalUnit>
  createUnit: (input: CreateUnitInput) => Promise<OrganizationalUnit>
  updateUnit: (id: string, input: UpdateUnitInput) => Promise<OrganizationalUnit>
  deleteUnit: (id: string) => Promise<void>
  addUnitMember: (unitId: string, memberId: string) => Promise<OrganizationalUnitMembership>
  removeUnitMember: (unitId: string, membershipId: string) => Promise<void>
  createUnitPosition: (unitId: string, input: CreateUnitPositionInput) => Promise<OrganizationalUnitPosition>
  deleteUnitPosition: (unitId: string, positionId: string) => Promise<void>
  assignUnitPosition: (
    unitId: string,
    positionId: string,
    memberId: string
  ) => Promise<OrganizationalUnitPositionAssignment>
  endUnitPositionAssignment: (
    unitId: string,
    positionId: string,
    assignmentId: string
  ) => Promise<OrganizationalUnitPositionAssignment>
  locations: Location[]
  locationsLoading: boolean
  locationsError: string | null
  refreshLocations: () => Promise<void>
  createLocation: (input: CreateLocationInput) => Promise<Location>
  updateLocation: (id: string, input: UpdateLocationInput) => Promise<Location>
  deleteLocation: (id: string) => Promise<void>
  teamUsers: TeamUser[]
  teamUsersLoading: boolean
  teamUsersError: string | null
  refreshTeamUsers: () => Promise<void>
  createTeamUser: (input: CreateTeamUserInput) => Promise<TeamUser>
  updateTeamUser: (id: string, input: UpdateTeamUserInput) => Promise<TeamUser>
  deleteTeamUser: (id: string) => Promise<void>
  livingTextBooks: LivingTextBook[]
  loadLivingTextBooks: () => Promise<void>
  livingTextTranslations: LivingTextTranslation[]
  livingTextTranslationsLoading: boolean
  livingTextTranslationsError: string | null
  refreshLivingTextTranslations: () => Promise<void>
  livingTextAvailableTranslations: LivingTextAvailableTranslation[]
  livingTextAvailableTranslationsLoading: boolean
  refreshAvailableLivingTextTranslations: () => Promise<void>
  syncLivingTextTranslation: (translationCode: string) => Promise<LivingTextSyncSummary>
  getLivingTextChapter: (
    translationCode: string,
    book: string,
    chapter: number
  ) => Promise<LivingTextVerse[]>
  detectLivingTextCitations: (
    translationCode: string,
    text: string
  ) => Promise<LivingTextResolvedCitation[]>
}

export function useAdminBackend(): UseAdminBackend {
  const clientRef = useRef<BackendClient | null>(null)
  const [ready, setReady] = useState(false)

  const [connection, setConnection] = useState<AdminConnection | null>(null)
  const [connectionLoading, setConnectionLoading] = useState(true)
  const [connectionError, setConnectionError] = useState<string | null>(null)

  const [sermons, setSermons] = useState<AdminSermon[]>([])
  const [sermonsLoading, setSermonsLoading] = useState(false)
  const [sermonsError, setSermonsError] = useState<string | null>(null)

  const [livingTextBooks, setLivingTextBooks] = useState<LivingTextBook[]>([])
  const [livingTextTranslations, setLivingTextTranslations] = useState<LivingTextTranslation[]>([])
  const [livingTextTranslationsLoading, setLivingTextTranslationsLoading] = useState(false)
  const [livingTextTranslationsError, setLivingTextTranslationsError] = useState<string | null>(null)
  const [livingTextAvailableTranslations, setLivingTextAvailableTranslations] = useState<
    LivingTextAvailableTranslation[]
  >([])
  const [livingTextAvailableTranslationsLoading, setLivingTextAvailableTranslationsLoading] =
    useState(false)

  const [series, setSeries] = useState<AdminSermonSeries[]>([])
  const [seriesLoading, setSeriesLoading] = useState(false)

  const [videos, setVideos] = useState<AdminVideo[]>([])
  const [videosLoading, setVideosLoading] = useState(false)
  const [videosError, setVideosError] = useState<string | null>(null)

  const [videoCategories, setVideoCategories] = useState<VideoCategory[]>([])
  const [videoCategoriesLoading, setVideoCategoriesLoading] = useState(false)

  const [members, setMembers] = useState<AdminMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [membersStats, setMembersStats] = useState<MembersStats | null>(null)
  const [membersPage, setMembersPage] = useState(1)
  const [membersTotalPages, setMembersTotalPages] = useState(1)

  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([])
  const [campaignsLoading, setCampaignsLoading] = useState(false)
  const [campaignsError, setCampaignsError] = useState<string | null>(null)

  const [events, setEvents] = useState<AdminEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(false)
  const [eventsError, setEventsError] = useState<string | null>(null)

  const [units, setUnits] = useState<OrganizationalUnit[]>([])
  const [unitsLoading, setUnitsLoading] = useState(false)
  const [unitsError, setUnitsError] = useState<string | null>(null)

  const [locations, setLocations] = useState<Location[]>([])
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [locationsError, setLocationsError] = useState<string | null>(null)

  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([])
  const [teamUsersLoading, setTeamUsersLoading] = useState(false)
  const [teamUsersError, setTeamUsersError] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.videorc) {
      // Preload bridge unavailable (e.g. rendered outside Electron).
      setConnectionLoading(false)
      return
    }
    let disposed = false

    const attach = (nextConnection: BackendConnection | null): void => {
      clientRef.current?.close()
      clientRef.current = null
      setReady(false)
      if (!nextConnection) return
      const client = new BackendClient(nextConnection)
      clientRef.current = client
      client.connect().then(
        () => {
          if (!disposed && clientRef.current === client) setReady(true)
        },
        () => {
          if (!disposed && clientRef.current === client) setReady(false)
        }
      )
    }

    window.videorc.getBackendConnection().then((nextConnection) => {
      if (!disposed) attach(nextConnection)
    })
    const off = window.videorc.onBackendConnection(attach)

    return () => {
      disposed = true
      off()
      clientRef.current?.close()
      clientRef.current = null
    }
  }, [])

  const refreshConnection = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setConnectionLoading(true)
    setConnectionError(null)
    try {
      setConnection(await client.requestTyped('admin.connection.get'))
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error))
    } finally {
      setConnectionLoading(false)
    }
  }, [])

  useEffect(() => {
    if (ready) void refreshConnection()
  }, [ready, refreshConnection])

  const saveConnection = useCallback(
    async (baseUrl: string, apiKey?: string): Promise<AdminConnection> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const next = await client.requestTyped('admin.connection.set', { baseUrl, apiKey })
      setConnection(next)
      return next
    },
    []
  )

  const clearConnection = useCallback(async (): Promise<AdminConnection> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    const next = await client.requestTyped('admin.connection.clear')
    setConnection(next)
    setSermons([])
    setSeries([])
    setVideos([])
    setVideoCategories([])
    setMembers([])
    setMembersStats(null)
    setCampaigns([])
    setEvents([])
    return next
  }, [])

  const testConnection = useCallback(
    async (baseUrl: string, apiKey: string): Promise<AdminConnectionTestResult> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      return client.requestTyped('admin.connection.test', { baseUrl, apiKey })
    },
    []
  )

  const registerOrganization = useCallback(
    async (
      baseUrl: string,
      organizationName: string,
      ownerName: string,
      ownerEmail: string,
      ownerPassword: string
    ): Promise<AdminRegisterResult> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const result = await client.requestTyped('admin.register', {
        baseUrl,
        organizationName,
        ownerName,
        ownerEmail,
        ownerPassword
      })
      // The new church now has a real API key — store it immediately so the
      // rest of the app (which reads Settings > Database) picks it up
      // without the user having to paste it in a second time.
      setConnection(await client.requestTyped('admin.connection.set', { baseUrl, apiKey: result.apiKey }))
      return result
    },
    []
  )

  const loadLivingTextBooks = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setLivingTextBooks(await client.requestTyped('livingText.books.list'))
  }, [])

  const refreshLivingTextTranslations = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setLivingTextTranslationsLoading(true)
    setLivingTextTranslationsError(null)
    try {
      setLivingTextTranslations(await client.requestTyped('livingText.translations.list'))
    } catch (error) {
      setLivingTextTranslationsError(error instanceof Error ? error.message : String(error))
    } finally {
      setLivingTextTranslationsLoading(false)
    }
  }, [])

  const refreshAvailableLivingTextTranslations = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setLivingTextAvailableTranslationsLoading(true)
    try {
      setLivingTextAvailableTranslations(await client.requestTyped('livingText.availableTranslations.list'))
    } finally {
      setLivingTextAvailableTranslationsLoading(false)
    }
  }, [])

  const syncLivingTextTranslation = useCallback(
    async (translationCode: string): Promise<LivingTextSyncSummary> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const summary = await client.requestTyped('livingText.sync', { translationCode })
      await refreshLivingTextTranslations()
      return summary
    },
    [refreshLivingTextTranslations]
  )

  const getLivingTextChapter = useCallback(
    async (translationCode: string, book: string, chapter: number): Promise<LivingTextVerse[]> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      return client.requestTyped('livingText.chapter.get', { translationCode, book, chapter })
    },
    []
  )

  const detectLivingTextCitations = useCallback(
    async (translationCode: string, text: string): Promise<LivingTextResolvedCitation[]> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      return client.requestTyped('livingText.detect', { translationCode, text })
    },
    []
  )

  const refreshSermons = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setSermonsLoading(true)
    setSermonsError(null)
    try {
      setSermons(await client.requestTyped('admin.sermons.list'))
    } catch (error) {
      setSermonsError(error instanceof Error ? error.message : String(error))
    } finally {
      setSermonsLoading(false)
    }
  }, [])

  const createSermon = useCallback(
    async (
      input: AdminSermonInput & { title: string; status: 'draft' | 'published' }
    ): Promise<AdminSermon> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const sermon = await client.requestTyped('admin.sermons.create', input)
      setSermons((current) => [sermon, ...current])
      return sermon
    },
    []
  )

  const updateSermon = useCallback(
    async (id: string, input: AdminSermonInput): Promise<AdminSermon> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const sermon = await client.requestTyped('admin.sermons.update', { id, ...input })
      setSermons((current) => current.map((entry) => (entry.id === id ? sermon : entry)))
      return sermon
    },
    []
  )

  const deleteSermon = useCallback(async (id: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.sermons.delete', { id })
    setSermons((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const refreshSeries = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setSeriesLoading(true)
    try {
      setSeries(await client.requestTyped('admin.sermons.series.list'))
    } finally {
      setSeriesLoading(false)
    }
  }, [])

  const createSeries = useCallback(
    async (input: {
      title: string
      description?: string
      imagePath?: string
    }): Promise<AdminSermonSeries> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const created = await client.requestTyped('admin.sermons.series.create', input)
      setSeries((current) => [...current, created].sort((a, b) => a.title.localeCompare(b.title)))
      return created
    },
    []
  )

  const refreshVideos = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setVideosLoading(true)
    setVideosError(null)
    try {
      setVideos(await client.requestTyped('admin.videos.list'))
    } catch (error) {
      setVideosError(error instanceof Error ? error.message : String(error))
    } finally {
      setVideosLoading(false)
    }
  }, [])

  const createVideo = useCallback(
    async (
      input: Omit<AdminVideoInput, 'status'> & { title: string; videoUrl: string }
    ): Promise<AdminVideo> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const video = await client.requestTyped('admin.videos.create', input)
      setVideos((current) => [video, ...current])
      return video
    },
    []
  )

  const updateVideo = useCallback(
    async (id: string, input: AdminVideoInput): Promise<AdminVideo> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const video = await client.requestTyped('admin.videos.update', { id, ...input })
      setVideos((current) => current.map((entry) => (entry.id === id ? video : entry)))
      return video
    },
    []
  )

  const deleteVideo = useCallback(async (id: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.videos.delete', { id })
    setVideos((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const toggleVideoFeatured = useCallback(async (id: string): Promise<boolean> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    const { isFeatured } = await client.requestTyped('admin.videos.toggle_featured', { id })
    setVideos((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, isFeatured: isFeatured ? 1 : 0 } : entry
      )
    )
    return isFeatured
  }, [])

  const refreshVideoCategories = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setVideoCategoriesLoading(true)
    try {
      setVideoCategories(await client.requestTyped('admin.videos.categories.list'))
    } finally {
      setVideoCategoriesLoading(false)
    }
  }, [])

  const createVideoCategory = useCallback(
    async (input: { name: string }): Promise<VideoCategory> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const created = await client.requestTyped('admin.videos.categories.create', input)
      setVideoCategories((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name))
      )
      return created
    },
    []
  )

  const searchYoutube = useCallback(async (query: string): Promise<YoutubeSearchResult[]> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    return client.requestTyped('admin.videos.youtube_search', { query })
  }, [])

  const importFromYoutube = useCallback(
    async (input: YoutubeImportInput): Promise<AdminVideo[]> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const created = await client.requestTyped('admin.videos.youtube_import', input)
      setVideos((current) => [...created, ...current])
      return created
    },
    []
  )

  const refreshMembers = useCallback(async (query?: MembersQuery): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setMembersLoading(true)
    setMembersError(null)
    try {
      const result = await client.requestTyped('admin.members.list', query)
      setMembers(result.items)
      setMembersStats(result.stats)
      setMembersPage(result.page)
      setMembersTotalPages(result.totalPages)
    } catch (error) {
      setMembersError(error instanceof Error ? error.message : String(error))
    } finally {
      setMembersLoading(false)
    }
  }, [])

  const createMember = useCallback(
    async (input: AdminMemberInput & { fullName: string; phone: string }): Promise<AdminMember> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const member = await client.requestTyped('admin.members.create', input)
      setMembers((current) => [member, ...current])
      return member
    },
    []
  )

  const updateMember = useCallback(
    async (id: string, input: AdminMemberInput): Promise<AdminMember> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const member = await client.requestTyped('admin.members.update', { id, ...input })
      setMembers((current) => current.map((entry) => (entry.id === id ? member : entry)))
      return member
    },
    []
  )

  const deleteMember = useCallback(async (id: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.members.delete', { id })
    setMembers((current) => current.filter((entry) => entry.id !== id))
  }, [])

  // Pages through every member matching the given filters (ignoring
  // page/pageSize on the input) without touching the `members` list state —
  // used by the Export flow, which needs the full filtered result set, not
  // just whatever page is currently on screen.
  const fetchAllMembers = useCallback(
    async (query?: Omit<MembersQuery, 'page' | 'pageSize'>): Promise<AdminMember[]> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const pageSize = 50
      const all: AdminMember[] = []
      let page = 1
      for (;;) {
        const result = await client.requestTyped('admin.members.list', {
          ...query,
          page,
          pageSize
        })
        all.push(...result.items)
        if (page >= result.totalPages) break
        page += 1
      }
      return all
    },
    []
  )

  const refreshCampaigns = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setCampaignsLoading(true)
    setCampaignsError(null)
    try {
      setCampaigns(await client.requestTyped('admin.notifications.list'))
    } catch (error) {
      setCampaignsError(error instanceof Error ? error.message : String(error))
    } finally {
      setCampaignsLoading(false)
    }
  }, [])

  const createCampaign = useCallback(
    async (input: CreateCampaignInput): Promise<NotificationCampaign> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const campaign = await client.requestTyped('admin.notifications.create', input)
      setCampaigns((current) => [campaign, ...current])
      return campaign
    },
    []
  )

  const updateCampaign = useCallback(
    async (id: string, input: UpdateCampaignInput): Promise<NotificationCampaign> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const campaign = await client.requestTyped('admin.notifications.update', { id, ...input })
      setCampaigns((current) => current.map((entry) => (entry.id === id ? campaign : entry)))
      return campaign
    },
    []
  )

  const deleteCampaign = useCallback(async (id: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.notifications.delete', { id })
    setCampaigns((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const sendCampaignNow = useCallback(async (id: string): Promise<NotificationCampaign> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    const campaign = await client.requestTyped('admin.notifications.send', { id })
    setCampaigns((current) => current.map((entry) => (entry.id === id ? campaign : entry)))
    return campaign
  }, [])

  const refreshEvents = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setEventsLoading(true)
    setEventsError(null)
    try {
      setEvents(await client.requestTyped('admin.events.list'))
    } catch (error) {
      setEventsError(error instanceof Error ? error.message : String(error))
    } finally {
      setEventsLoading(false)
    }
  }, [])

  const createEvent = useCallback(async (input: CreateEventInput): Promise<AdminEvent> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    const event = await client.requestTyped('admin.events.create', input)
    setEvents((current) => [...current, event])
    return event
  }, [])

  const updateEvent = useCallback(
    async (id: string, input: UpdateEventInput): Promise<AdminEvent> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const event = await client.requestTyped('admin.events.update', { id, ...input })
      setEvents((current) => current.map((entry) => (entry.id === id ? event : entry)))
      return event
    },
    []
  )

  const deleteEvent = useCallback(async (id: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.events.delete', { id })
    setEvents((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const openAttendance = useCallback(async (eventId: string): Promise<AttendanceSession> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    return client.requestTyped('admin.attendance.open', { eventId })
  }, [])

  const closeAttendance = useCallback(async (eventId: string): Promise<AttendanceSession> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    return client.requestTyped('admin.attendance.close', { eventId })
  }, [])

  const getAttendanceQr = useCallback(async (eventId: string): Promise<AttendanceQr> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    return client.requestTyped('admin.attendance.qr', { eventId })
  }, [])

  const listAttendance = useCallback(async (eventId: string): Promise<AttendanceList> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    return client.requestTyped('admin.attendance.list', { eventId })
  }, [])

  const manualCheckIn = useCallback(
    async (eventId: string, input: ManualCheckInInput): Promise<AttendanceRecord> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      return client.requestTyped('admin.attendance.manual', { eventId, ...input })
    },
    []
  )

  const deleteAttendanceRecord = useCallback(async (eventId: string, recordId: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.attendance.delete', { eventId, recordId })
  }, [])

  const refreshUnits = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setUnitsLoading(true)
    setUnitsError(null)
    try {
      setUnits(await client.requestTyped('admin.units.list'))
    } catch (error) {
      setUnitsError(error instanceof Error ? error.message : String(error))
    } finally {
      setUnitsLoading(false)
    }
  }, [])

  const getUnit = useCallback(async (id: string): Promise<OrganizationalUnit> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    return client.requestTyped('admin.units.get', { id })
  }, [])

  const createUnit = useCallback(async (input: CreateUnitInput): Promise<OrganizationalUnit> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    const unit = await client.requestTyped('admin.units.create', input)
    setUnits((current) => [...current, unit])
    return unit
  }, [])

  const updateUnit = useCallback(
    async (id: string, input: UpdateUnitInput): Promise<OrganizationalUnit> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const unit = await client.requestTyped('admin.units.update', { id, ...input })
      setUnits((current) => current.map((entry) => (entry.id === id ? unit : entry)))
      return unit
    },
    []
  )

  const deleteUnit = useCallback(async (id: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.units.delete', { id })
    setUnits((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const addUnitMember = useCallback(
    async (unitId: string, memberId: string): Promise<OrganizationalUnitMembership> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      return client.requestTyped('admin.units.members.add', { unitId, memberId })
    },
    []
  )

  const removeUnitMember = useCallback(async (unitId: string, membershipId: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.units.members.remove', { unitId, membershipId })
  }, [])

  const createUnitPosition = useCallback(
    async (unitId: string, input: CreateUnitPositionInput): Promise<OrganizationalUnitPosition> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      return client.requestTyped('admin.units.positions.create', { unitId, ...input })
    },
    []
  )

  const deleteUnitPosition = useCallback(async (unitId: string, positionId: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.units.positions.delete', { unitId, positionId })
  }, [])

  const assignUnitPosition = useCallback(
    async (
      unitId: string,
      positionId: string,
      memberId: string
    ): Promise<OrganizationalUnitPositionAssignment> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      return client.requestTyped('admin.units.positions.assign', { unitId, positionId, memberId })
    },
    []
  )

  const endUnitPositionAssignment = useCallback(
    async (
      unitId: string,
      positionId: string,
      assignmentId: string
    ): Promise<OrganizationalUnitPositionAssignment> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      return client.requestTyped('admin.units.positions.assignments.end', {
        unitId,
        positionId,
        assignmentId
      })
    },
    []
  )

  const refreshLocations = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setLocationsLoading(true)
    setLocationsError(null)
    try {
      setLocations(await client.requestTyped('admin.locations.list'))
    } catch (error) {
      setLocationsError(error instanceof Error ? error.message : String(error))
    } finally {
      setLocationsLoading(false)
    }
  }, [])

  const createLocation = useCallback(async (input: CreateLocationInput): Promise<Location> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    const location = await client.requestTyped('admin.locations.create', input)
    setLocations((current) => [...current, location])
    return location
  }, [])

  const updateLocation = useCallback(
    async (id: string, input: UpdateLocationInput): Promise<Location> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const location = await client.requestTyped('admin.locations.update', { id, ...input })
      setLocations((current) => current.map((entry) => (entry.id === id ? location : entry)))
      return location
    },
    []
  )

  const deleteLocation = useCallback(async (id: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.locations.delete', { id })
    setLocations((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const refreshTeamUsers = useCallback(async (): Promise<void> => {
    const client = clientRef.current
    if (!client) return
    setTeamUsersLoading(true)
    setTeamUsersError(null)
    try {
      setTeamUsers(await client.requestTyped('admin.team.list'))
    } catch (error) {
      setTeamUsersError(error instanceof Error ? error.message : String(error))
    } finally {
      setTeamUsersLoading(false)
    }
  }, [])

  const createTeamUser = useCallback(async (input: CreateTeamUserInput): Promise<TeamUser> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    const user = await client.requestTyped('admin.team.create', input)
    setTeamUsers((current) => [...current, user])
    return user
  }, [])

  const updateTeamUser = useCallback(
    async (id: string, input: UpdateTeamUserInput): Promise<TeamUser> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      const user = await client.requestTyped('admin.team.update', { id, ...input })
      setTeamUsers((current) => current.map((entry) => (entry.id === id ? user : entry)))
      return user
    },
    []
  )

  const deleteTeamUser = useCallback(async (id: string): Promise<void> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    await client.requestTyped('admin.team.delete', { id })
    setTeamUsers((current) => current.filter((entry) => entry.id !== id))
  }, [])

  const searchLocations = useCallback(async (query: string): Promise<GeocodeResult[]> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    return client.requestTyped('geocoding.search', { query })
  }, [])

  const reverseGeocode = useCallback(
    async (lat: number, lng: number): Promise<GeocodeReverseResult> => {
      const client = clientRef.current
      if (!client) throw new Error('Backend is not connected yet.')
      return client.requestTyped('geocoding.reverse', { lat, lng })
    },
    []
  )

  const uploadImage = useCallback(async (input: UploadImageInput): Promise<UploadedImage> => {
    const client = clientRef.current
    if (!client) throw new Error('Backend is not connected yet.')
    return client.requestTyped('admin.uploads.image', input)
  }, [])

  return {
    connection,
    connectionLoading,
    connectionError,
    refreshConnection,
    saveConnection,
    clearConnection,
    testConnection,
    registerOrganization,
    livingTextBooks,
    loadLivingTextBooks,
    livingTextTranslations,
    livingTextTranslationsLoading,
    livingTextTranslationsError,
    refreshLivingTextTranslations,
    livingTextAvailableTranslations,
    livingTextAvailableTranslationsLoading,
    refreshAvailableLivingTextTranslations,
    syncLivingTextTranslation,
    getLivingTextChapter,
    detectLivingTextCitations,
    sermons,
    sermonsLoading,
    sermonsError,
    refreshSermons,
    createSermon,
    updateSermon,
    deleteSermon,
    series,
    seriesLoading,
    refreshSeries,
    createSeries,
    videos,
    videosLoading,
    videosError,
    refreshVideos,
    createVideo,
    updateVideo,
    deleteVideo,
    toggleVideoFeatured,
    videoCategories,
    videoCategoriesLoading,
    refreshVideoCategories,
    createVideoCategory,
    searchYoutube,
    importFromYoutube,
    members,
    membersLoading,
    membersError,
    membersStats,
    membersPage,
    membersTotalPages,
    refreshMembers,
    createMember,
    updateMember,
    deleteMember,
    fetchAllMembers,
    campaigns,
    campaignsLoading,
    campaignsError,
    refreshCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    sendCampaignNow,
    events,
    eventsLoading,
    eventsError,
    refreshEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    searchLocations,
    reverseGeocode,
    uploadImage,
    openAttendance,
    closeAttendance,
    getAttendanceQr,
    listAttendance,
    manualCheckIn,
    deleteAttendanceRecord,
    units,
    unitsLoading,
    unitsError,
    refreshUnits,
    getUnit,
    createUnit,
    updateUnit,
    deleteUnit,
    addUnitMember,
    removeUnitMember,
    createUnitPosition,
    deleteUnitPosition,
    assignUnitPosition,
    endUnitPositionAssignment,
    locations,
    locationsLoading,
    locationsError,
    refreshLocations,
    createLocation,
    updateLocation,
    deleteLocation,
    teamUsers,
    teamUsersLoading,
    teamUsersError,
    refreshTeamUsers,
    createTeamUser,
    updateTeamUser,
    deleteTeamUser
  }
}
