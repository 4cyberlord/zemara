import {
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Clock,
  GearSix,
  GridFour,
  ListBullets,
  MagnifyingGlass,
  MapPin,
  PencilSimple,
  Plus,
  QrCode,
  Radio,
  Repeat,
  Trash,
  Users
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { AttendancePanel } from '@/components/attendance-panel'
import { LocationField } from '@/components/location-field'
import { PageHeader, PageStack } from '@/components/page'
import { EventRowSkeleton } from '@/components/skeleton-rows'
import { SingleImageUpload } from '@/components/single-image-upload'
import { StatusBadge, type StatusTone } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { AppSelect } from '@/components/ui/app-select'
import { IconStack } from '@/components/ui/icon-stack'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useWorkspaceNav } from '@/components/workspace-nav'
import { useAdminBackendContext } from '@/components/admin-backend-provider'
import type { AdminEvent } from '@/lib/backend'

const PAGE_SIZE = 5
type FilterTab = 'all' | 'upcoming' | 'live' | 'past' | 'draft'
const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All Events' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'live', label: 'Live Now' },
  { id: 'past', label: 'Past Events' },
  { id: 'draft', label: 'Drafts' }
]

type Timing = 'upcoming' | 'live' | 'past'

function timingOf(event: AdminEvent): Timing {
  const now = Date.now()
  const start = new Date(event.startsAt).getTime()
  const end = event.endsAt ? new Date(event.endsAt).getTime() : start + 3 * 60 * 60 * 1000
  if (now < start) return 'upcoming'
  if (now <= end) return 'live'
  return 'past'
}

const STATUS_TONE: Record<string, StatusTone> = {
  live: 'error',
  upcoming: 'good',
  past: 'neutral',
  draft: 'neutral',
  cancelled: 'error'
}

function formatDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromDatetimeLocal(value: string): string {
  return value ? new Date(value).toISOString() : ''
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Could not read the selected file.'))
    reader.readAsDataURL(file)
  })
}

type EventFormState = {
  title: string
  churchLocationId: string
  description: string
  category: string
  eventType: string
  status: 'draft' | 'published' | 'cancelled'
  startsAt: string
  endsAt: string
  timezone: string
  locationName: string
  locationAddress: string
  locationLat: number | null
  locationLng: number | null
  onlineUrl: string
  capacity: string
  isRecurring: boolean
  recurrenceFreq: 'weekly' | 'monthly'
  recurrenceInterval: string
  recurrenceUntil: string
  applyToSeries: boolean
}

function defaultTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Accra'
  } catch {
    return 'Africa/Accra'
  }
}

function emptyForm(): EventFormState {
  return {
    title: '',
    churchLocationId: '',
    description: '',
    category: 'General',
    eventType: 'In-Person',
    status: 'draft',
    startsAt: '',
    endsAt: '',
    timezone: defaultTimezone(),
    locationName: '',
    locationAddress: '',
    locationLat: null,
    locationLng: null,
    onlineUrl: '',
    capacity: '',
    isRecurring: false,
    recurrenceFreq: 'weekly',
    recurrenceInterval: '1',
    recurrenceUntil: '',
    applyToSeries: false
  }
}

function formFromEvent(event: AdminEvent): EventFormState {
  return {
    title: event.title,
    churchLocationId: event.churchLocationId ?? '',
    description: event.description ?? '',
    category: event.category,
    eventType: event.eventType,
    status: event.status === 'published' || event.status === 'cancelled' ? event.status : 'draft',
    startsAt: toDatetimeLocal(event.startsAt),
    endsAt: toDatetimeLocal(event.endsAt),
    timezone: event.timezone ?? defaultTimezone(),
    locationName: event.locationName ?? '',
    locationAddress: event.locationAddress ?? '',
    locationLat: event.locationLat,
    locationLng: event.locationLng,
    onlineUrl: event.onlineUrl ?? '',
    capacity: event.capacity !== null ? String(event.capacity) : '',
    isRecurring: event.isRecurring,
    recurrenceFreq: parseRecurrenceRule(event.recurrenceRule)?.freq ?? 'weekly',
    recurrenceInterval: String(parseRecurrenceRule(event.recurrenceRule)?.interval ?? 1),
    recurrenceUntil: '',
    applyToSeries: false
  }
}

