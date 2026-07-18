import {
  Image as ImageIcon,
  MagnifyingGlassPlus,
  Trash,
  UploadSimple,
  X
} from '@phosphor-icons/react'
import { useEffect, useRef, useState, type DragEvent, type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export interface ExistingImage {
  url: string
  name: string
}

/**
 * Single-image variant of reui.io's "Gallery File Upload" pattern
 * (github.com/keenthemes/reui, registry-reui/bases/radix/components/
 * file-upload/c-file-upload-4.tsx) — same drag-and-drop area, square preview
 * tile with a hover view/remove overlay, and file-info footer, but capped to
 * exactly one image instead of a multi-file grid, and rebuilt on this app's
 * own Button/Dialog components and theme tokens instead of reui's raw ones.
 * Only manages local selection/preview; the parent uploads on submit (same
 * timing as the admin dashboard's own banner-image field).
 */
export function SingleImageUpload({
  initialImage = null,
  onFileChange,
  maxSizeBytes = 5 * 1024 * 1024,
  className
}: {
  initialImage?: ExistingImage | null
  onFileChange: (file: File | null) => void
  maxSizeBytes?: number
  className?: string
}): ReactElement {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removedExisting, setRemovedExisting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const displayPreview = preview ?? (!removedExisting ? (initialImage?.url ?? null) : null)
  const displayName = file ? file.name : (initialImage?.name ?? '')
  const displaySize = file ? formatBytes(file.size) : null

  const applyFile = (candidate: File | undefined): void => {
    if (!candidate) return
    if (!candidate.type.startsWith('image/')) {
      setError('Only image files are allowed.')
      return
    }
    if (candidate.size > maxSizeBytes) {
      setError(`Image exceeds the maximum size of ${formatBytes(maxSizeBytes)}.`)
      return
    }
    setError(null)
    setFile(candidate)
    setRemovedExisting(false)
    onFileChange(candidate)
  }

  const handleRemove = (): void => {
    setFile(null)
    setRemovedExisting(true)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
    onFileChange(null)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setIsDragging(false)
    applyFile(event.dataTransfer.files[0])
  }

  return (
    <div className={cn('w-full', className)}>
      {displayPreview ? (
        <div className="group/tile relative aspect-video w-full overflow-hidden rounded-2xl border bg-card">
          <img
            alt={displayName || 'Banner'}
            className="size-full object-cover"
            src={displayPreview}
          />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 opacity-0 transition-opacity group-hover/tile:opacity-100">
            <Button
              size="icon"
              variant="secondary"
              className="size-8"
              onClick={() => setZoomOpen(true)}
              type="button"
            >
              <MagnifyingGlassPlus />
            </Button>
            <Button
              size="icon"
              variant="secondary"
              className="size-8"
              onClick={handleRemove}
              type="button"
            >
              <Trash />
            </Button>
          </div>
          {(displayName || displaySize) && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black/70 px-3 py-1.5 text-white opacity-0 transition-opacity group-hover/tile:opacity-100">
              <span className="truncate text-xs font-medium">{displayName}</span>
              {displaySize ? (
                <span className="shrink-0 text-xs text-white/70">{displaySize}</span>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div
          className={cn(
            'relative rounded-2xl border border-dashed p-6 text-center transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          )}
          onDragEnter={(event) => {
            event.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            setIsDragging(false)
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            accept="image/*"
            className="sr-only"
            type="file"
            onChange={(event) => applyFile(event.target.files?.[0])}
          />
          <div className="flex flex-col items-center gap-3">
            <div
              className={cn(
                'flex size-12 items-center justify-center rounded-full',
                isDragging ? 'bg-primary/10' : 'bg-muted'
              )}
            >
              <ImageIcon
                className={cn('size-5', isDragging ? 'text-primary' : 'text-muted-foreground')}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Drag and drop an image, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                PNG, JPG, or WebP up to {formatBytes(maxSizeBytes)}
              </p>
            </div>
            <Button size="sm" type="button" onClick={() => inputRef.current?.click()}>
              <UploadSimple data-icon="inline-start" />
              Select image
            </Button>
          </div>
        </div>
      )}

      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="border-none bg-transparent p-0 shadow-none sm:max-w-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Image preview</DialogTitle>
          </DialogHeader>
          {displayPreview ? (
            <img
              alt={displayName || 'Banner'}
              className="max-h-[80vh] w-full rounded-2xl object-contain"
              src={displayPreview}
            />
          ) : null}
          <button
            aria-label="Close preview"
            className="absolute -top-3 -right-3 grid size-7 place-items-center rounded-full bg-background text-muted-foreground shadow-md hover:text-foreground"
            type="button"
            onClick={() => setZoomOpen(false)}
          >
            <X className="size-4" />
          </button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
