import {
  Bell,
  BellRinging,
  CalendarBlank,
  CheckCircle,
  CircleNotch,
  Clock,
  DeviceMobile,
  GearSix,
  Lightning,
  MagnifyingGlass,
  Megaphone,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Trash
} from '@phosphor-icons/react'
import { useEffect, useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { PageHeader, PageStack } from '@/components/page'
import { CampaignRowSkeleton } from '@/components/skeleton-rows'
import { StatusBadge, type StatusTone } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { IconStack } from '@/components/ui/icon-stack'
import { Input } from '@/components/ui/input'
import { AppSelect } from '@/components/ui/app-select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useWorkspaceNav } from '@/components/workspace-nav'
import { useAdminBackendContext } from '@/components/admin-backend-provider'
import type { NotificationCampaign } from '@/lib/backend'

const PAGE_SIZE = 5
type FilterTab = 'all' | 'sent' | 'scheduled' | 'draft'
const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All Campaigns' },
  { id: 'sent', label: 'Sent' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'draft', label: 'Drafts' }
]

const TARGET_OPTIONS = [
  { value: 'all members', label: 'All members' },
  { value: 'ios', label: 'iOS devices only' },
  { value: 'android', label: 'Android devices only' },
  { value: 'notification-enabled', label: 'Push enabled members' }
]

const STATUS_TONE: Record<string, StatusTone> = {
  sent: 'good',
  scheduled: 'warn',
  draft: 'neutral'
}

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  sent: CheckCircle,
  scheduled: Clock,
  draft: PencilSimple
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value))
  } catch {
    return value
  }
}

/** "2026-07-16T09:30" (datetime-local's own format) <-> ISO round trip. */
function toIsoFromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

type CampaignFormState = {
  title: string
  body: string
  target: string
  scheduleMode: 'immediate' | 'scheduled'
  scheduledAt: string
  showInApp: boolean
  sendPush: boolean
  imagePath: string
}

const EMPTY_FORM: CampaignFormState = {
  title: '',
  body: '',
  target: 'all members',
  scheduleMode: 'immediate',
  scheduledAt: '',
  showInApp: true,
  sendPush: true,
  imagePath: ''
}

type EditFormState = { title: string; body: string; target: string }

function editFormFromCampaign(campaign: NotificationCampaign): EditFormState {
  return { title: campaign.title, body: campaign.body, target: campaign.target }
}

/**
 * Live lock-screen mockup — pixel-for-pixel port of the admin dashboard's
 * "Live Device Mockup Preview" panel (notifications-client.tsx): same iPhone
 * frame proportions (340 / 0.4614), same titanium-bezel/dynamic-island/
 * status-bar/home-indicator markup, same background photo and raw Tailwind
 * colors on the phone screen itself. Only the outer card plate uses this
 * app's own bg-card/border/foreground tokens, so it follows the system
 * light/dark theme like every other card in Zemara — the phone's screen
 * contents stay fixed, same as a real phone's UI doesn't reflow when the
 * app around it changes theme.
 */