function parseRecurrenceRule(rule: string | null): { freq: 'weekly' | 'monthly'; interval: number } | null {
  if (!rule) return null
  try {
    const parsed = JSON.parse(rule) as { freq?: string; interval?: number }
    return {
      freq: parsed.freq === 'monthly' ? 'monthly' : 'weekly',
      interval: typeof parsed.interval === 'number' && parsed.interval > 0 ? parsed.interval : 1
    }
  } catch {
    return null
  }
}

function CalendarWidget({ events }: { events: AdminEvent[] }): ReactElement {
  const [viewDate, setViewDate] = useState(() => new Date())
  const now = new Date()

  const firstDayOfWeek = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1).getDay()
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()
  const daysInPrevMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0).getDate()
  const prevPadding: number[] = []
  for (let index = firstDayOfWeek - 1; index >= 0; index -= 1) {
    prevPadding.push(daysInPrevMonth - index)
  }

  const eventsByDay = useMemo(() => {
    const map = new Map<number, AdminEvent[]>()
    for (const event of events) {
      const date = new Date(event.startsAt)
      if (
        date.getFullYear() === viewDate.getFullYear() &&
        date.getMonth() === viewDate.getMonth()
      ) {
        const list = map.get(date.getDate()) ?? []
        list.push(event)
        map.set(date.getDate(), list)
      }
    }
    return map
  }, [events, viewDate])

  return (
    <section className="rounded-3xl border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">Event Calendar</h2>
      <div className="mb-4 flex items-center justify-between px-1">
        <button
          className="rounded-lg border p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          type="button"
          onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1))}
        >
          <CaretLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">
          {viewDate.toLocaleString('default', { month: 'long' })} {viewDate.getFullYear()}
        </span>
        <button
          className="rounded-lg border p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
          type="button"
          onClick={() => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1))}
        >
          <CaretRight className="size-4" />
        </button>
      </div>
      <div className="mb-3 grid grid-cols-7 gap-y-2 text-xs font-semibold text-muted-foreground uppercase">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-2 text-sm">
        {prevPadding.map((day) => (
          <span
            key={`prev-${day}`}
            className="mx-auto flex size-8 select-none items-center justify-center text-muted-foreground/40"
          >
            {day}
          </span>
        ))}
        {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
          const dayEvents = eventsByDay.get(day) ?? []
          const isToday =
            now.getDate() === day &&
            now.getMonth() === viewDate.getMonth() &&
            now.getFullYear() === viewDate.getFullYear()
          return (
            <div
              key={`day-${day}`}
              className="relative mx-auto flex size-8 flex-col items-center justify-center"
            >
              <span
                className={
                  isToday
                    ? 'grid size-7 place-items-center rounded-full bg-primary font-semibold text-primary-foreground'
                    : 'grid size-7 place-items-center rounded-full text-foreground'
                }
              >
                {day}
              </span>
              {dayEvents.length > 0 ? (
                <span className="absolute bottom-0.5 size-1 rounded-full bg-primary" />
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// Browse archetype (page.tsx): PageHeader over content, same shape as
// MembersTab/AlertsTab. Mirrors the admin dashboard's Events page (see
// EventsClient.tsx) via the same /api/admin/events endpoints — 5 filter
// tabs, search + category filter, list/grid toggle, month calendar +
// upcoming-events + summary-stats sidebar, and a full create/edit form
// (location search + manual coordinates, single-image banner upload).
export function EventsTab(): ReactElement {
  const {
    connection,
    connectionLoading,
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
    locations,
    locationsLoading,
    refreshLocations
  } = useAdminBackendContext()
  const { setActive } = useWorkspaceNav()

  const configured = Boolean(connection?.apiKeyConfigured && connection.baseUrl)

  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [page, setPage] = useState(1)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<AdminEvent | null>(null)
  const [form, setForm] = useState<EventFormState>(emptyForm())
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerRemoved, setBannerRemoved] = useState(false)
  const [savePending, setSavePending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminEvent | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [attendanceEvent, setAttendanceEvent] = useState<AdminEvent | null>(null)

  const dialogOpen = creating || editing !== null

  useEffect(() => {
    if (!configured) return
    void refreshEvents()
  }, [configured, refreshEvents])

  useEffect(() => {
    setPage(1)
  }, [filterTab, query, categoryFilter])

  const categories = useMemo(
    () => [...new Set(events.map((event) => event.category).filter(Boolean))].sort(),
    [events]
  )

  const filtered = useMemo(() => {
    return events
      .filter((event) => {
        if (filterTab === 'draft') return event.status === 'draft'
        if (filterTab === 'all') return true
        return event.status === 'published' && timingOf(event) === filterTab
      })
      .filter((event) => {
        if (query) {
          const needle = query.toLowerCase()
          const matches =
            event.title.toLowerCase().includes(needle) ||
            (event.locationName ?? '').toLowerCase().includes(needle) ||
            event.category.toLowerCase().includes(needle)
          if (!matches) return false
        }
        if (categoryFilter !== 'all' && event.category !== categoryFilter) return false
        return true
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
  }, [events, filterTab, query, categoryFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const startIndex = (page - 1) * PAGE_SIZE
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  const now = new Date()
  const upcomingEvents = useMemo(
    () =>
      events
        .filter((event) => event.status === 'published' && timingOf(event) === 'upcoming')
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
        .slice(0, 4),
    [events]
  )
  const totalRegistrations = events.reduce((sum, event) => sum + event.registeredCount, 0)
  const upcomingCount = events.filter(
    (event) => event.status === 'published' && timingOf(event) === 'upcoming'
  ).length
  const liveThisMonthCount = events.filter(
    (event) =>
      event.status === 'published' &&
      timingOf(event) === 'live' &&
      new Date(event.startsAt).getMonth() === now.getMonth() &&
      new Date(event.startsAt).getFullYear() === now.getFullYear()
  ).length

  const openCreate = (): void => {
    setForm(emptyForm())
    setBannerFile(null)
    setBannerRemoved(false)
    setCreating(true)
    if (locations.length === 0 && !locationsLoading) void refreshLocations()
  }
  const openEdit = (event: AdminEvent): void => {
    setForm(formFromEvent(event))
    setBannerFile(null)
    setBannerRemoved(false)
    setEditing(event)
    if (locations.length === 0 && !locationsLoading) void refreshLocations()
  }
  const closeDialog = (): void => {
    setCreating(false)
    setEditing(null)
  }

  const handleSave = (): void => {
    if (!form.title.trim()) {
      toast.error('Title is required.')
      return
    }
    if (!form.startsAt) {
      toast.error('Start date and time are required.')
      return
    }
    setSavePending(true)
    void (async () => {
      try {
        let imagePath: string | undefined
        if (bannerFile) {
          const dataBase64 = await fileToBase64(bannerFile)
          const uploaded = await uploadImage({
            folder: 'events',
            fileName: bannerFile.name,
            mimeType: bannerFile.type || 'image/jpeg',
            dataBase64
          })
          imagePath = uploaded.url
        } else if (bannerRemoved) {
          imagePath = ''
        }

        const shared = {
          title: form.title,
          churchLocationId: form.churchLocationId || undefined,
          description: form.description || undefined,
          category: form.category || undefined,
          eventType: form.eventType || undefined,
          status: form.status,
          startsAt: fromDatetimeLocal(form.startsAt) || undefined,
          endsAt: form.endsAt ? fromDatetimeLocal(form.endsAt) : editing ? '' : undefined,
          timezone: form.timezone || undefined,
          locationName: form.locationName || undefined,
          locationAddress: form.locationAddress || undefined,
          locationLat: form.locationLat ?? undefined,
          locationLng: form.locationLng ?? undefined,
          onlineUrl: form.onlineUrl || undefined,
          capacity: form.capacity ? Number(form.capacity) : undefined,
          ...(imagePath !== undefined ? { imagePath } : {})
        }

        const event = editing
          ? await updateEvent(editing.id, {
              ...shared,
              ...(editing.recurrenceGroupId ? { applyToSeries: form.applyToSeries } : {})
            })
          : await createEvent({
              ...shared,
              title: form.title,
              startsAt: fromDatetimeLocal(form.startsAt),
              ...(form.isRecurring
                ? {
                    isRecurring: true,
                    recurrenceFreq: form.recurrenceFreq,
                    recurrenceInterval: Number(form.recurrenceInterval) || 1,
                    ...(form.recurrenceUntil ? { recurrenceUntil: fromDatetimeLocal(form.recurrenceUntil) } : {})
                  }
                : {})
            })

        toast.success(editing ? `Updated "${event.title}".` : `Created "${event.title}".`)
        closeDialog()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not save this event.')
      } finally {
        setSavePending(false)
      }
    })()
  }

  const handleDelete = (): void => {
    if (!deleteTarget) return
    setDeletePending(true)
    void deleteEvent(deleteTarget.id)
      .then(() => {
        toast.success(`Deleted "${deleteTarget.title}".`)
        setDeleteTarget(null)
        closeDialog()
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not delete this event.')
      )
      .finally(() => setDeletePending(false))
  }

  if (!connectionLoading && !configured) {
    return (
      <PageStack>
        <PageHeader
          description="Create, manage, and promote your ministry events."
          title="Events"
        />
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <CalendarBlank weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>Connect your database first</EmptyTitle>
          <EmptyDescription>
            Events read through your admin backend. Add its base URL and API key in Settings &gt;
            Database, then come back here.
          </EmptyDescription>
          <Button size="sm" variant="outline" onClick={() => setActive('settings')}>
            <GearSix data-icon="inline-start" />
            Open Settings
          </Button>
        </Empty>
      </PageStack>
    )
  }

  return (
    <PageStack>
      <PageHeader
        action={
          <Button disabled={!configured} size="sm" onClick={openCreate}>
            <Plus data-icon="inline-start" />
            Create Event
          </Button>
        }
        description="Create, manage, and promote your ministry events."
        title="Events"
      />

      <Tabs value={filterTab} onValueChange={(value) => setFilterTab(value as FilterTab)}>
        <TabsList className="w-full justify-start border-b" variant="line">
          {FILTER_TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3">
            <div className="flex min-w-[280px] flex-1 flex-wrap gap-2.5">
              <div className="relative w-full sm:w-56">
                <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Search events…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <AppSelect
                className="w-44"
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                options={[
                  { value: 'all', label: 'All Categories' },
                  ...categories.map((category) => ({ value: category, label: category }))
                ]}
              />
            </div>
            <ToggleGroup
              spacing={0}
              type="single"
              value={viewMode}
              variant="outline"
              onValueChange={(value) => value && setViewMode(value as 'list' | 'grid')}
            >
              <ToggleGroupItem value="list">
                <ListBullets />
              </ToggleGroupItem>
              <ToggleGroupItem value="grid">
                <GridFour />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {eventsLoading && events.length === 0 ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 4 }, (_, index) => (
                <EventRowSkeleton key={index} />
              ))}
            </div>
          ) : eventsError ? (
            <Empty className="py-16">
              <EmptyMedia variant="default">
                <IconStack>
                  <CalendarBlank weight="duotone" className="size-4" />
                </IconStack>
              </EmptyMedia>
              <EmptyTitle>Could not load events</EmptyTitle>
              <EmptyDescription>{eventsError}</EmptyDescription>
              <Button size="sm" variant="outline" onClick={() => void refreshEvents()}>
                Try again
              </Button>
            </Empty>
          ) : pageItems.length === 0 ? (
            <Empty className="py-16">
              <EmptyMedia variant="default">
                <IconStack>
                  <CalendarBlank weight="duotone" className="size-4" />
                </IconStack>
              </EmptyMedia>
              <EmptyTitle>No events found</EmptyTitle>
              <EmptyDescription>
                Create an event or adjust your filters to see results here.
              </EmptyDescription>
            </Empty>
          ) : (
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 gap-4 md:grid-cols-2'
                  : 'flex flex-col gap-4'
              }
            >
              {pageItems.map((event) => {
                const start = new Date(event.startsAt)
                const timing = timingOf(event)
                const badgeValue = event.status === 'published' ? timing : event.status
                return (
                  <div
                    key={event.id}
                    className={
                      viewMode === 'list'
                        ? 'flex flex-col items-stretch gap-4 rounded-2xl border bg-card p-4 transition hover:bg-accent md:flex-row'
                        : 'flex flex-col gap-4 rounded-2xl border bg-card p-4 transition hover:bg-accent'
                    }
                  >
                    <div
                      className={
                        viewMode === 'list'
                          ? 'relative h-[110px] w-full shrink-0 overflow-hidden rounded-xl bg-muted md:w-[180px]'
                          : 'relative h-[150px] w-full shrink-0 overflow-hidden rounded-xl bg-muted'
                      }
                    >
                      {event.imagePath ? (
                        <img
                          alt={event.title}
                          className="size-full object-cover"
                          src={event.imagePath}
                        />
                      ) : (
                        <div className="grid size-full place-items-center">
                          <CalendarBlank className="size-7 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 gap-4 text-left">
                      <div className="flex h-fit min-w-[56px] shrink-0 flex-col items-center justify-center self-center rounded-xl border bg-muted/50 px-2.5 py-1.5 text-center">
                        <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                          {start.toLocaleString('default', { month: 'short' })}
                        </span>
                        <span className="mt-0.5 text-xl leading-none font-bold text-foreground">
                          {start.getDate()}
                        </span>
                        <span className="mt-1 text-xs font-bold text-muted-foreground uppercase">
                          {start.toLocaleString('default', { weekday: 'short' })}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-[15px] font-semibold text-foreground">
                            {event.title}
                          </h3>
                          <StatusBadge
                            tone={STATUS_TONE[badgeValue] ?? 'neutral'}
                            value={badgeValue}
                          />
                          {event.isRecurring ? (
                            <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                              <Repeat className="size-3" />
                              Repeats
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-muted-foreground">
                          <span>{event.category}</span>
                          <span>{event.eventType}</span>
                        </div>
                        <div className="space-y-1 pt-1.5 text-xs text-muted-foreground">
                          <p className="flex items-center gap-1.5">
                            <CalendarBlank className="size-3.5" />
                            {formatDateTime(event.startsAt)}
                          </p>
                          <p className="flex items-center gap-1.5">
                            <MapPin className="size-3.5" />
                            {event.locationName || event.onlineUrl || 'No location set'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div
                      className={
                        viewMode === 'list'
                          ? 'flex shrink-0 flex-row items-center justify-between border-t pt-3 md:w-40 md:flex-col md:border-t-0 md:border-l md:pt-0 md:pl-4'
                          : 'flex w-full shrink-0 flex-row items-center justify-between border-t pt-3'
                      }
                    >
                      <div className="w-full text-left md:text-center">
                        <span className="block text-xs font-semibold text-muted-foreground">
                          Registrations
                        </span>
                        <span className="mt-0.5 block text-base font-bold text-foreground">
                          {event.registeredCount}
                          {event.capacity ? ` / ${event.capacity}` : ''}
                        </span>
                      </div>
                      <div className="mt-0 flex items-center gap-1.5 md:mt-3">
                        <button
                          aria-label={`Take attendance for ${event.title}`}
                          className="grid size-9 place-items-center rounded-xl border text-muted-foreground transition hover:bg-accent hover:text-foreground"
                          type="button"
                          onClick={() => setAttendanceEvent(event)}
                        >
                          <QrCode className="size-4" />
                        </button>
                        <button
                          aria-label={`Edit ${event.title}`}
                          className="grid size-9 place-items-center rounded-xl border text-muted-foreground transition hover:bg-accent hover:text-foreground"
                          type="button"
                          onClick={() => openEdit(event)}
                        >
                          <PencilSimple className="size-4" />
                        </button>
                        <button
                          aria-label={`Delete ${event.title}`}
                          className="grid size-9 place-items-center rounded-xl border text-destructive transition hover:bg-destructive/10"
                          type="button"
                          onClick={() => setDeleteTarget(event)}
                        >
                          <Trash className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={page <= 1}
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <CaretLeft data-icon="inline-start" />
                  Previous
                </Button>
                <Button
                  disabled={page >= totalPages}
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Next
                  <CaretRight data-icon="inline-end" />
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <CalendarWidget events={events} />

          <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Upcoming Events</h2>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data available</p>
            ) : (
              <div className="flex flex-col gap-3.5">
                {upcomingEvents.map((event) => {
                  const start = new Date(event.startsAt)
                  return (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 border-b pb-3.5 last:border-0 last:pb-0"
                    >
                      <div className="flex min-w-[44px] shrink-0 flex-col items-center justify-center rounded-lg border bg-muted/50 px-2 py-1 text-center">
                        <span className="text-xs font-semibold tracking-wide text-primary uppercase">
                          {start.toLocaleString('default', { month: 'short' })}
                        </span>
                        <span className="mt-0.5 text-sm leading-none font-bold text-foreground">
                          {start.getDate()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {event.title}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-muted-foreground">
                          {start.toLocaleString('default', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-4 rounded-3xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground">Event Summary</h2>
            <div className="grid grid-cols-2 gap-3.5">
              {[
                { label: 'Total Events', count: events.length, icon: CalendarBlank },
                { label: 'Total Registrations', count: totalRegistrations, icon: Users },
                { label: 'Upcoming Events', count: upcomingCount, icon: Clock },
                { label: 'Live This Month', count: liveThisMonthCount, icon: Radio }
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border bg-muted/40 p-4">
                  <div className="flex items-start justify-between">
                    <span className="text-xl font-bold text-foreground">{item.count}</span>
                    <span className="rounded-lg bg-accent p-1.5 text-muted-foreground">
                      <item.icon className="size-4" />
                    </span>
                  </div>
                  <p className="mt-2.5 text-xs font-semibold text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit event' : 'Create event'}</DialogTitle>
            <DialogDescription>Writes directly to your admin backend.</DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto overflow-x-hidden pr-1">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="event-title">Title</FieldLabel>
                <Input
                  id="event-title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="event-description">Description</FieldLabel>
                <Textarea
                  id="event-description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="event-category">Category</FieldLabel>
                  <Input
                    id="event-category"
                    list="event-categories"
                    placeholder="Worship Service"
                    value={form.category}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, category: event.target.value }))
                    }
                  />
                  <datalist id="event-categories">
                    {categories.map((category) => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </Field>
                <Field>
                  <FieldLabel>Format</FieldLabel>
                  <AppSelect
                    className="w-full"
                    value={form.eventType}
                    onValueChange={(value) =>
                      setForm((current) => ({ ...current, eventType: value }))
                    }
                    options={[
                      { value: 'In-Person', label: 'In-Person' },
                      { value: 'Live Stream', label: 'Live Stream' },
                      { value: 'Hybrid', label: 'Hybrid' }
                    ]}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="event-starts">Starts</FieldLabel>
                  <Input
                    id="event-starts"
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, startsAt: event.target.value }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="event-ends">Ends (optional)</FieldLabel>
                  <Input
                    id="event-ends"
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, endsAt: event.target.value }))
                    }
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel>Church Location (optional)</FieldLabel>
                <AppSelect
                  className="w-full"
                  value={form.churchLocationId || 'none'}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      churchLocationId: value === 'none' ? '' : value
                    }))
                  }
                  options={[
                    { value: 'none', label: 'No branch set' },
                    ...locations.map((location) => ({ value: location.id, label: location.name }))
                  ]}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="event-timezone">Timezone</FieldLabel>
                <Input
                  id="event-timezone"
                  value={form.timezone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, timezone: event.target.value }))
                  }
                />
              </Field>

              <LocationField
                address={form.locationAddress}
                lat={form.locationLat}
                lng={form.locationLng}
                locationName={form.locationName}
                searchLocations={searchLocations}
                reverseGeocode={reverseGeocode}
                onAddressChange={(value) =>
                  setForm((current) => ({ ...current, locationAddress: value }))
                }
                onCoordinatesChange={(lat, lng) =>
                  setForm((current) => ({ ...current, locationLat: lat, locationLng: lng }))
                }
                onLocationNameChange={(value) =>
                  setForm((current) => ({ ...current, locationName: value }))
                }
              />

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="event-capacity">Capacity (optional)</FieldLabel>
                  <Input
                    id="event-capacity"
                    min={0}
                    placeholder="Leave blank for unlimited"
                    type="number"
                    value={form.capacity}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, capacity: event.target.value }))
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="event-online-url">Meeting link (optional)</FieldLabel>
                  <Input
                    id="event-online-url"
                    type="url"
                    value={form.onlineUrl}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, onlineUrl: event.target.value }))
                    }
                  />
                </Field>
              </div>

              {creating ? (
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="event-recurring">Recurring event</FieldLabel>
                    <Switch
                      checked={form.isRecurring}
                      id="event-recurring"
                      onCheckedChange={(checked) =>
                        setForm((current) => ({ ...current, isRecurring: checked }))
                      }
                    />
                  </div>
                  {form.isRecurring ? (
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <Field>
                        <FieldLabel>Repeats</FieldLabel>
                        <AppSelect
                          className="w-full"
                          value={form.recurrenceFreq}
                          onValueChange={(value) =>
                            setForm((current) => ({
                              ...current,
                              recurrenceFreq: value as 'weekly' | 'monthly'
                            }))
                          }
                          options={[
                            { value: 'weekly', label: 'Weekly' },
                            { value: 'monthly', label: 'Monthly' }
                          ]}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="event-recurrence-interval">Every</FieldLabel>
                        <Input
                          id="event-recurrence-interval"
                          min={1}
                          type="number"
                          value={form.recurrenceInterval}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              recurrenceInterval: event.target.value
                            }))
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="event-recurrence-until">Until (optional)</FieldLabel>
                        <Input
                          id="event-recurrence-until"
                          type="date"
                          value={form.recurrenceUntil}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              recurrenceUntil: event.target.value
                            }))
                          }
                        />
                      </Field>
                    </div>
                  ) : null}
                </Field>
              ) : null}

              {editing?.recurrenceGroupId ? (
                <Field>
                  <div className="flex items-start gap-2 rounded-xl border bg-accent/40 p-3">
                    <Checkbox
                      checked={form.applyToSeries}
                      id="event-apply-to-series"
                      onCheckedChange={(checked) =>
                        setForm((current) => ({ ...current, applyToSeries: checked === true }))
                      }
                    />
                    <label
                      className="text-sm text-foreground"
                      htmlFor="event-apply-to-series"
                    >
                      Part of a recurring series. Apply these changes to every future occurrence
                      too (dates stay per-occurrence).
                    </label>
                  </div>
                </Field>
              ) : null}

              <Field>
                <FieldLabel>Banner image (optional)</FieldLabel>
                <SingleImageUpload
                  initialImage={
                    editing?.imagePath ? { url: editing.imagePath, name: editing.title } : null
                  }
                  onFileChange={(file) => {
                    setBannerFile(file)
                    setBannerRemoved(!file)
                  }}
                />
              </Field>

              <Field>
                <FieldLabel>Status</FieldLabel>
                <AppSelect
                  className="w-full"
                  value={form.status}
                  onValueChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      status: value as 'draft' | 'published' | 'cancelled'
                    }))
                  }
                  options={[
                    { value: 'draft', label: 'Draft' },
                    { value: 'published', label: 'Published' },
                    { value: 'cancelled', label: 'Cancelled' }
                  ]}
                />
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter className="mt-2 items-center sm:justify-between">
            {editing ? (
              <Button
                className="text-destructive"
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget(editing)}
              >
                <Trash data-icon="inline-start" />
                Delete
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button disabled={savePending} size="sm" onClick={handleSave}>
                {savePending ? (
                  <span className="animate-pulse">Saving…</span>
                ) : editing ? (
                  'Save changes'
                ) : (
                  'Create event'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this event?</DialogTitle>
            <DialogDescription>
              This permanently removes "{deleteTarget?.title}" and its registrations. This
              can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button disabled={deletePending} size="sm" variant="destructive" onClick={handleDelete}>
              {deletePending ? <span className="animate-pulse">Deleting…</span> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {attendanceEvent ? (
        <AttendancePanel
          event={attendanceEvent}
          open={attendanceEvent !== null}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setAttendanceEvent(null)
          }}
        />
      ) : null}
    </PageStack>
  )
}
