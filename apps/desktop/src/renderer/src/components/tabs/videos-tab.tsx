import {
  CircleNotch,
  GearSix,
  MagnifyingGlass,
  MonitorPlay,
  Plus,
  Star,
  Trash,
  YoutubeLogo
} from '@phosphor-icons/react'
import { useEffect, useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { MediaThumbnail } from '@/components/media-thumbnail'
import { PageHeader, PageStack } from '@/components/page'
import { MediaRowSkeleton } from '@/components/skeleton-rows'
import { StatusBadge } from '@/components/status-badge'
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
import { IconStack } from '@/components/ui/icon-stack'
import { Input } from '@/components/ui/input'
import { AppSelect } from '@/components/ui/app-select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { VideoPlayerDialog } from '@/components/video-player-dialog'
import { useWorkspaceNav } from '@/components/workspace-nav'
import { cn } from '@/lib/utils'
import type { AdminVideo, VideoCategory, YoutubeSearchResult } from '@/lib/backend'
import type { UseAdminBackend } from '@/hooks/use-admin-backend'

const NO_CATEGORY = '__none__'

function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${rest.toString().padStart(2, '0')}`
}

/**
 * Debounced YouTube search + multi-select bulk import — mirrors the admin
 * dashboard's "Find on YouTube" tab (YouTubeVideoSearch.tsx), reusing the
 * same admin API endpoints (youtube-search / youtube-import) via the Rust
 * client instead of duplicating the search logic here.
 */
function YoutubeSearchPanel({
  searchYoutube,
  importFromYoutube,
  categories,
  onImported
}: {
  searchYoutube: (query: string) => Promise<YoutubeSearchResult[]>
  importFromYoutube: UseAdminBackend['importFromYoutube']
  categories: VideoCategory[]
  onImported: () => void
}): ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YoutubeSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [categoryId, setCategoryId] = useState(NO_CATEGORY)
  const [status, setStatus] = useState<'draft' | 'published'>('published')
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearchError(null)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      searchYoutube(trimmed)
        .then((found) => {
          if (cancelled) return
          setResults(found)
          setSearchError(null)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setSearchError(error instanceof Error ? error.message : 'YouTube search failed.')
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 550)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, searchYoutube])

  const toggle = (videoId: string): void => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(videoId)) next.delete(videoId)
      else next.add(videoId)
      return next
    })
  }

  const handleImport = (): void => {
    const videos = results
      .filter((result) => selected.has(result.videoId))
      .map((result) => ({
        videoId: result.videoId,
        title: result.title,
        channelTitle: result.channelTitle || undefined,
        thumbnailUrl: result.thumbnailUrl,
        durationSeconds: result.durationSeconds ?? undefined,
        videoUrl: result.videoUrl
      }))
    if (videos.length === 0) {
      toast.error('Select at least one video first.')
      return
    }
    setImporting(true)
    void importFromYoutube({
      videos,
      categoryId: categoryId === NO_CATEGORY ? undefined : categoryId,
      status
    })
      .then(() => {
        toast.success(
          `Imported ${videos.length} video${videos.length === 1 ? '' : 's'} from YouTube.`
        )
        onImported()
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not import from YouTube.')
      )
      .finally(() => setImporting(false))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          className="pl-8"
          placeholder="Search YouTube for sermons, worship, teachings…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="max-h-[45vh] overflow-y-auto">
        {searching && results.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <CircleNotch className="animate-spin" />
            Searching YouTube…
          </div>
        ) : searchError ? (
          <p className="py-8 text-center text-sm text-destructive">{searchError}</p>
        ) : results.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {query.trim().length < 2
              ? 'Type at least 2 characters to search YouTube.'
              : 'No results yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {results.map((result) => {
              const isSelected = selected.has(result.videoId)
              const duration = formatDuration(result.durationSeconds)
              return (
                <button
                  key={result.videoId}
                  className="flex flex-col gap-1.5 rounded-xl border p-1.5 text-left transition-colors hover:bg-accent data-selected:border-primary data-selected:bg-accent"
                  data-selected={isSelected ? '' : undefined}
                  type="button"
                  onClick={() => toggle(result.videoId)}
                >
                  <span className="relative aspect-video overflow-hidden rounded-lg bg-muted">
                    <img
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                      src={result.thumbnailUrl}
                    />
                    <Checkbox
                      checked={isSelected}
                      className="absolute top-1.5 left-1.5 bg-background/90"
                      onCheckedChange={() => toggle(result.videoId)}
                      onClick={(event) => event.stopPropagation()}
                    />
                    {duration ? (
                      <span className="absolute right-1.5 bottom-1.5 rounded-chip bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
                        {duration}
                      </span>
                    ) : null}
                  </span>
                  <span className="line-clamp-2 text-xs font-medium text-foreground">
                    {result.title}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {result.channelTitle}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <AppSelect
          className="w-40"
          value={categoryId}
          onValueChange={setCategoryId}
          options={[
            { value: NO_CATEGORY, label: 'No category' },
            ...categories.map((entry) => ({ value: entry.id, label: entry.name }))
          ]}
        />
        <ToggleGroup
          type="single"
          value={status}
          variant="outline"
          onValueChange={(value) => value && setStatus(value as 'draft' | 'published')}
        >
          <ToggleGroupItem value="draft">Draft</ToggleGroupItem>
          <ToggleGroupItem value="published">Published</ToggleGroupItem>
        </ToggleGroup>
        <Button
          className="ml-auto"
          disabled={importing || selected.size === 0}
          size="sm"
          onClick={handleImport}
        >
          {importing ? <CircleNotch className="animate-spin" data-icon="inline-start" /> : null}
          Import {selected.size > 0 ? selected.size : ''} video{selected.size === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  )
}

type VideoFormState = {
  title: string
  speakerName: string
  videoUrl: string
  categoryId: string
  status: 'draft' | 'published'
}

const EMPTY_FORM: VideoFormState = {
  title: '',
  speakerName: '',
  videoUrl: '',
  categoryId: NO_CATEGORY,
  status: 'published'
}

function formFromVideo(video: AdminVideo): VideoFormState {
  return {
    title: video.title,
    speakerName: video.speakerName ?? '',
    videoUrl: video.videoUrl ?? '',
    categoryId: video.category?.id ?? NO_CATEGORY,
    status: video.status === 'draft' ? 'draft' : 'published'
  }
}

// Browse archetype (page.tsx): PageHeader over content. Reads/writes through
// prophet-roja-admin's real /api/admin/videos API (see use-admin-backend) —
// a video created here shows up in the admin dashboard and mobile app.
// Covers external/YouTube links (paste a URL or search YouTube directly) —
// local file upload isn't built yet.
export function VideosTab(): ReactElement {
  const {
    connection,
    connectionLoading,
    videos,
    videosLoading,
    videosError,
    refreshVideos,
    createVideo,
    updateVideo,
    deleteVideo,
    toggleVideoFeatured,
    videoCategories,
    refreshVideoCategories,
    searchYoutube,
    importFromYoutube
  } = useAdminBackendContext()
  const { setActive } = useWorkspaceNav()

  const configured = Boolean(connection?.apiKeyConfigured && connection.baseUrl)

  useEffect(() => {
    if (configured) {
      void refreshVideos()
      void refreshVideoCategories()
    }
  }, [configured, refreshVideos, refreshVideoCategories])

  const [editing, setEditing] = useState<AdminVideo | null>(null)
  const [creating, setCreating] = useState(false)
  const [createTab, setCreateTab] = useState<'link' | 'youtube'>('link')
  const [form, setForm] = useState<VideoFormState>(EMPTY_FORM)
  const [savePending, setSavePending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminVideo | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [playingVideo, setPlayingVideo] = useState<{
    title: string
    url: string
    durationSeconds: number | null
  } | null>(null)
  const [togglingFeatured, setTogglingFeatured] = useState<Set<string>>(new Set())

  const handleToggleFeatured = (video: AdminVideo, event: React.MouseEvent): void => {
    event.stopPropagation()
    if (togglingFeatured.has(video.id)) return
    setTogglingFeatured((current) => new Set(current).add(video.id))
    void toggleVideoFeatured(video.id)
      .then((isFeatured) => {
        toast.success(isFeatured ? 'Video set as featured.' : 'Video is no longer featured.')
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not update featured status.')
      )
      .finally(() => {
        setTogglingFeatured((current) => {
          const next = new Set(current)
          next.delete(video.id)
          return next
        })
      })
  }

  const dialogOpen = creating || editing !== null

  const openCreate = (): void => {
    setForm(EMPTY_FORM)
    setCreateTab('link')
    setCreating(true)
  }
  const openEdit = (video: AdminVideo): void => {
    setForm(formFromVideo(video))
    setEditing(video)
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
    if (!form.videoUrl.trim()) {
      toast.error('A video URL is required.')
      return
    }
    setSavePending(true)
    const categoryId = form.categoryId === NO_CATEGORY ? '' : form.categoryId
    const request = editing
      ? updateVideo(editing.id, {
          title: form.title,
          speakerName: form.speakerName,
          videoUrl: form.videoUrl,
          status: form.status,
          categoryId
        })
      : createVideo({
          title: form.title,
          speakerName: form.speakerName,
          videoUrl: form.videoUrl,
          categoryId
        })
    void request
      .then(() => {
        toast.success(editing ? 'Video updated.' : 'Video added.')
        closeDialog()
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not save this video.')
      )
      .finally(() => setSavePending(false))
  }

  const handleDelete = (): void => {
    if (!deleteTarget) return
    setDeletePending(true)
    void deleteVideo(deleteTarget.id)
      .then(() => {
        toast.success('Video deleted.')
        setDeleteTarget(null)
      })
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not delete this video.')
      )
      .finally(() => setDeletePending(false))
  }

  if (!connectionLoading && !configured) {
    return (
      <PageStack>
        <PageHeader description="Manage on-demand videos for the ministry." title="Videos" />
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <MonitorPlay weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>Connect your database first</EmptyTitle>
          <EmptyDescription>
            Videos read and write through your admin backend. Add its base URL and API key in
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
            New Video
          </Button>
        }
        description="Manage on-demand videos for the ministry — paste a YouTube or direct video link."
        title="Videos"
      />

      {videosLoading && videos.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <MediaRowSkeleton key={index} />
          ))}
        </div>
      ) : videosError ? (
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <MonitorPlay weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>Could not load videos</EmptyTitle>
          <EmptyDescription>{videosError}</EmptyDescription>
          <Button size="sm" variant="outline" onClick={() => void refreshVideos()}>
            Try again
          </Button>
        </Empty>
      ) : videos.length === 0 ? (
        <Empty className="py-16">
          <EmptyMedia variant="default">
            <IconStack>
              <MonitorPlay weight="duotone" className="size-4" />
            </IconStack>
          </EmptyMedia>
          <EmptyTitle>No videos yet</EmptyTitle>
          <EmptyDescription>Videos you add will show up here.</EmptyDescription>
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {videos.map((video) => (
            <div
              key={video.id}
              className="flex cursor-default items-center gap-4 rounded-2xl border bg-card p-3 transition-colors hover:bg-accent"
              onClick={() => openEdit(video)}
            >
              <span className="size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                <MediaThumbnail
                  fallback={
                    <MonitorPlay className="size-8 text-muted-foreground/50" weight="duotone" />
                  }
                  label={`Play ${video.title}`}
                  playUrl={video.videoUrl}
                  size="lg"
                  thumbnailUrl={video.thumbnailPath}
                  onPlay={(url) =>
                    setPlayingVideo({
                      title: video.title,
                      url,
                      durationSeconds: video.durationSeconds
                    })
                  }
                />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-base font-medium text-foreground">
                  {video.title}
                </span>
                <span className="truncate text-sm text-muted-foreground">
                  {video.speakerName ?? 'Unknown speaker'}
                  {video.category?.name ? ` • ${video.category.name}` : ''}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <StatusBadge
                  tone={video.status === 'published' ? 'good' : 'neutral'}
                  value={video.status === 'published' ? 'Published' : 'Draft'}
                />
                {video.storageDisk === 'youtube' ? (
                  <span
                    className="grid size-7 place-items-center rounded-full bg-white/90 text-red-600"
                    title="Hosted on YouTube"
                  >
                    <YoutubeLogo className="size-4" weight="fill" />
                  </span>
                ) : null}
                <button
                  aria-label={
                    video.isFeatured === 1 ? 'Unfeature this video' : 'Feature this video'
                  }
                  className={cn(
                    'grid size-7 place-items-center rounded-full shadow-sm transition-colors',
                    video.isFeatured === 1
                      ? 'bg-amber-100 text-amber-500 hover:bg-amber-200'
                      : 'bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                  disabled={togglingFeatured.has(video.id)}
                  title={
                    video.isFeatured === 1
                      ? 'Featured — shown as "Featured Now" on Watch and "Featured Teaching" on Home. Click to unfeature.'
                      : 'Feature this video — pins it as "Featured Now" on Watch and "Featured Teaching" on Home.'
                  }
                  type="button"
                  onClick={(event) => handleToggleFeatured(video, event)}
                >
                  <Star className="size-4" weight={video.isFeatured === 1 ? 'fill' : 'regular'} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className={creating ? 'sm:max-w-2xl' : 'sm:max-w-lg'}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit video' : 'New video'}</DialogTitle>
            <DialogDescription>
              Writes directly to your admin backend — visible in the dashboard and mobile app once
              published. YouTube links get their thumbnail and duration filled in automatically.
            </DialogDescription>
          </DialogHeader>

          {creating ? (
            <Tabs
              value={createTab}
              onValueChange={(value) => setCreateTab(value as 'link' | 'youtube')}
            >
              <TabsList className="w-full justify-start border-b" variant="line">
                <TabsTrigger value="link">Paste a link</TabsTrigger>
                <TabsTrigger value="youtube">
                  <YoutubeLogo data-icon="inline-start" weight="fill" />
                  Find on YouTube
                </TabsTrigger>
              </TabsList>
              <TabsContent value="youtube">
                <YoutubeSearchPanel
                  categories={videoCategories}
                  importFromYoutube={importFromYoutube}
                  searchYoutube={searchYoutube}
                  onImported={closeDialog}
                />
              </TabsContent>
              <TabsContent value="link">
                <div className="flex max-h-[50vh] flex-col gap-4 overflow-y-auto pr-1">
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="video-title">Title</FieldLabel>
                      <Input
                        id="video-title"
                        value={form.title}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, title: event.target.value }))
                        }
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="video-url">Video URL</FieldLabel>
                      <Input
                        id="video-url"
                        placeholder="https://www.youtube.com/watch?v=…"
                        value={form.videoUrl}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, videoUrl: event.target.value }))
                        }
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="video-speaker">Speaker</FieldLabel>
                      <Input
                        id="video-speaker"
                        value={form.speakerName}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, speakerName: event.target.value }))
                        }
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="video-category">Category</FieldLabel>
                      <AppSelect
                        className="w-full"
                        id="video-category"
                        value={form.categoryId}
                        onValueChange={(value) =>
                          setForm((current) => ({ ...current, categoryId: value }))
                        }
                        options={[
                          { value: NO_CATEGORY, label: 'No category' },
                          ...videoCategories.map((entry) => ({ value: entry.id, label: entry.name }))
                        ]}
                      />
                    </Field>

                    <p className="text-xs text-muted-foreground">
                      New videos publish immediately — switch to Draft afterward if needed.
                    </p>
                  </FieldGroup>
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="video-title">Title</FieldLabel>
                  <Input
                    id="video-title"
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="video-url">Video URL</FieldLabel>
                  <Input
                    id="video-url"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={form.videoUrl}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, videoUrl: event.target.value }))
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="video-speaker">Speaker</FieldLabel>
                  <Input
                    id="video-speaker"
                    value={form.speakerName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, speakerName: event.target.value }))
                    }
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="video-category">Category</FieldLabel>
                  <AppSelect
                    className="w-full"
                    id="video-category"
                    value={form.categoryId}
                    onValueChange={(value) =>
                      setForm((current) => ({ ...current, categoryId: value }))
                    }
                    options={[
                      { value: NO_CATEGORY, label: 'No category' },
                      ...videoCategories.map((entry) => ({ value: entry.id, label: entry.name }))
                    ]}
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
          )}

          {(!creating || createTab === 'link') && (
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
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this video?</DialogTitle>
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
