import {
  Bell,
  BellSlash,
  BookOpen,
  Broadcast,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  ChatCircleText,
  CircleNotch,
  Devices,
  DotsThreeVertical,
  Envelope,
  Export,
  Funnel,
  GearSix,
  MagnifyingGlass,
  MapPin,
  PencilSimple,
  Phone,
  Plus,
  Trash,
  Users
} from '@phosphor-icons/react'
import { useEffect, useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { PageHeader, PageStack } from '@/components/page'
import { MemberRowSkeleton } from '@/components/skeleton-rows'
import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { AppSelect } from '@/components/ui/app-select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useWorkspaceNav } from '@/components/workspace-nav'
import { useAdminBackendContext } from '@/components/admin-backend-provider'
import type { AdminMember } from '@/lib/backend'

const PAGE_SIZE = 20
type FilterTab = 'all' | 'active' | 'push' | 'recent' | 'inactive'
const FILTER_TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All Members' },
  { id: 'active', label: 'Active' },
  { id: 'push', label: 'Push Enabled' },
  { id: 'recent', label: 'Recently Joined' },
  { id: 'inactive', label: 'Inactive' }
]
// The admin dashboard's "Recently Joined" tab queries the exact same "all"
// status as "All Members" (its own list is already createdAt-desc by
// default) — matched here rather than inventing new filter behavior the
// admin API doesn't actually have.
function queryStatusFor(tab: FilterTab): 'all' | 'active' | 'inactive' | 'push' {
  if (tab === 'active' || tab === 'inactive' || tab === 'push') return tab
  return 'all'
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(new Date(value))
  } catch {
    return value
  }
}

function formatDateTime(value: string | null): string {
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')
}

/** A single info row inside a detail section — label left, value right. */
function InfoRow({
  label,
  value
}: {
  label: ReactElement | string
  value: ReactElement | string
}): ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </div>
  )
}

function DetailSection({
  title,
  action,
  children
}: {
  title: string
  action?: ReactElement
  children: ReactElement | ReactElement[]
}): ReactElement {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-subtle uppercase">{title}</h3>
        {action}
      </div>
      <div className="divide-y">{children}</div>
    </div>
  )
}

const ENGAGEMENT_ROWS = [
  { icon: BookOpen, label: 'Sermons Watched' },
  { icon: Broadcast, label: 'Live Sessions Joined' },
  { icon: CalendarBlank, label: 'Events Registered' },
  { icon: Bell, label: 'Prayer Requests' },
  { icon: ChatCircleText, label: 'Messages Sent' }
] as const

/**
 * The right-to-left sliding member detail panel — same data as the row it
 * was opened from (the admin API's list response already includes each
 * member's devices; there's no separate detail endpoint on the admin side).
 * Field set mirrors the admin dashboard's own Member Panel (Contact/Account
 * Information + Engagement Overview) exactly, including the "Engagement
 * Overview" section — the admin API doesn't track those metrics yet either,
 * so every row there is a "—" placeholder on both sides, kept for parity
 * since the operator specifically wants that future-facing structure in
 * place, not just today's data.
 */
