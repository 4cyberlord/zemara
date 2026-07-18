import {
  Archive,
  Buildings,
  CaretRight,
  Crown,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  TreeStructure,
  UserPlus,
  Users,
  X
} from '@phosphor-icons/react'
import { useEffect, useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { PageHeader, PageStack } from '@/components/page'
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
import { AppSelect } from '@/components/ui/app-select'
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import type { AdminMember, OrganizationalUnit, OrganizationalUnitType } from '@/lib/backend'
import { cn } from '@/lib/utils'

const UNIT_TYPE_LABELS: Record<OrganizationalUnitType, string> = {
  department: 'Department',
  ministry: 'Ministry',
  team: 'Team',
  committee: 'Committee',
  choir: 'Choir',
  small_group: 'Small Group',
  class: 'Class',
  cell_group: 'Cell Group',
  fellowship: 'Fellowship',
  council: 'Council',
  club: 'Club'
}

const UNIT_TYPES = Object.keys(UNIT_TYPE_LABELS) as OrganizationalUnitType[]

function unitTypeLabel(type: string): string {
  return UNIT_TYPE_LABELS[type as OrganizationalUnitType] ?? type
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

type UnitFormState = { name: string; type: OrganizationalUnitType; description: string; parentUnitId: string }
const EMPTY_FORM: UnitFormState = { name: '', type: 'department', description: '', parentUnitId: '' }

// Inline member-search picker, shared shape with the Attendance panel's
// manual-mark search — type-ahead by name, click a result to select it.
function MemberSearchPicker({
  members,
  excludeIds,
  onPick
}: {
  members: AdminMember[]
  excludeIds: Set<string>
  onPick: (member: AdminMember) => void
}): ReactElement {
  const [query, setQuery] = useState('')
  const results =
    query.trim().length >= 2
      ? members
          .filter((member) => !excludeIds.has(member.id))
          .filter((member) => member.fullName.toLowerCase().includes(query.trim().toLowerCase()))
          .slice(0, 8)
      : []

  return (
    <div className="space-y-2">
      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search a member by name…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {results.length > 0 ? (
        <div className="overflow-hidden rounded-lg border bg-popover">
          {results.map((member) => (
            <button
              key={member.id}
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => {
                onPick(member)
                setQuery('')
              }}
            >
              <Avatar size="sm">
                <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                <AvatarFallback>{initials(member.fullName)}</AvatarFallback>
              </Avatar>
              {member.fullName}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function UnitDetailSheet({
  unitId,
  onOpenChange
}: {
  unitId: string | null
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const {
    members,
    membersLoading,
    refreshMembers,
    getUnit,
    addUnitMember,
    removeUnitMember,
    createUnitPosition,
    deleteUnitPosition,
    assignUnitPosition,
    endUnitPositionAssignment
  } = useAdminBackendContext()

  const [detail, setDetail] = useState<OrganizationalUnit | null>(null)
  const [loading, setLoading] = useState(true)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [addPositionOpen, setAddPositionOpen] = useState(false)
  const [newPositionName, setNewPositionName] = useState('')
  const [assigningPositionId, setAssigningPositionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = (): void => {
    if (!unitId) return
    setLoading(true)
    getUnit(unitId)
      .then(setDetail)
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not load this unit.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (!unitId) return
    refresh()
    if (members.length === 0 && !membersLoading) void refreshMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId])

  const handleAddMember = (member: AdminMember): void => {
    if (!unitId) return
    setBusy(true)
    addUnitMember(unitId, member.id)
      .then(() => {
        toast.success(`Added ${member.fullName}.`)
        setAddMemberOpen(false)
        refresh()
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not add this member.'))
      .finally(() => setBusy(false))
  }

  const handleRemoveMember = (membershipId: string): void => {
    if (!unitId) return
    removeUnitMember(unitId, membershipId)
      .then(() => refresh())
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not remove this member.'))
  }

  const handleCreatePosition = (): void => {
    if (!unitId || !newPositionName.trim()) return
    setBusy(true)
    createUnitPosition(unitId, { name: newPositionName.trim() })
      .then(() => {
        setNewPositionName('')
        setAddPositionOpen(false)
        refresh()
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not create this position.'))
      .finally(() => setBusy(false))
  }

  const handleDeletePosition = (positionId: string): void => {
    if (!unitId) return
    deleteUnitPosition(unitId, positionId)
      .then(() => refresh())
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not delete this position.'))
  }

  const handleAssign = (positionId: string, member: AdminMember): void => {
    if (!unitId) return
    setBusy(true)
    assignUnitPosition(unitId, positionId, member.id)
      .then(() => {
        toast.success(`${member.fullName} assigned.`)
        setAssigningPositionId(null)
        refresh()
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not assign this position.'))
      .finally(() => setBusy(false))
  }

  const handleEndTerm = (positionId: string, assignmentId: string): void => {
    if (!unitId) return
    endUnitPositionAssignment(unitId, positionId, assignmentId)
      .then(() => refresh())
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not end this term.'))
  }

  const memberIds = new Set((detail?.memberships ?? []).map((membership) => membership.memberId))

  return (
    <Sheet open={unitId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg">
        {loading || !detail ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-base">
                {detail.name}
                <Badge variant="secondary">{unitTypeLabel(detail.type)}</Badge>
              </SheetTitle>
              {detail.parentUnit ? (
                <p className="text-xs text-muted-foreground">Part of {detail.parentUnit.name}</p>
              ) : null}
              {detail.description ? (
                <p className="text-sm text-muted-foreground">{detail.description}</p>
              ) : null}
            </SheetHeader>

            <SheetBody className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Crown className="size-4" />
                    Leadership
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAddPositionOpen((current) => !current)}
                  >
                    <Plus className="size-4" />
                    Add position
                  </Button>
                </div>

                {addPositionOpen ? (
                  <div className="flex items-center gap-2 rounded-xl border bg-accent/40 p-2">
                    <Input
                      className="h-8"
                      placeholder="e.g. Choir Director"
                      value={newPositionName}
                      onChange={(event) => setNewPositionName(event.target.value)}
                    />
                    <Button size="sm" disabled={busy || !newPositionName.trim()} onClick={handleCreatePosition}>
                      Add
                    </Button>
                  </div>
                ) : null}

                {(detail.positions ?? []).length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">No positions yet.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {(detail.positions ?? []).map((position) => {
                      const holder = position.assignments?.[0] ?? null
                      return (
                        <div
                          key={position.id}
                          className="flex flex-col gap-1.5 rounded-xl border bg-card p-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground">{position.name}</p>
                            <button
                              type="button"
                              aria-label="Delete position"
                              className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleDeletePosition(position.id)}
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                          {holder ? (
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-2 text-sm text-foreground">
                                <Avatar size="sm">
                                  <AvatarImage src={holder.member?.avatarUrl ?? undefined} alt="" />
                                  <AvatarFallback>
                                    {initials(holder.member?.fullName ?? '?')}
                                  </AvatarFallback>
                                </Avatar>
                                {holder.member?.fullName ?? 'Unknown'}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEndTerm(position.id, holder.id)}
                              >
                                End term
                              </Button>
                            </div>
                          ) : assigningPositionId === position.id ? (
                            <MemberSearchPicker
                              members={members}
                              excludeIds={new Set()}
                              onPick={(member) => handleAssign(position.id, member)}
                            />
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="self-start"
                              onClick={() => setAssigningPositionId(position.id)}
                            >
                              Vacant — assign someone
                            </Button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Users className="size-4" />
                    Members ({(detail.memberships ?? []).length})
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setAddMemberOpen((current) => !current)}>
                    <UserPlus className="size-4" />
                    Add member
                  </Button>
                </div>

                {addMemberOpen ? (
                  <MemberSearchPicker members={members} excludeIds={memberIds} onPick={handleAddMember} />
                ) : null}

                {(detail.memberships ?? []).length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No members yet.</p>
                ) : (
                  <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                    {(detail.memberships ?? []).map((membership) => (
                      <div
                        key={membership.id}
                        className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2"
                      >
                        <Avatar size="sm">
                          <AvatarImage src={membership.member?.avatarUrl ?? undefined} alt="" />
                          <AvatarFallback>{initials(membership.member?.fullName ?? '?')}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {membership.member?.fullName ?? 'Unknown'}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label="Remove member"
                          className={cn(
                            'rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive'
                          )}
                          onClick={() => handleRemoveMember(membership.id)}
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function UnitRow({
  unit,
  depth,
  memberCount,
  onManage,
  onEdit
}: {
  unit: OrganizationalUnit
  depth: number
  memberCount: number
  onManage: () => void
  onEdit: () => void
}): ReactElement {
  const leaders = (unit.positions ?? [])
    .flatMap((position) => position.assignments ?? [])
    .map((assignment) => assignment.member?.fullName)
    .filter((name): name is string => Boolean(name))

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border bg-card p-4 transition hover:bg-accent',
        depth > 0 && 'ml-8'
      )}
    >
      {depth > 0 ? <CaretRight className="size-3.5 shrink-0 text-muted-foreground" /> : null}
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
        <Buildings className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{unit.name}</p>
          <Badge variant="secondary">{unitTypeLabel(unit.type)}</Badge>
          {unit.status === 'archived' ? <Badge variant="outline">Archived</Badge> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {memberCount} member{memberCount === 1 ? '' : 's'}
          {leaders.length > 0 ? ` · ${leaders.join(', ')}` : ''}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onManage}>
        Manage
      </Button>
      <Button size="icon" variant="ghost" aria-label="Edit unit" onClick={onEdit}>
        <PencilSimple className="size-4" />
      </Button>
    </div>
  )
}

export function DepartmentsTab(): ReactElement {
  const { units, unitsLoading, unitsError, refreshUnits, createUnit, updateUnit } =
    useAdminBackendContext()

  const [manageUnitId, setManageUnitId] = useState<string | null>(null)
  const [editing, setEditing] = useState<OrganizationalUnit | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<UnitFormState>(EMPTY_FORM)
  const [savePending, setSavePending] = useState(false)

  useEffect(() => {
    if (units.length === 0 && !unitsLoading) void refreshUnits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeDialog = (): void => {
    setCreating(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  const openCreate = (): void => {
    setForm(EMPTY_FORM)
    setCreating(true)
  }

  const openEdit = (unit: OrganizationalUnit): void => {
    setForm({
      name: unit.name,
      type: (unit.type as OrganizationalUnitType) ?? 'department',
      description: unit.description ?? '',
      parentUnitId: unit.parentUnitId ?? ''
    })
    setEditing(unit)
  }

  const handleSave = (): void => {
    if (!form.name.trim()) {
      toast.error('Name is required.')
      return
    }
    setSavePending(true)
    const payload = {
      name: form.name.trim(),
      type: form.type,
      description: form.description.trim() || undefined,
      parentUnitId: form.parentUnitId || undefined
    }
    const request = editing ? updateUnit(editing.id, payload) : createUnit(payload)
    request
      .then(() => {
        toast.success(editing ? 'Unit updated.' : 'Unit created.')
        closeDialog()
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not save this unit.'))
      .finally(() => setSavePending(false))
  }

  const handleArchiveToggle = (unit: OrganizationalUnit): void => {
    const nextStatus = unit.status === 'archived' ? 'active' : 'archived'
    updateUnit(unit.id, { status: nextStatus })
      .then(() => toast.success(nextStatus === 'archived' ? 'Unit archived.' : 'Unit restored.'))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not update this unit.'))
  }

  const topLevel = units.filter((unit) => !unit.parentUnitId)
  const childrenOf = (parentId: string): OrganizationalUnit[] =>
    units.filter((unit) => unit.parentUnitId === parentId)
  const parentOptions = units.filter((unit) => unit.id !== editing?.id)

  return (
    <PageStack>
      <PageHeader
        title="Departments"
        description="Departments, ministries, teams, and small groups — members and leadership."
        action={
          <Button onClick={openCreate}>
            <Plus className="size-4" />
            New Unit
          </Button>
        }
      />

      {unitsLoading && units.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : unitsError ? (
        <p className="py-16 text-center text-sm text-destructive">{unitsError}</p>
      ) : units.length === 0 ? (
        <Empty>
          <EmptyMedia variant="default">
            <IconStack>
              <TreeStructure weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>No departments yet</EmptyTitle>
          <EmptyDescription>
            Create your first department, ministry, or group to start organizing members and leadership.
          </EmptyDescription>
          <Button className="mt-2" onClick={openCreate}>
            <Plus className="size-4" />
            New Unit
          </Button>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {topLevel.map((unit) => (
            <div key={unit.id} className="flex flex-col gap-2">
              <UnitRow
                unit={unit}
                depth={0}
                memberCount={unit._count?.memberships ?? 0}
                onManage={() => setManageUnitId(unit.id)}
                onEdit={() => openEdit(unit)}
              />
              {childrenOf(unit.id).map((child) => (
                <UnitRow
                  key={child.id}
                  unit={child}
                  depth={1}
                  memberCount={child._count?.memberships ?? 0}
                  onManage={() => setManageUnitId(child.id)}
                  onEdit={() => openEdit(child)}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      <Dialog open={creating || editing !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit unit' : 'New unit'}</DialogTitle>
            <DialogDescription>Departments, ministries, teams, and groups all live here.</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="unit-name">Name</FieldLabel>
              <Input
                id="unit-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Music Department"
              />
            </Field>

            <Field>
              <FieldLabel>Type</FieldLabel>
              <AppSelect
                className="w-full"
                value={form.type}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, type: value as OrganizationalUnitType }))
                }
                options={UNIT_TYPES.map((type) => ({ value: type, label: UNIT_TYPE_LABELS[type] }))}
              />
            </Field>

            <Field>
              <FieldLabel>Parent unit (optional)</FieldLabel>
              <AppSelect
                className="w-full"
                value={form.parentUnitId || 'none'}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, parentUnitId: value === 'none' ? '' : value }))
                }
                options={[
                  { value: 'none', label: 'No parent — top level' },
                  ...parentOptions.map((unit) => ({ value: unit.id, label: unit.name }))
                ]}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="unit-description">Description (optional)</FieldLabel>
              <Textarea
                id="unit-description"
                rows={3}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </Field>
          </FieldGroup>

          <DialogFooter className="items-center sm:justify-between">
            {editing ? (
              <Button variant="ghost" onClick={() => handleArchiveToggle(editing)}>
                <Archive className="size-4" />
                {editing.status === 'archived' ? 'Restore' : 'Archive'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button disabled={savePending} onClick={handleSave}>
                {editing ? 'Save changes' : 'Create unit'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UnitDetailSheet unitId={manageUnitId} onOpenChange={(open) => !open && setManageUnitId(null)} />
    </PageStack>
  )
}