function DevicePreview({ title, body }: { title: string; body: string }): ReactElement {
  return (
    <div className="flex select-none flex-col items-center rounded-3xl border bg-card p-6 text-foreground shadow-sm">
      <div className="mb-6 flex w-full items-center gap-2 border-b pb-3">
        <DeviceMobile className="size-4 text-[#05a9bd]" />
        <h3 className="text-sm font-black tracking-wider text-muted-foreground uppercase">
          Live Device Mockup Preview
        </h3>
      </div>

      {/* Realistic iPhone 17 Pro Max frame */}
      <div className="relative mx-auto" style={{ width: 340, height: 340 / 0.4614 }}>
        {/* Titanium bezel */}
        <div className="absolute inset-0 rounded-[62px] bg-gradient-to-b from-slate-800 to-slate-900 shadow-[0_30px_60px_rgba(15,23,42,0.35)]" />
        {/* Side button (right) */}
        <div className="absolute top-[150px] -right-[3px] h-16 w-[3px] rounded-r-sm bg-slate-700" />
        {/* Volume buttons (left) */}
        <div className="absolute top-[130px] -left-[3px] h-8 w-[3px] rounded-l-sm bg-slate-700" />
        <div className="absolute top-[170px] -left-[3px] h-16 w-[3px] rounded-l-sm bg-slate-700" />
        {/* Mute switch (left) */}
        <div className="absolute top-[100px] -left-[3px] h-6 w-[3px] rounded-l-sm bg-slate-700" />

        {/* Screen */}
        <div className="absolute inset-[12px] overflow-hidden rounded-[50px] bg-white">
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1663630487263-1f6b2790e0f0?auto=format&fit=crop&w=900&q=80')] bg-cover bg-center" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-white/35 to-[#eaf7fc]/85" />

          {/* Dynamic Island */}
          <div className="absolute top-3.5 left-1/2 z-10 h-[34px] w-[110px] -translate-x-1/2 rounded-full bg-black" />

          {/* Status bar */}
          <div className="absolute top-4 left-7 z-10 text-sm font-black text-slate-950/80">
            9:41
          </div>
          <div className="absolute top-4 right-7 z-10 flex items-center gap-1.5 text-slate-950/80">
            <svg className="h-3 w-4 fill-current" viewBox="0 0 24 24">
              <rect x="2" y="16" width="3" height="4" rx="0.5" />
              <rect x="7" y="12" width="3" height="8" rx="0.5" />
              <rect x="12" y="8" width="3" height="12" rx="0.5" />
              <rect x="17" y="3" width="3" height="17" rx="0.5" />
            </svg>
            <svg className="size-3 fill-current" viewBox="0 0 24 24">
              <path d="M12 21a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
              <path
                clipRule="evenodd"
                d="M4.828 12a10 10 0 0 1 14.344 0l-1.414 1.414a8 8 0 0 0-11.516 0L4.828 12Z"
                fillRule="evenodd"
              />
              <path
                clipRule="evenodd"
                d="M1.999 9.172a14 14 0 0 1 20 0l-1.414 1.414a12 12 0 0 0-17.172 0L1.999 9.172Z"
                fillRule="evenodd"
              />
            </svg>
            <div className="relative flex h-3 w-6 items-center rounded-[3px] border border-slate-950/80 p-[1px]">
              <div className="h-full w-[80%] rounded-[1.5px] bg-slate-950/85" />
              <div className="absolute top-1/2 -right-[2px] h-[4px] w-[1px] -translate-y-1/2 rounded-r-[0.5px] bg-slate-950/80" />
            </div>
          </div>

          {/* Notification alert bubble */}
          <div className="absolute inset-x-3 top-20 z-10 rounded-2xl border border-white/70 bg-white/90 p-3.5 text-left text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur">
            <div className="flex items-center justify-between text-sm font-bold tracking-wider text-slate-500 uppercase">
              <span className="flex items-center gap-1">
                <Bell className="size-3 text-[#05a9bd]" />
                Roja City
              </span>
              <span>now</span>
            </div>
            <p className="mt-1.5 truncate text-sm leading-tight font-black text-slate-950">
              {title || 'Enter Campaign Title...'}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm leading-normal font-semibold text-slate-700">
              {body || 'Type the message body in the form below to preview here...'}
            </p>
          </div>

          {/* Home indicator */}
          <div className="absolute bottom-2 left-1/2 z-10 h-[5px] w-[120px] -translate-x-1/2 rounded-full bg-slate-950/70" />
        </div>
      </div>
    </div>
  )
}

