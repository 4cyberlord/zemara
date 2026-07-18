import { Crown, Plus, ShieldCheck, Trash, UserPlus, Users } from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { PageHeader, PageStack } from '@/components/page'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { AppSelect } from '@/components/ui/app-select'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { IconStack } from '@/components/ui/icon-stack'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { TeamUser } from '@/lib/backend'

// Fixed set — matches ROLE_PERMISSIONS in prophet-roja-admin/src/lib/admin.ts.
// "API Client" (machine sessions) is deliberately excluded — this UI is for
// inviting people, not minting service accounts.
const ROLE_VALUES = [
  'Owner',
  'Administrator',
  'Media Operator',
  'Content Manager',
  'Live Host',
  'Moderator',
  'Read-only'
] as const

type Role = (typeof ROLE_VALUES)[number]
type FilterTab = 'All' | Role

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function formatDate(value: string | null): string {
  if (!value) return 'Not yet active'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function InviteDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const { createTeamUser } = useAdminBackendContext()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Read-only')
  const [saving, setSaving] = useState(false)

  const handleSubmit = (): void => {
    if (!name.trim() || !email.trim()) {
      toast.error('Name and email are required.')
      return
    }
    setSaving(true)
    createTeamUser({ name: name.trim(), email: email.trim(), role })
      .then(() => {
        toast.success(`Invited ${name.trim()}.`)
        setName('')
        setEmail('')
        setRole('Read-only')
        onOpenChange(false)
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not invite this person.'))
      .finally(() => setSaving(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite staff member</DialogTitle>
          <DialogDescription>
            They&apos;ll set their own password the first time they sign in with this email.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="staff-name">Name</FieldLabel>
            <Input id="staff-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="staff-email">Email</FieldLabel>
            <Input
              id="staff-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Role</FieldLabel>
            <AppSelect
              className="w-full"
              value={role}
              onValueChange={(value) => setRole(value as Role)}
              options={ROLE_VALUES.map((value) => ({ value, label: value }))}
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={handleSubmit}>
            {saving ? 'Inviting…' : 'Invite'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StaffRowActions({ user }: { user: TeamUser }): ReactElement {
  const { updateTeamUser, deleteTeamUser } = useAdminBackendContext()
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const handleChangeRole = (role: Role): void => {
    if (role === user.role) return
    updateTeamUser(user.id, { role }).catch((error: unknown) =>
      toast.error(error instanceof Error ? error.message : "Could not change this person's role.")
    )
  }

  const handleRemove = (): void => {
    deleteTeamUser(user.id)
      .then(() => toast.success(`Removed ${user.name}.`))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not remove this person.'))
  }

  return (
    <DropdownMenu onOpenChange={(open) => !open && setConfirmingRemove(false)}>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Actions for ${user.name}`}>
          <span className="text-lg leading-none">⋮</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Change role</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {ROLE_VALUES.map((value) => (
              <DropdownMenuItem key={value} onClick={() => handleChangeRole(value)}>
                {value === user.role ? <strong>{value}</strong> : value}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        {confirmingRemove ? (
          <DropdownMenuItem variant="destructive" onClick={handleRemove}>
            <Trash />
            Confirm remove
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            variant="destructive"
            onSelect={(event) => {
              event.preventDefault()
              setConfirmingRemove(true)
            }}
          >
            <Trash />
            Remove access
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StaffAccessTab(): ReactElement {
  const { teamUsers, teamUsersLoading, teamUsersError, refreshTeamUsers } = useAdminBackendContext()
  const [filterTab, setFilterTab] = useState<FilterTab>('All')
  const [query, setQuery] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => {
    if (teamUsers.length === 0 && !teamUsersLoading) void refreshTeamUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    let list = teamUsers
    if (filterTab !== 'All') list = list.filter((user) => user.role === filterTab)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(
        (user) => user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)
      )
    }
    return list
  }, [teamUsers, filterTab, query])

  const activeCount = teamUsers.filter((user) => user.status === 'active').length
  const ownerCount = teamUsers.filter((user) => user.role === 'Owner').length

  return (
    <PageStack>
      <PageHeader
        title="Staff & Access"
        description="People who can manage your church platform."
        action={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" />
            Invite Staff Member
          </Button>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Users className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{teamUsers.length}</p>
            <p className="text-sm text-muted-foreground">Staff Members</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <ShieldCheck className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{activeCount}</p>
            <p className="text-sm text-muted-foreground">Active</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-2xl border bg-card p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Crown className="size-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{ownerCount}</p>
            <p className="text-sm text-muted-foreground">Owners</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filterTab} onValueChange={(value) => setFilterTab(value as FilterTab)}>
          <TabsList>
            <TabsTrigger value="All">All</TabsTrigger>
            {ROLE_VALUES.map((value) => (
              <TabsTrigger key={value} value={value}>
                {value}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Input
          className="w-56"
          placeholder="Search staff members…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {teamUsersLoading && teamUsers.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : teamUsersError ? (
        <p className="py-16 text-center text-sm text-destructive">{teamUsersError}</p>
      ) : filtered.length === 0 ? (
        <Empty>
          <EmptyMedia variant="default">
            <IconStack>
              <Users weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>No staff members found</EmptyTitle>
          <EmptyDescription>
            Invite owners, admins, and operators to manage the platform alongside you.
          </EmptyDescription>
          <Button className="mt-2" onClick={() => setInviteOpen(true)}>
            <Plus className="size-4" />
            Invite Staff Member
          </Button>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((user) => (
            <div key={user.id} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
              <Avatar size="sm">
                <AvatarFallback>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Badge variant="secondary">{user.role}</Badge>
              <span className="flex w-20 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span
                  className={`size-1.5 rounded-full ${user.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
                />
                {user.status === 'active' ? 'Active' : 'Inactive'}
              </span>
              <span className="hidden w-32 text-xs text-muted-foreground sm:block">
                Last active {formatDate(user.lastLoginAt)}
              </span>
              <StaffRowActions user={user} />
            </div>
          ))}
        </div>
      )}

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </PageStack>
  )
}
