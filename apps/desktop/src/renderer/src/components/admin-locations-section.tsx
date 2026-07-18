import { Buildings, PencilSimple, Plus, Star } from '@phosphor-icons/react'
import { useEffect, useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { PanelSection } from '@/components/panel-section'
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
import { Input } from '@/components/ui/input'
import { AppSelect } from '@/components/ui/app-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { Location, LocationType } from '@/lib/backend'
import { cn } from '@/lib/utils'

const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  headquarters: 'Headquarters',
  main_church: 'Main Church',
  branch: 'Branch',
  campus: 'Campus',
  parish: 'Parish',
  assembly: 'Assembly',
  congregation: 'Congregation',
  online_church: 'Online Church',
  other: 'Other'
}

const LOCATION_TYPES = Object.keys(LOCATION_TYPE_LABELS) as LocationType[]

function locationTypeLabel(type: string): string {
  return LOCATION_TYPE_LABELS[type as LocationType] ?? type
}

type LocationFormState = {
  name: string
  type: LocationType
  city: string
  country: string
  isHeadquarters: boolean
  isOnline: boolean
  description: string
}

const EMPTY_FORM: LocationFormState = {
  name: '',
  type: 'branch',
  city: '',
  country: '',
  isHeadquarters: false,
  isOnline: false,
  description: ''
}

export function AdminLocationsSection(): ReactElement {
  const { locations, locationsLoading, refreshLocations, createLocation, updateLocation } =
    useAdminBackendContext()

  const [editing, setEditing] = useState<Location | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<LocationFormState>(EMPTY_FORM)
  const [savePending, setSavePending] = useState(false)

  useEffect(() => {
    if (locations.length === 0 && !locationsLoading) void refreshLocations()
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

  const openEdit = (location: Location): void => {
    setForm({
      name: location.name,
      type: (location.type as LocationType) ?? 'branch',
      city: location.city ?? '',
      country: location.country ?? '',
      isHeadquarters: location.isHeadquarters,
      isOnline: location.isOnline,
      description: location.description ?? ''
    })
    setEditing(location)
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
      city: form.city.trim() || undefined,
      country: form.country.trim() || undefined,
      isHeadquarters: form.isHeadquarters,
      isOnline: form.isOnline,
      description: form.description.trim() || undefined
    }
    const request = editing ? updateLocation(editing.id, payload) : createLocation(payload)
    request
      .then(() => {
        toast.success(editing ? 'Location updated.' : 'Location created.')
        closeDialog()
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not save this location.'))
      .finally(() => setSavePending(false))
  }

  const handleArchiveToggle = (location: Location): void => {
    const nextStatus = location.status === 'archived' ? 'active' : 'archived'
    updateLocation(location.id, { status: nextStatus })
      .then(() => toast.success(nextStatus === 'archived' ? 'Location archived.' : 'Location restored.'))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not update this location.'))
  }

  return (
    <PanelSection
      action={
        <Button size="sm" variant="outline" onClick={openCreate}>
          <Plus className="size-4" />
          New Location
        </Button>
      }
      description="Physical branches, campuses, or parishes your church operates — not university campuses."
      icon={Buildings}
      title="Church Locations"
    >
      {locations.length === 0 ? (
        <Empty className="py-10">
          <EmptyMedia variant="icon">
            <Buildings weight="duotone" />
          </EmptyMedia>
          <EmptyTitle>No locations yet</EmptyTitle>
          <EmptyDescription>
            Add your main church, then any additional branches or campuses.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="flex flex-col gap-1">
          {locations.map((location) => (
            <div
              key={location.id}
              className={cn(
                'flex items-center gap-3 rounded-row px-2.5 py-2 text-sm',
                location.status === 'archived' && 'opacity-60'
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 font-medium">
                  {location.name}
                  {location.isHeadquarters ? (
                    <Star weight="fill" className="size-3.5 text-primary" />
                  ) : null}
                  <Badge variant="secondary">{locationTypeLabel(location.type)}</Badge>
                  {location.status === 'archived' ? <Badge variant="outline">Archived</Badge> : null}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[location.city, location.country].filter(Boolean).join(', ') || 'No address set'}
                  {location._count ? ` · ${location._count.members} members · ${location._count.events} events` : ''}
                </div>
              </div>
              <Button size="icon" variant="ghost" aria-label="Edit location" onClick={() => openEdit(location)}>
                <PencilSimple className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={creating || editing !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit location' : 'New location'}</DialogTitle>
            <DialogDescription>
              A physical branch, campus, or parish of your church organization.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="location-name">Name</FieldLabel>
              <Input
                id="location-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Nashville Branch"
              />
            </Field>

            <Field>
              <FieldLabel>Type</FieldLabel>
              <AppSelect
                className="w-full"
                value={form.type}
                onValueChange={(value) => setForm((current) => ({ ...current, type: value as LocationType }))}
                options={LOCATION_TYPES.map((type) => ({
                  value: type,
                  label: LOCATION_TYPE_LABELS[type]
                }))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="location-city">City</FieldLabel>
                <Input
                  id="location-city"
                  value={form.city}
                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="location-country">Country</FieldLabel>
                <Input
                  id="location-country"
                  value={form.country}
                  onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
                />
              </Field>
            </div>

            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Headquarters</p>
                <p className="text-xs text-muted-foreground">The main/reporting location.</p>
              </div>
              <Switch
                checked={form.isHeadquarters}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, isHeadquarters: checked }))}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Online only</p>
                <p className="text-xs text-muted-foreground">No physical address, e.g. an online campus.</p>
              </div>
              <Switch
                checked={form.isOnline}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, isOnline: checked }))}
              />
            </div>

            <Field>
              <FieldLabel htmlFor="location-description">Description (optional)</FieldLabel>
              <Textarea
                id="location-description"
                rows={2}
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
                {editing ? 'Save changes' : 'Create location'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PanelSection>
  )
}