// Browse archetype (page.tsx): PageHeader over content, same shape as
// MembersTab. Mirrors the admin dashboard's Alerts page (see
// notifications-client.tsx) via the same /api/notifications endpoints —
// stats, live device preview, search + 4-tab filtered queue, create/edit/
// delete, and send-now for scheduled/draft campaigns.
export function AlertsTab(): ReactElement {
  const {
    connection,
    connectionLoading,
    campaigns,
    campaignsLoading,
    campaignsError,
    refreshCampaigns,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    sendCampaignNow
  } = useAdminBackendContext()
  const { setActive } = useWorkspaceNav()

  const configured = Boolean(connection?.apiKeyConfigured && connection.baseUrl)

  const [query, setQuery] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [page, setPage] = useState(1)

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<CampaignFormState>(EMPTY_FORM)
  const [savePending, setSavePending] = useState(false)

  const [editing, setEditing] = useState<NotificationCampaign | null>(null)
  const [editForm, setEditForm] = useState<EditFormState>({ title: '', body: '', target: '' })
  const [editPending, setEditPending] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<NotificationCampaign | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) return
    void refreshCampaigns()
  }, [configured, refreshCampaigns])

  useEffect(() => {
    setPage(1)
  }, [query, filterTab])

  const filtered = campaigns.filter((campaign) => {
    const matchesQuery =
      campaign.title.toLowerCase().includes(query.toLowerCase()) ||
      campaign.body.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filterTab === 'all' || campaign.status.toLowerCase() === filterTab
    return matchesQuery && matchesFilter
  })
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const startIndex = (page - 1) * PAGE_SIZE
  const pageItems = filtered.slice(startIndex, startIndex + PAGE_SIZE)

  const sentCampaigns = campaigns.filter((c) => c.status === 'sent')
  const scheduledCampaigns = campaigns.filter((c) => c.status === 'scheduled')
  const totalSent = campaigns.reduce((sum, c) => sum + c.sentCount, 0)
  const totalOpened = campaigns.reduce((sum, c) => sum + c.openedCount, 0)
  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0

  const openCreate = (): void => {
    setForm(EMPTY_FORM)
    setCreating(true)
  }
  const closeCreate = (): void => setCreating(false)

  const openEdit = (campaign: NotificationCampaign): void => {
    setEditForm(editFormFromCampaign(campaign))
    setEditing(campaign)
  }
  const closeEdit = (): void => setEditing(null)

  const handleCreate = (): void => {
    if (!form.title.trim()) {
      toast.error('Title is required.')
      return
    }
    if (!form.body.trim()) {
      toast.error('Message body is required.')
      return
    }
    if (!form.showInApp && !form.sendPush) {
      toast.error('Pick at least one delivery channel — in-app, push, or both.')
      return
    }
    if (form.scheduleMode === 'scheduled' && !form.scheduledAt) {
      toast.error('Pick a date and time to schedule for.')
      return
    }
    setSavePending(true)
    void createCampaign({
      title: form.title,
      body: form.body,
      target: form.target,
      scheduledAt:
        form.scheduleMode === 'scheduled' ? toIsoFromLocalInput(form.scheduledAt) : undefined,
      showInApp: form.showInApp,
      sendPush: form.sendPush,
      imagePath: form.imagePath || undefined
    })
      .then((campaign) => {
        if (campaign.status === 'scheduled') {
          toast.success(`Scheduled "${campaign.title}".`)
        } else if (form.sendPush) {
          toast.success(
            `Sent "${campaign.title}" to ${campaign.sentCount} device${campaign.sentCount === 1 ? '' : 's'}.`
          )
        } else {
          toast.success(`Published "${campaign.title}" in the app.`)
        }
        closeCreate()
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not save this campaign.')
      )
      .finally(() => setSavePending(false))
  }

  const handleEditSave = (): void => {
    if (!editing) return
    setEditPending(true)
    void updateCampaign(editing.id, editForm)
      .then((campaign) => {
        toast.success(`Updated "${campaign.title}".`)
        closeEdit()
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not update this campaign.')
      )
      .finally(() => setEditPending(false))
  }

  const handleDelete = (): void => {
    if (!deleteTarget) return
    setDeletePending(true)
    void deleteCampaign(deleteTarget.id)
      .then(() => {
        toast.success(`Deleted "${deleteTarget.title}".`)
        setDeleteTarget(null)
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not delete this campaign.')
      )
      .finally(() => setDeletePending(false))
  }

  const handleSendNow = (campaign: NotificationCampaign): void => {
    setSendingId(campaign.id)
    void sendCampaignNow(campaign.id)
      .then((sent) => {
        toast.success(
          `Sent "${sent.title}" to ${sent.sentCount} device${sent.sentCount === 1 ? '' : 's'}.`
        )
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not send this campaign.')
      )
      .finally(() => setSendingId(null))
  }

  if (!connectionLoading && !configured) {
    return (
      <PageStack>
        <PageHeader description="Send updates and reminders to your members." title="Alerts" />
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <Bell weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>Connect your database first</EmptyTitle>
          <EmptyDescription>
            Alerts read through your admin backend. Add its base URL and API key in Settings &gt;
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
            Create Campaign
          </Button>
        }
        description="Send updates and reminders to your members."
        title="Alerts"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Campaigns', value: campaigns.length },
          { label: 'Sent', value: sentCampaigns.length },
          { label: 'Scheduled', value: scheduledCampaigns.length },
          { label: 'Open Rate', value: `${openRate}%` }
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border bg-card p-3">
            <p className="text-xs text-muted-foreground uppercase">{stat.label}</p>
            <p className="text-lg font-semibold text-foreground">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <DevicePreview body={form.body} title={form.title} />
        </div>

        <div className="flex flex-col gap-4 xl:col-span-7">
          <div className="relative">
            <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search campaigns…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <Tabs value={filterTab} onValueChange={(value) => setFilterTab(value as FilterTab)}>
            <TabsList className="w-full justify-start border-b" variant="line">
              {FILTER_TABS.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {campaignsLoading && campaigns.length === 0 ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <CampaignRowSkeleton key={index} />
              ))}
            </div>
          ) : campaignsError ? (
            <Empty className="py-16">
              <EmptyMedia variant="default">
                <IconStack>
                  <Bell weight="duotone" className="size-4" />
                </IconStack>
              </EmptyMedia>
              <EmptyTitle>Could not load campaigns</EmptyTitle>
              <EmptyDescription>{campaignsError}</EmptyDescription>
              <Button size="sm" variant="outline" onClick={() => void refreshCampaigns()}>
                Try again
              </Button>
            </Empty>
          ) : pageItems.length === 0 ? (
            <Empty className="py-16">
              <EmptyMedia variant="default">
                <IconStack>
                  <Bell weight="duotone" className="size-4" />
                </IconStack>
              </EmptyMedia>
              <EmptyTitle>No campaigns found</EmptyTitle>
              <EmptyDescription>
                {query || filterTab !== 'all'
                  ? 'Try a different search or filter.'
                  : 'Campaigns you create or schedule will show up here.'}
              </EmptyDescription>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2">
              {pageItems.map((campaign) => {
                const isSent = campaign.status === 'sent'
                const isScheduled = campaign.status === 'scheduled'
                const StatusIcon = STATUS_ICON[campaign.status] ?? PencilSimple
                const rowOpenRate =
                  campaign.sentCount > 0
                    ? Math.round((campaign.openedCount / campaign.sentCount) * 100)
                    : 0
                return (
                  <div
                    key={campaign.id}
                    className="flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {campaign.title}
                        </h3>
                        <StatusBadge
                          icon={StatusIcon}
                          tone={STATUS_TONE[campaign.status] ?? 'neutral'}
                          value={campaign.status}
                        />
                        {campaign.showInApp ? (
                          <Badge className="gap-1" variant="secondary">
                            <Megaphone className="size-3" />
                            In-App
                          </Badge>
                        ) : null}
                        {campaign.sendPush ? (
                          <Badge className="gap-1" variant="secondary">
                            <BellRinging className="size-3" />
                            Push
                          </Badge>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{campaign.body}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="rounded-md bg-accent px-2 py-0.5 font-medium uppercase">
                          {campaign.target}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CalendarBlank className="size-3.5" />
                          {formatDate(campaign.scheduledAt ?? campaign.createdAt)}
                        </span>
                      </div>
                    </div>

                    {isSent ? (
                      <div className="flex shrink-0 items-center gap-4 border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Sent</p>
                          <p className="text-sm font-semibold text-foreground">
                            {campaign.sentCount}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Opened</p>
                          <p className="text-sm font-semibold text-foreground">
                            {campaign.openedCount}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">Open Rate</p>
                          <p className="text-sm font-semibold text-foreground">{rowOpenRate}%</p>
                        </div>
                      </div>
                    ) : null}

                    {isScheduled ? (
                      <div className="shrink-0 border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-4">
                        <p className="text-xs text-muted-foreground uppercase">Scheduled for</p>
                        <p className="text-sm font-semibold text-foreground">
                          {formatDate(campaign.scheduledAt)}
                        </p>
                      </div>
                    ) : null}

                    <div className="flex shrink-0 items-center gap-1 border-t pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-3">
                      {!isSent ? (
                        <button
                          aria-label={`Send ${campaign.title} now`}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent-pressed hover:text-foreground disabled:opacity-50"
                          disabled={sendingId === campaign.id}
                          type="button"
                          onClick={() => handleSendNow(campaign)}
                        >
                          {sendingId === campaign.id ? (
                            <CircleNotch className="size-4 animate-spin" />
                          ) : (
                            <Lightning className="size-4" />
                          )}
                        </button>
                      ) : null}
                      {!isSent ? (
                        <button
                          aria-label={`Edit ${campaign.title}`}
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent-pressed hover:text-foreground"
                          type="button"
                          onClick={() => openEdit(campaign)}
                        >
                          <PencilSimple className="size-4" />
                        </button>
                      ) : null}
                      <button
                        aria-label={`Delete ${campaign.title}`}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        type="button"
                        onClick={() => setDeleteTarget(campaign)}
                      >
                        <Trash className="size-4" />
                      </button>
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
                  Previous
                </Button>
                <Button
                  disabled={page >= totalPages}
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={creating} onOpenChange={(open) => !open && closeCreate()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Campaign</DialogTitle>
            <DialogDescription>Send instant updates and reminders.</DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
            <FieldGroup>
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="campaign-title">Notification Title</FieldLabel>
                  <span className="text-xs text-muted-foreground">{form.title.length} / 50</span>
                </div>
                <Input
                  id="campaign-title"
                  maxLength={50}
                  placeholder="e.g. We are Live! Join now"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="campaign-body">Message Body</FieldLabel>
                  <span className="text-xs text-muted-foreground">{form.body.length} / 150</span>
                </div>
                <Textarea
                  id="campaign-body"
                  maxLength={150}
                  placeholder="e.g. Join us for an impactful session of prayer, prophecy and miracles starting right now!"
                  value={form.body}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, body: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Target Audience</FieldLabel>
                <AppSelect
                  className="w-full"
                  value={form.target}
                  onValueChange={(value) => setForm((current) => ({ ...current, target: value }))}
                  options={TARGET_OPTIONS}
                />
              </Field>

              <Field>
                <FieldLabel>Delivery Schedule</FieldLabel>
                <ToggleGroup
                  className="grid grid-cols-2"
                  type="single"
                  value={form.scheduleMode}
                  variant="outline"
                  onValueChange={(value) =>
                    value &&
                    setForm((current) => ({
                      ...current,
                      scheduleMode: value as 'immediate' | 'scheduled'
                    }))
                  }
                >
                  <ToggleGroupItem value="immediate">
                    <PaperPlaneTilt data-icon="inline-start" />
                    Send Immediately
                  </ToggleGroupItem>
                  <ToggleGroupItem value="scheduled">
                    <CalendarBlank data-icon="inline-start" />
                    Schedule for Later
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>

              {form.scheduleMode === 'scheduled' ? (
                <Field>
                  <FieldLabel htmlFor="campaign-scheduled-at">Scheduled Date / Time</FieldLabel>
                  <Input
                    id="campaign-scheduled-at"
                    type="datetime-local"
                    value={form.scheduledAt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, scheduledAt: event.target.value }))
                    }
                  />
                </Field>
              ) : null}

              <Field>
                <FieldLabel>Delivery Channels</FieldLabel>
                <ToggleGroup
                  className="grid grid-cols-2"
                  type="multiple"
                  value={[
                    ...(form.showInApp ? ['showInApp'] : []),
                    ...(form.sendPush ? ['sendPush'] : [])
                  ]}
                  variant="outline"
                  onValueChange={(values) =>
                    setForm((current) => ({
                      ...current,
                      showInApp: values.includes('showInApp'),
                      sendPush: values.includes('sendPush')
                    }))
                  }
                >
                  <ToggleGroupItem value="showInApp">
                    <Megaphone data-icon="inline-start" />
                    Show in App
                  </ToggleGroupItem>
                  <ToggleGroupItem value="sendPush">
                    <BellRinging data-icon="inline-start" />
                    Send as Push
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground">
                  In-app keeps it visible in the app&apos;s Notifications screen. Push delivers to
                  the lock screen, even if the app is closed. Pick either or both.
                </p>
              </Field>

              <Field>
                <FieldLabel htmlFor="campaign-image">Image (optional)</FieldLabel>
                <Input
                  id="campaign-image"
                  placeholder="Optional — paste an uploaded image path or URL"
                  value={form.imagePath}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, imagePath: event.target.value }))
                  }
                />
              </Field>
            </FieldGroup>
          </div>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={closeCreate}>
              Cancel
            </Button>
            <Button
              disabled={savePending || (!form.showInApp && !form.sendPush)}
              size="sm"
              onClick={handleCreate}
            >
              {savePending ? (
                <CircleNotch className="animate-spin" data-icon="inline-start" />
              ) : null}
              {form.scheduleMode === 'scheduled' ? 'Schedule Campaign' : 'Publish Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit campaign</DialogTitle>
            <DialogDescription>Writes directly to your admin backend.</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-campaign-title">Title</FieldLabel>
              <Input
                id="edit-campaign-title"
                value={editForm.title}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-campaign-body">Message</FieldLabel>
              <Textarea
                id="edit-campaign-body"
                value={editForm.body}
                onChange={(event) =>
                  setEditForm((current) => ({ ...current, body: event.target.value }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>Target Audience</FieldLabel>
              <AppSelect
                className="w-full"
                value={editForm.target}
                onValueChange={(value) => setEditForm((current) => ({ ...current, target: value }))}
                options={TARGET_OPTIONS}
              />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={closeEdit}>
              Cancel
            </Button>
            <Button disabled={editPending} size="sm" onClick={handleEditSave}>
              {editPending ? (
                <CircleNotch className="animate-spin" data-icon="inline-start" />
              ) : null}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this campaign?</DialogTitle>
            <DialogDescription>
              This permanently removes “{deleteTarget?.title}” from the campaign queue.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button disabled={deletePending} size="sm" variant="destructive" onClick={handleDelete}>
              {deletePending ? (
                <CircleNotch className="animate-spin" data-icon="inline-start" />
              ) : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageStack>
  )
}
