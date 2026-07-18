import { BookOpen, CircleNotch, GearSix, Plus, Trash } from '@phosphor-icons/react'
import { useEffect, useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { MediaThumbnail } from '@/components/media-thumbnail'
import { PageHeader, PageStack } from '@/components/page'
import { MediaRowSkeleton } from '@/components/skeleton-rows'
import { StatusBadge } from '@/components/status-badge'
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
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { VideoPlayerDialog } from '@/components/video-player-dialog'
import { useWorkspaceNav } from '@/components/workspace-nav'
import { useAdminBackendContext } from '@/components/admin-backend-provider'
import type { AdminSermon } from '@/lib/backend'

const NO_SERIES = '__none__'

type SermonFormState = {
  title: string
  seriesId: string
  speakerName: string
  scripture: string
  summary: string
  notes: string
  audioUrl: string
  videoId: string
  thumbnailPath: string
  status: 'draft' | 'published'
}

const EMPTY_FORM: SermonFormState = {
  title: '',
  seriesId: NO_SERIES,
  speakerName: '',
  scripture: '',
  summary: '',
  notes: '',
  audioUrl: '',
  videoId: '',
  thumbnailPath: '',
  status: 'draft'
}

function formFromSermon(sermon: AdminSermon): SermonFormState {
  return {
    title: sermon.title,
    seriesId: sermon.seriesId ?? NO_SERIES,
    speakerName: sermon.speakerName ?? '',
    scripture: sermon.scripture ?? '',
    summary: sermon.summary ?? '',
    notes: sermon.notes ?? '',
    audioUrl: sermon.audioUrl ?? '',
    videoId: sermon.videoId ?? '',
    thumbnailPath: sermon.thumbnailPath ?? '',
    status: sermon.status === 'published' ? 'published' : 'draft'
  }
}

// Browse archetype (page.tsx): PageHeader over content. Reads/writes through
// prophet-roja-admin's real /api/admin/sermons API (see use-admin-backend) —
// a sermon created here shows up in the admin dashboard and mobile app.
export function SermonsTab(): ReactElement {
  const {
    connection,
    connectionLoading,
    sermons,
    sermonsLoading,
    sermonsError,
    refreshSermons,
    createSermon,
    updateSermon,
    deleteSermon,
    series,
    refreshSeries,
    videos,
    refreshVideos
  } = useAdminBackendContext()
  const { setActive } = useWorkspaceNav()

  const configured = Boolean(connection?.apiKeyConfigured && connection.baseUrl)

  useEffect(() => {
    if (configured) {
      void refreshSermons()
      void refreshSeries()
      // Sermons don't carry their own thumbnail/video most of the time — the
      // admin dashboard falls back to the linked video's thumbnail + URL
      // (toMobileSermonDto does the same), so the video list is loaded here
      // purely to resolve that fallback client-side.
      void refreshVideos()
    }
  }, [configured, refreshSermons, refreshSeries, refreshVideos])

  const [editing, setEditing] = useState<AdminSermon | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<SermonFormState>(EMPTY_FORM)
  const [savePending, setSavePending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminSermon | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [playingVideo, setPlayingVideo] = useState<{
    title: string
    url: string
    durationSeconds: number | null
  } | null>(null)

  const dialogOpen = creating || editing !== null

  const openCreate = (): void => {
    setForm(EMPTY_FORM)
    setCreating(true)
  }
  const openEdit = (sermon: AdminSermon): void => {
    setForm(formFromSermon(sermon))
    setEditing(sermon)
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
    const shared = {
      seriesId: form.seriesId === NO_SERIES ? '' : form.seriesId,
      speakerName: form.speakerName,
      scripture: form.scripture,
      summary: form.summary,
      notes: form.notes,
      audioUrl: form.audioUrl,
      videoId: form.videoId,
      thumbnailPath: form.thumbnailPath
    }
    setSavePending(true)
    const request = editing
      ? updateSermon(editing.id, { ...shared, title: form.title, status: form.status })
      : createSermon({ ...shared, title: form.title, status: form.status })
    void request
      .then(() => {
        toast.success(editing ? 'Sermon updated.' : 'Sermon created.')
        closeDialog()
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not save this sermon.')
      )
      .finally(() => setSavePending(false))
  }

  const handleDelete = (): void => {
    if (!deleteTarget) return
    setDeletePending(true)
    void deleteSermon(deleteTarget.id)
      .then(() => {
        toast.success('Sermon deleted.')
        setDeleteTarget(null)
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not delete this sermon.')
      )
      .finally(() => setDeletePending(false))
  }

  if (!connectionLoading && !configured) {
    return (
      <PageStack>
        <PageHeader
          description="Manage sermon recordings and notes for the ministry."
          title="Sermons"
        />
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <BookOpen weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>Connect your database first</EmptyTitle>
          <EmptyDescription>
            Sermons read and write through your admin backend. Add its base URL and API key in
            Settings &gt; Database, then come back here.
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
            New Sermon
          </Button>
        }
        description="Manage sermon recordings and notes for the ministry."
        title="Sermons"
      />

      {sermonsLoading && sermons.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <MediaRowSkeleton key={index} />
          ))}
        </div>
      ) : sermonsError ? (
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <BookOpen weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>Could not load sermons</EmptyTitle>
          <EmptyDescription>{sermonsError}</EmptyDescription>
          <Button size="sm" variant="outline" onClick={() => void refreshSermons()}>
            Try again
          </Button>
        </Empty>
      ) : sermons.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <BookOpen weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>No sermons yet</EmptyTitle>
          <EmptyDescription>Sermons you record or import will show up here.</EmptyDescription>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {sermons.map((sermon) => {
            const linkedVideo = sermon.videoId
              ? videos.find((video) => video.id === sermon.videoId)
              : undefined
            const thumbnailUrl = sermon.thumbnailPath ?? linkedVideo?.thumbnailPath ?? null
            const playUrl = linkedVideo?.videoUrl ?? sermon.audioUrl ?? null
            return (
              <div
                key={sermon.id}
                className="flex cursor-default items-center gap-4 rounded-2xl border bg-card p-3 transition-colors hover:bg-accent"
                onClick={() => openEdit(sermon)}
              >
                <span className="size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                  <MediaThumbnail
                    fallback={
                      <BookOpen className="size-8 text-muted-foreground/50" weight="duotone" />
                    }
                    label={`Play ${sermon.title}`}
                    playUrl={playUrl}
                    size="lg"
                    thumbnailUrl={thumbnailUrl}
                    onPlay={(url) =>
                      setPlayingVideo({
                        title: sermon.title,
                        url,
                        durationSeconds: linkedVideo?.durationSeconds ?? null
                      })
                    }
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-base font-medium text-foreground">
                    {sermon.title}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">
                    {sermon.speakerName ?? 'Unknown speaker'}
                    {sermon.series?.title ? ` • ${sermon.series.title}` : ''}
                  </span>
                </span>
                <StatusBadge
                  tone={sermon.status === 'published' ? 'good' : 'neutral'}
                  value={sermon.status === 'published' ? 'Published' : 'Draft'}
                />
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit sermon' : 'New sermon'}</DialogTitle>
            <DialogDescription>
              Writes directly to your admin backend — visible in the dashboard and mobile app once
              published.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="sermon-title">Title</FieldLabel>
                <Input
                  id="sermon-title"
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="sermon-series">Series</FieldLabel>
                <AppSelect
                  className="w-full"
                  id="sermon-series"
                  value={form.seriesId}
                  onValueChange={(value) => setForm((current) => ({ ...current, seriesId: value }))}
                  options={[
                    { value: NO_SERIES, label: 'No series' },
                    ...series.map((entry) => ({ value: entry.id, label: entry.title }))
                  ]}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="sermon-speaker">Speaker</FieldLabel>
                <Input
                  id="sermon-speaker"
                  value={form.speakerName}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, speakerName: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="sermon-scripture">Scripture</FieldLabel>
                <Input
                  id="sermon-scripture"
                  placeholder="e.g. Romans 8:28"
                  value={form.scripture}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scripture: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="sermon-summary">Summary</FieldLabel>
                <Textarea
                  id="sermon-summary"
                  rows={3}
                  value={form.summary}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, summary: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="sermon-notes">Notes</FieldLabel>
                <Textarea
                  id="sermon-notes"
                  rows={4}
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="sermon-audio">Audio URL</FieldLabel>
                <Input
                  id="sermon-audio"
                  value={form.audioUrl}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, audioUrl: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="sermon-video">Linked video ID</FieldLabel>
                <Input
                  id="sermon-video"
                  placeholder="Optional — paste a video ID from the admin dashboard"
                  value={form.videoId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, videoId: event.target.value }))
                  }
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="sermon-thumbnail">Thumbnail path</FieldLabel>
                <Input
                  id="sermon-thumbnail"
                  placeholder="Optional — paste an uploaded image path or URL"
                  value={form.thumbnailPath}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, thumbnailPath: event.target.value }))
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
                    setForm((current) => ({ ...current, status: value as 'draft' | 'published' }))
                  }
                >
                  <ToggleGroupItem value="draft">Draft</ToggleGroupItem>
                  <ToggleGroupItem value="published">Published</ToggleGroupItem>
                </ToggleGroup>
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
            <DialogTitle>Delete this sermon?</DialogTitle>
            <DialogDescription>
              “{deleteTarget?.title}” will be removed from your admin backend, the dashboard, and
              mobile app. This can&apos;t be undone.
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

      <VideoPlayerDialog
        durationSeconds={playingVideo?.durationSeconds ?? null}
        open={playingVideo !== null}
        title={playingVideo?.title ?? ''}
        url={playingVideo?.url ?? null}
        onOpenChange={(open) => !open && setPlayingVideo(null)}
      />
    </PageStack>
  )
}