function MemberDetailSheet({
  member,
  onOpenChange,
  onEdit
}: {
  member: AdminMember | null
  onOpenChange: (open: boolean) => void
  onEdit: (member: AdminMember) => void
}): ReactElement {
  return (
    <Sheet open={member !== null} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        {member ? (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3">
                <Avatar size="lg">
                  {member.avatarUrl ? <AvatarImage alt="" src={member.avatarUrl} /> : null}
                  <AvatarFallback>{initials(member.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-1 pt-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <SheetTitle className="truncate text-base">{member.fullName}</SheetTitle>
                    <StatusBadge
                      tone={member.status === 'active' ? 'good' : 'neutral'}
                      value={member.status}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Member since {formatDate(member.createdAt)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" />
                    {member.country ?? 'Unknown location'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-4">
                {(
                  [
                    { icon: ChatCircleText, label: 'Message' },
                    { icon: Phone, label: 'Call' },
                    { icon: Envelope, label: 'Email' },
                    { icon: DotsThreeVertical, label: 'More' }
                  ] as const
                ).map(({ icon: Icon, label }) => (
                  <button
                    key={label}
                    className="flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    type="button"
                    onClick={() => toast('Not wired up yet — coming in a future update.')}
                  >
                    <Icon className="size-4" />
                    <span className="text-xs font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </SheetHeader>

            <SheetBody className="flex flex-col gap-4">
              <DetailSection
                action={
                  <button
                    className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:underline"
                    type="button"
                    onClick={() => onEdit(member)}
                  >
                    <PencilSimple className="size-3" />
                    Edit
                  </button>
                }
                title="Contact Information"
              >
                <InfoRow label="Phone" value={member.phone ?? '—'} />
                <InfoRow label="Email" value={member.email ?? '—'} />
                <InfoRow label="Address" value={member.address ?? '—'} />
              </DetailSection>

              <DetailSection title="Account Information">
                <InfoRow label="User ID" value={member.id.toUpperCase()} />
                <InfoRow label="Role" value="Member" />
                <InfoRow
                  label="Status"
                  value={
                    <StatusBadge
                      tone={member.status === 'active' ? 'good' : 'neutral'}
                      value={member.status}
                    />
                  }
                />
                <InfoRow
                  label="Push Notifications"
                  value={
                    <span className="inline-flex items-center gap-1">
                      {member.notificationEnabled === 1 ? (
                        <Bell className="size-3.5 text-muted-foreground" />
                      ) : (
                        <BellSlash className="size-3.5 text-muted-foreground" />
                      )}
                      {member.notificationEnabled === 1 ? 'Enabled' : 'Disabled'}
                    </span>
                  }
                />
                <InfoRow
                  label="Registered Device"
                  value={
                    member.devices[0]
                      ? `${member.devices[0].platform.toUpperCase()} • v${member.devices[0].appVersion ?? '1.0.0'}`
                      : '—'
                  }
                />
                <InfoRow label="Username" value={member.username ?? '—'} />
                <InfoRow label="Birth Year" value={member.birthYear?.toString() ?? '—'} />
                <InfoRow label="Last Active" value={formatDateTime(member.lastLoginAt)} />
                <InfoRow label="Account Created" value={formatDateTime(member.createdAt)} />
              </DetailSection>

              <DetailSection
                action={
                  <button
                    className="text-xs font-medium text-foreground hover:underline"
                    type="button"
                    onClick={() => toast('Not wired up yet — coming in a future update.')}
                  >
                    View all
                  </button>
                }
                title="Engagement Overview"
              >
                {ENGAGEMENT_ROWS.map(({ icon: Icon, label }) => (
                  <InfoRow
                    key={label}
                    label={
                      <span className="inline-flex items-center gap-2">
                        <Icon className="size-3.5 text-muted-foreground" />
                        {label}
                      </span>
                    }
                    value="—"
                  />
                ))}
              </DetailSection>

              {member.devices.length > 0 ? (
                <DetailSection title={`Devices (${member.devices.length})`}>
                  {member.devices.map((device) => (
                    <div key={device.id} className="flex flex-col gap-1 py-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                        <Devices className="size-3.5 text-muted-foreground" />
                        {device.platform}
                        {device.appVersion ? (
                          <span className="text-xs font-normal text-muted-foreground">
                            v{device.appVersion}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Last seen {formatDateTime(device.lastSeenAt)}
                        {device.notificationPermission ? ` • ${device.notificationPermission}` : ''}
                      </span>
                    </div>
                  ))}
                </DetailSection>
              ) : null}
            </SheetBody>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

type MemberFormState = {
  fullName: string
  phone: string
  email: string
  country: string
  address: string
  locationId: string
  status: 'active' | 'inactive'
  notificationEnabled: boolean
}

const EMPTY_FORM: MemberFormState = {
  fullName: '',
  phone: '',
  email: '',
  country: '',
  address: '',
  locationId: '',
  status: 'active',
  notificationEnabled: false
}

function formFromMember(member: AdminMember): MemberFormState {
  return {
    fullName: member.fullName,
    phone: member.phone ?? '',
    email: member.email ?? '',
    country: member.country ?? '',
    address: member.address ?? '',
    locationId: member.locationId ?? '',
    status: member.status === 'inactive' ? 'inactive' : 'active',
    notificationEnabled: member.notificationEnabled === 1
  }
}

const DEFAULT_MEMBER_PASSWORD = 'password@100'

// Browse archetype (page.tsx): PageHeader over content. Mirrors the admin
// dashboard's Members page (see use-admin-backend) via the same
// /api/admin/members endpoints, including full create/update/delete —
// members added here get the same default password ("password@100") the
// admin dashboard sets, shown once right after creation since it can't be
// recovered afterward.
export function MembersTab(): ReactElement {
  const {
    connection,
    connectionLoading,
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
    locations,
    locationsLoading,
    refreshLocations
  } = useAdminBackendContext()
  const { setActive } = useWorkspaceNav()

  const configured = Boolean(connection?.apiKeyConfigured && connection.baseUrl)

  const [query, setQuery] = useState('')
  const [filterTab, setFilterTab] = useState<FilterTab>('all')
  const [filterCountry, setFilterCountry] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<AdminMember | null>(null)

  const [editing, setEditing] = useState<AdminMember | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<MemberFormState>(EMPTY_FORM)
  const [savePending, setSavePending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminMember | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [issuedPassword, setIssuedPassword] = useState<{ name: string; password: string } | null>(
    null
  )

  const dialogOpen = creating || editing !== null

  useEffect(() => {
    if (!configured) return
    const timer = setTimeout(() => {
      void refreshMembers({
        query: query.trim() || undefined,
        status: queryStatusFor(filterTab),
        country: filterCountry ?? undefined,
        page,
        pageSize: PAGE_SIZE
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [configured, query, filterTab, filterCountry, page, refreshMembers])

  // Filter/search changes should reset back to page 1, not silently query an
  // out-of-range page.
  useEffect(() => {
    setPage(1)
  }, [query, filterTab, filterCountry])

  const handleExport = (): void => {
    setExporting(true)
    void fetchAllMembers({
      query: query.trim() || undefined,
      status: queryStatusFor(filterTab),
      country: filterCountry ?? undefined
    })
      .then((all) => {
        if (all.length === 0) {
          toast.error('No members match the current filters.')
          return
        }
        const header = [
          'Full Name',
          'Phone',
          'Email',
          'Country',
          'Address',
          'Status',
          'Push Enabled',
          'Joined On',
          'Last Active'
        ]
        const escapeCell = (value: string): string =>
          /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
        const rows = all.map((member) =>
          [
            member.fullName,
            member.phone ?? '',
            member.email ?? '',
            member.country ?? '',
            member.address ?? '',
            member.status,
            member.notificationEnabled === 1 ? 'Yes' : 'No',
            member.createdAt,
            member.lastLoginAt ?? ''
          ]
            .map((cell) => escapeCell(String(cell)))
            .join(',')
        )
        const csv = [header.join(','), ...rows].join('\n')
        void window.videorc
          ?.exportTextFile(csv, `members-${new Date().toISOString().slice(0, 10)}.csv`)
          .then((result) => {
            if (result?.saved) {
              toast.success(`Exported ${all.length} member${all.length === 1 ? '' : 's'}.`)
            }
          })
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not export members.')
      )
      .finally(() => setExporting(false))
  }

  const openCreate = (): void => {
    setForm(EMPTY_FORM)
    setCreating(true)
    if (locations.length === 0 && !locationsLoading) void refreshLocations()
  }
  const openEdit = (member: AdminMember): void => {
    setForm(formFromMember(member))
    setEditing(member)
    setSelected(null)
    if (locations.length === 0 && !locationsLoading) void refreshLocations()
  }
  const closeDialog = (): void => {
    setCreating(false)
    setEditing(null)
  }

  const handleSave = (): void => {
    if (!form.fullName.trim()) {
      toast.error('Full name is required.')
      return
    }
    if (!form.phone.trim()) {
      toast.error('Phone is required.')
      return
    }
    const shared = {
      fullName: form.fullName,
      phone: form.phone,
      email: form.email || undefined,
      country: form.country || undefined,
      address: form.address || undefined,
      locationId: form.locationId || undefined,
      status: form.status,
      notificationEnabled: form.notificationEnabled
    }
    setSavePending(true)
    const request = editing ? updateMember(editing.id, shared) : createMember(shared)
    void request
      .then((member) => {
        if (!editing && member.defaultPassword) {
          setIssuedPassword({ name: member.fullName, password: member.defaultPassword })
        } else {
          toast.success(editing ? 'Member updated.' : 'Member added.')
        }
        closeDialog()
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not save this member.')
      )
      .finally(() => setSavePending(false))
  }

  const handleDelete = (): void => {
    if (!deleteTarget) return
    setDeletePending(true)
    void deleteMember(deleteTarget.id)
      .then(() => {
        toast.success('Member deleted.')
        setDeleteTarget(null)
        closeDialog()
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not delete this member.')
      )
      .finally(() => setDeletePending(false))
  }

  if (!connectionLoading && !configured) {
    return (
      <PageStack>
        <PageHeader description="See who's using the app." title="Members" />
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <Users weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>Connect your database first</EmptyTitle>
          <EmptyDescription>
            Members read through your admin backend. Add its base URL and API key in Settings &gt;
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
            New Member
          </Button>
        }
        description="Manage and engage with your ministry members."
        title="Members"
      />

      {membersStats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: 'Total Members', value: membersStats.totalMembers },
            { label: 'Active Members', value: membersStats.activeMembers },
            { label: 'Push Enabled', value: membersStats.pushEnabled },
            { label: 'New This Month', value: membersStats.newThisMonth },
            { label: 'Countries', value: membersStats.countriesCount }
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl border bg-card p-3">
              <p className="text-xs text-muted-foreground uppercase">{stat.label}</p>
              <p className="text-lg font-semibold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search members…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <Funnel data-icon="inline-start" />
              Filters
              {filterCountry ? (
                <Badge className="ml-1 h-4 min-w-4 rounded-full px-1" variant="secondary">
                  1
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64">
            <Field>
              <FieldLabel>Country</FieldLabel>
              <AppSelect
                className="w-full"
                value={filterCountry ?? 'all'}
                onValueChange={(value) => setFilterCountry(value === 'all' ? null : value)}
                options={[
                  { value: 'all', label: 'All countries' },
                  ...(membersStats?.countries ?? []).map((country) => ({
                    value: country,
                    label: country
                  }))
                ]}
              />
            </Field>
            {filterCountry ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFilterCountry(null)
                  setFiltersOpen(false)
                }}
              >
                Clear filter
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>

        <Button
          disabled={!configured || exporting}
          size="sm"
          variant="outline"
          onClick={handleExport}
        >
          {exporting ? (
            <CircleNotch className="animate-spin" data-icon="inline-start" />
          ) : (
            <Export data-icon="inline-start" />
          )}
          Export Members
        </Button>
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

      {membersLoading && members.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }, (_, index) => (
            <MemberRowSkeleton key={index} />
          ))}
        </div>
      ) : membersError ? (
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <Users weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>Could not load members</EmptyTitle>
          <EmptyDescription>{membersError}</EmptyDescription>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshMembers({ page, pageSize: PAGE_SIZE })}
          >
            Try again
          </Button>
        </Empty>
      ) : members.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <Users weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>No members found</EmptyTitle>
          <EmptyDescription>
            {query || filterTab !== 'all'
              ? 'Try a different search or filter.'
              : 'Members who sign up on the app will show up here.'}
          </EmptyDescription>
        </Empty>
      ) : (
        <>
          <div className="hidden items-center gap-4 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:flex">
            <span className="w-10 shrink-0" />
            <span className="flex-[1.4]">Member</span>
            <span className="hidden w-28 shrink-0 md:block">Location</span>
            <span className="hidden w-24 shrink-0 lg:block">Joined</span>
            <span className="hidden w-32 shrink-0 lg:block">Last Active</span>
            <span className="ml-auto">Status</span>
          </div>
          <div className="flex flex-col gap-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex cursor-default items-center gap-4 rounded-2xl border bg-card p-3 transition-colors hover:bg-accent"
                onClick={() => setSelected(member)}
              >
                <Avatar size="lg">
                  {member.avatarUrl ? <AvatarImage alt="" src={member.avatarUrl} /> : null}
                  <AvatarFallback>{initials(member.fullName)}</AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-[1.4] flex-col gap-0.5">
                  <span className="truncate text-base font-medium text-foreground">
                    {member.fullName}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {member.phone ?? '—'} • {member.email ?? '—'}
                  </span>
                </span>
                <span className="hidden w-28 shrink-0 truncate text-sm text-muted-foreground md:block">
                  {member.country ?? '—'}
                </span>
                <span className="hidden w-24 shrink-0 text-sm text-muted-foreground lg:block">
                  {formatDate(member.createdAt)}
                </span>
                <span className="hidden w-32 shrink-0 text-sm text-muted-foreground lg:block">
                  {member.lastLoginAt ? formatDate(member.lastLoginAt) : 'Never'}
                </span>
                {member.devices.length > 0 ? (
                  <Badge className="hidden gap-1 sm:inline-flex" variant="secondary">
                    <Devices className="size-3" />
                    {member.devices.length}
                  </Badge>
                ) : null}
                <StatusBadge
                  tone={member.status === 'active' ? 'good' : 'neutral'}
                  value={member.status}
                />
                <button
                  aria-label={`Edit ${member.fullName}`}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent-pressed hover:text-foreground"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    openEdit(member)
                  }}
                >
                  <DotsThreeVertical className="size-4" weight="bold" />
                </button>
              </div>
            ))}
          </div>

          {membersTotalPages > 1 ? (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Page {membersPage} of {membersTotalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  disabled={membersPage <= 1}
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <CaretLeft data-icon="inline-start" />
                  Previous
                </Button>
                <Button
                  disabled={membersPage >= membersTotalPages}
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((current) => Math.min(membersTotalPages, current + 1))}
                >
                  Next
                  <CaretRight data-icon="inline-end" />
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <MemberDetailSheet
        member={selected}
        onEdit={openEdit}
        onOpenChange={(open) => !open && setSelected(null)}
      />

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit member' : 'New member'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Writes directly to your admin backend.'
                : `A default password (${DEFAULT_MEMBER_PASSWORD}) is set automatically — you'll see it once, right after saving, to pass along.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="member-name">Full name</FieldLabel>
                <Input
                  id="member-name"
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fullName: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="member-phone">Phone</FieldLabel>
                <Input
                  id="member-phone"
                  placeholder="+233 24 000 0000"
                  value={form.phone}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, phone: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="member-email">Email</FieldLabel>
                <Input
                  id="member-email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="member-country">Country</FieldLabel>
                <Input
                  id="member-country"
                  value={form.country}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, country: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Church Location</FieldLabel>
                <AppSelect
                  className="w-full"
                  value={form.locationId || 'none'}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, locationId: value === 'none' ? '' : value }))
                  }
                  options={[
                    { value: 'none', label: 'No location set' },
                    ...locations.map((location) => ({ value: location.id, label: location.name }))
                  ]}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="member-address">Address</FieldLabel>
                <Input
                  id="member-address"
                  value={form.address}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, address: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel>Status</FieldLabel>
                <ToggleGroup
                  type="single"
                  value={form.status}
                  variant="outline"
                  onValueChange={(value) =>
                    value &&
                    setForm((current) => ({ ...current, status: value as 'active' | 'inactive' }))
                  }
                >
                  <ToggleGroupItem value="active">Active</ToggleGroupItem>
                  <ToggleGroupItem value="inactive">Inactive</ToggleGroupItem>
                </ToggleGroup>
              </Field>

              <Field orientation="horizontal">
                <FieldLabel htmlFor="member-notifications">Push notifications</FieldLabel>
                <Switch
                  checked={form.notificationEnabled}
                  id="member-notifications"
                  onCheckedChange={(checked) =>
                    setForm((current) => ({ ...current, notificationEnabled: checked === true }))
                  }
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
                  <CircleNotch className="animate-spin" data-icon="inline-start" />
                ) : null}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this member?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.fullName}” will be removed from your admin backend and can no longer
              sign in. This can&apos;t be undone.
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

      <Dialog
        open={issuedPassword !== null}
        onOpenChange={(open) => !open && setIssuedPassword(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Member added</DialogTitle>
            <DialogDescription>
              {issuedPassword?.name} can sign in with the default password below. This is shown once
              — make sure to tell them to change it after their first sign-in.
            </DialogDescription>
          </DialogHeader>
          <Input
            readOnly
            className="text-center font-mono"
            value={issuedPassword?.password ?? ''}
          />
          <DialogFooter>
            <Button size="sm" onClick={() => setIssuedPassword(null)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageStack>
  )
}
