import {
  ArrowsInSimple,
  ArrowsOutSimple,
  CaretDown,
  Eye,
  FloppyDisk,
  Image,
  MagicWand,
  Palette,
  SlidersHorizontal,
  Swap,
  Textbox,
  Trash,
  X,
  type Icon
} from '@phosphor-icons/react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactElement
} from 'react'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { LivingTextOutputTheme, LivingTextOutputVerse } from '@/lib/backend'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SYSTEM_FONTS = [
  { label: 'System UI', value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Inter', value: '"Inter", system-ui, sans-serif' },
  { label: 'Helvetica', value: '"Helvetica Neue", Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Playfair Display', value: '"Playfair Display", Georgia, serif' },
  { label: 'Montserrat', value: '"Montserrat", system-ui, sans-serif' },
  { label: 'Roboto', value: '"Roboto", system-ui, sans-serif' },
  { label: 'Open Sans', value: '"Open Sans", system-ui, sans-serif' },
  { label: 'Cinzel', value: '"Cinzel", Georgia, serif' },
  { label: 'Cormorant Garamond', value: '"Cormorant Garamond", Georgia, serif' }
]

const FONT_WEIGHTS = [
  { label: 'Thin', value: 100 },
  { label: 'Light', value: 300 },
  { label: 'Regular', value: 400 },
  { label: 'Medium', value: 500 },
  { label: 'Semibold', value: 600 },
  { label: 'Bold', value: 700 },
  { label: 'Extrabold', value: 800 },
  { label: 'Black', value: 900 }
]

const RESOLUTIONS = [
  { label: '1920×1080 (Full HD)', w: 1920, h: 1080 },
  { label: '1280×720 (HD)', w: 1280, h: 720 },
  { label: '3840×2160 (4K)', w: 3840, h: 2160 }
]

const SAVED_THEMES_KEY = 'videorc.livingText.savedThemes'

interface SavedTheme {
  name: string
  theme: LivingTextOutputTheme
}

function loadSavedThemes(): SavedTheme[] {
  try {
    const raw = localStorage.getItem(SAVED_THEMES_KEY)
    return raw ? (JSON.parse(raw) as SavedTheme[]) : []
  } catch {
    return []
  }
}

function saveSavedThemes(themes: SavedTheme[]): void {
  localStorage.setItem(SAVED_THEMES_KEY, JSON.stringify(themes))
}

// ---------------------------------------------------------------------------
// Small reusable sub-components
// ---------------------------------------------------------------------------

function SectionHead({ icon: SectionIcon, title }: { icon: Icon; title: string }): ReactElement {
  return (
    <div className="flex items-center gap-1.5 pb-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
      <SectionIcon className="size-3" />
      {title}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function ColorInput({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}): ReactElement {
  return (
    <input
      type="color"
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      className="h-6 w-10 cursor-pointer rounded border border-input bg-transparent p-0.5"
    />
  )
}

function ToggleGroup({
  value,
  options,
  onChange
}: {
  value: string
  options: { label: string; value: string }[]
  onChange: (v: string) => void
}): ReactElement {
  return (
    <div className="flex gap-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'rounded px-2 py-1 text-xs transition-colors',
            value === opt.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Full-bleed Live Canvas
// ---------------------------------------------------------------------------

/**
 * The designer's preview is the output surface itself: the theme background
 * covers the entire designer, and the verse renders at the same proportions
 * as the broadcast window (every theme dimension scales by
 * surface-width / resolution-width). Mirrors livingTextOutputWindowHtml in
 * main/index.ts — keep the two in step.
 */
function DesignerCanvas({
  theme,
  verse
}: {
  theme: LivingTextOutputTheme
  verse: LivingTextOutputVerse | null
}): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [surfaceWidth, setSurfaceWidth] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = (): void => setSurfaceWidth(container.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const scale = surfaceWidth > 0 ? surfaceWidth / (theme.resolutionWidth || 1920) : 0

  const bgStyle: CSSProperties = (() => {
    const type = theme.backgroundType || 'solid'
    if (type === 'gradient') {
      const angle = theme.gradientAngle ?? 135
      const s = theme.gradientColorStart || '#0f0c29'
      const e = theme.gradientColorEnd || '#302b63'
      return { background: `linear-gradient(${angle}deg, ${s}, ${e})` }
    }
    if (type === 'image' && theme.backgroundImagePath) {
      return {
        backgroundColor: '#000',
        backgroundImage: `url("${theme.backgroundImagePath}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }
    }
    return { backgroundColor: theme.backgroundColor || '#000' }
  })()

  const overlayBg: CSSProperties =
    theme.backgroundType === 'image' && theme.backgroundImagePath
      ? { backgroundColor: `rgba(0,0,0,${1 - (theme.backgroundImageOpacity ?? 0.5)})` }
      : {}

  const shadow =
    theme.textShadowBlur > 0 || theme.textShadowX !== 0 || theme.textShadowY !== 0
      ? `${theme.textShadowX * scale}px ${theme.textShadowY * scale}px ${theme.textShadowBlur * scale}px ${theme.textShadowColor || 'rgba(0,0,0,0.6)'}`
      : 'none'

  const stroke =
    theme.textStrokeWidth > 0
      ? `${theme.textStrokeWidth * scale}px ${theme.textStrokeColor || '#000000'}`
      : 'none'

  const align = theme.textAlign || 'center'
  const fontFamily = theme.fontFamily || 'system-ui, sans-serif'

  const verseStyle: CSSProperties = {
    color: theme.textColor || '#fff',
    fontSize: `${(theme.fontSize || 56) * scale}px`,
    fontFamily,
    fontWeight: theme.fontWeight || 600,
    lineHeight: theme.lineHeight || 1.35,
    letterSpacing: `${theme.letterSpacing || 0}em`,
    textShadow: shadow,
    WebkitTextStroke: stroke,
    whiteSpace: 'pre-wrap',
    textWrap: 'balance'
  }

  const refFontSize =
    (theme.referenceFontSize > 0 ? theme.referenceFontSize : (theme.fontSize || 56) * 0.4) * scale

  const refStyle: CSSProperties = {
    color: theme.referenceColor || '#f5c451',
    fontSize: `${refFontSize}px`,
    fontFamily,
    fontWeight: 500,
    letterSpacing: '.02em',
    opacity: 0.9,
    marginTop: '0.5em',
    textAlign: theme.referenceAlign || align
  }

  const isLowerThird = theme.displayMode === 'lower-third'
  const vPos = theme.verticalPosition || 'center'
  const justify =
    isLowerThird || vPos === 'bottom'
      ? 'justify-end'
      : vPos === 'top'
        ? 'justify-start'
        : 'justify-center'

  const innerStyle: CSSProperties = isLowerThird
    ? { width: '100%', padding: '4% 6%', background: 'rgba(0,0,0,0.75)', textAlign: align }
    : {
        width: '100%',
        padding: `0 ${theme.horizontalPaddingPct ?? 8}%`,
        maxWidth: `${theme.maxWidthPct ?? 80}%`,
        margin: '0 auto',
        textAlign: align
      }

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" style={bgStyle}>
      <div className="absolute inset-0" style={overlayBg} />
      <div className={cn('absolute inset-0 flex flex-col', justify)}>
        {scale > 0 ? (
          verse ? (
            <div style={innerStyle}>
              <div style={verseStyle}>{verse.text}</div>
              <div style={refStyle}>{verse.reference}</div>
            </div>
          ) : (
            <div
              className="m-auto"
              style={{ color: 'rgba(255,255,255,0.3)', fontSize: `${15 * scale}px` }}
            >
              Bible Verse — waiting for a verse…
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Theme Designer Component
// ---------------------------------------------------------------------------

export function ThemeDesigner({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): ReactElement {
  const {
    livingTextOutputTheme: theme,
    setLivingTextOutputTheme: setTheme,
    livingTextLiveVerse: liveVerse
  } = useAdminBackendContext()

  const [savedThemes, setSavedThemes] = useState<SavedTheme[]>(loadSavedThemes)
  const [saveNameInput, setSaveNameInput] = useState('')
  const [customRes, setCustomRes] = useState(false)
  const [activeTab, setActiveTab] = useState<'background' | 'text' | 'layout' | 'library'>(
    'background'
  )
  // The controls rail floats over the full-bleed canvas; the operator can
  // hide it to see the pure output surface.
  const [controlsOpen, setControlsOpen] = useState(true)

  const set = useCallback(
    (patch: Partial<LivingTextOutputTheme>) => {
      setTheme((prev) => ({ ...prev, ...patch }))
    },
    [setTheme]
  )

  const handleSaveTheme = useCallback(() => {
    const name = saveNameInput.trim()
    if (!name) return
    const next = [...savedThemes.filter((t) => t.name !== name), { name, theme }]
    setSavedThemes(next)
    saveSavedThemes(next)
    setSaveNameInput('')
  }, [saveNameInput, savedThemes, theme])

  const handleDeleteTheme = useCallback(
    (name: string) => {
      const next = savedThemes.filter((t) => t.name !== name)
      setSavedThemes(next)
      saveSavedThemes(next)
    },
    [savedThemes]
  )

  const handleLoadTheme = useCallback(
    (saved: SavedTheme) => {
      setTheme(saved.theme)
    },
    [setTheme]
  )

  // Sample verse for preview
  const previewVerse: LivingTextOutputVerse = liveVerse ?? {
    text: 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
    reference: 'John 3:16 · NIV'
  }

  const tabs = [
    { id: 'background' as const, label: 'Background', icon: Image },
    { id: 'text' as const, label: 'Text', icon: Textbox },
    { id: 'layout' as const, label: 'Layout', icon: ArrowsInSimple },
    { id: 'library' as const, label: 'Themes', icon: FloppyDisk }
  ]

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="dark top-0 left-0 flex h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-black p-0 sm:max-w-none"
        aria-describedby={undefined}
      >
        {/* The output surface covers the whole designer — the theme background
            and verse fill everything, controls float on top. */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <DesignerCanvas theme={theme} verse={previewVerse} />

          {/* Floating top bar — sits BELOW the app-shell drag strip (fixed,
              z-50, top 36px, -webkit-app-region:drag). Anything inside the
              strip never receives real mouse clicks (elementFromPoint lies
              about app-regions), which is why the old top-0 bar made the
              tabs and close button dead and put the title under the macOS
              traffic lights. no-drag is belt-and-braces. */}
          <div className="absolute inset-x-0 top-9 z-20 flex h-12 items-center gap-3 border-b border-white/10 bg-black/80 px-4 [-webkit-app-region:no-drag]">
            <Palette className="size-4 text-primary" />
            <DialogTitle className="text-sm font-semibold">Theme Designer</DialogTitle>
            <div className="ml-2 flex gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors',
                    activeTab === tab.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  <tab.icon className="size-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
            <span className="ml-auto shrink-0 text-[0.625rem] text-muted-foreground">
              {theme.resolutionWidth}×{theme.resolutionHeight} ·{' '}
              {theme.displayMode === 'lower-third' ? 'lower-third' : 'fullscreen'} · changes apply
              to the output window in real-time
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 gap-1.5 text-xs"
              onClick={() => setControlsOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-3.5" />
              {controlsOpen ? 'Hide controls' : 'Show controls'}
            </Button>
            {/* The unmistakable way back out (Escape also closes). */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1.5 text-xs"
              title="Close theme designer (Esc)"
              onClick={onClose}
            >
              <X className="size-3.5" />
              Done
            </Button>
          </div>

          {/* Floating controls rail over the canvas (no backdrop-filter — it
              wedges the vibrancy compositor; near-opaque bg instead). */}
          {controlsOpen ? (
            <div className="absolute bottom-4 left-4 top-[92px] z-20 flex w-80 flex-col gap-4 overflow-y-auto rounded-lg border border-white/10 bg-neutral-950/95 p-4 shadow-2xl">
              {/* --- BACKGROUND TAB --- */}
              {activeTab === 'background' && (
                <>
                  <SectionHead icon={Image} title="Background" />

                  <Row label="Type">
                    <ToggleGroup
                      value={theme.backgroundType}
                      options={[
                        { label: 'Solid', value: 'solid' },
                        { label: 'Gradient', value: 'gradient' },
                        { label: 'Image', value: 'image' }
                      ]}
                      onChange={(v) =>
                        set({ backgroundType: v as LivingTextOutputTheme['backgroundType'] })
                      }
                    />
                  </Row>

                  {theme.backgroundType === 'solid' && (
                    <Row label="Color">
                      <ColorInput
                        value={theme.backgroundColor}
                        onChange={(v) => set({ backgroundColor: v })}
                      />
                    </Row>
                  )}

                  {theme.backgroundType === 'gradient' && (
                    <>
                      <Row label="Start color">
                        <ColorInput
                          value={theme.gradientColorStart}
                          onChange={(v) => set({ gradientColorStart: v })}
                        />
                      </Row>
                      <Row label="End color">
                        <ColorInput
                          value={theme.gradientColorEnd}
                          onChange={(v) => set({ gradientColorEnd: v })}
                        />
                      </Row>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Angle</span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {theme.gradientAngle}°
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={360}
                          step={5}
                          value={[theme.gradientAngle]}
                          onValueChange={([v]) => set({ gradientAngle: v })}
                        />
                      </div>
                    </>
                  )}

                  {theme.backgroundType === 'image' && (
                    <>
                      <div className="space-y-1.5">
                        <span className="text-xs text-muted-foreground">Image path / URL</span>
                        <Input
                          value={theme.backgroundImagePath ?? ''}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            set({ backgroundImagePath: e.target.value || null })
                          }
                          placeholder="file:///path/to/image.jpg or https://…"
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Image opacity</span>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {Math.round((theme.backgroundImageOpacity ?? 0.5) * 100)}%
                          </span>
                        </div>
                        <Slider
                          min={0}
                          max={1}
                          step={0.05}
                          value={[theme.backgroundImageOpacity ?? 0.5]}
                          onValueChange={([v]) => set({ backgroundImageOpacity: v })}
                        />
                      </div>
                    </>
                  )}

                  <div className="border-t border-border pt-3">
                    <SectionHead icon={Eye} title="Display Mode" />
                    <Row label="Mode">
                      <ToggleGroup
                        value={theme.displayMode}
                        options={[
                          { label: 'Full', value: 'fullscreen' },
                          { label: 'Lower-third', value: 'lower-third' }
                        ]}
                        onChange={(v) =>
                          set({ displayMode: v as LivingTextOutputTheme['displayMode'] })
                        }
                      />
                    </Row>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2">
                    <SectionHead icon={ArrowsOutSimple} title="Resolution" />
                    <div className="grid grid-cols-3 gap-1">
                      {RESOLUTIONS.map((r) => (
                        <button
                          key={r.label}
                          type="button"
                          onClick={() => {
                            set({ resolutionWidth: r.w, resolutionHeight: r.h })
                            setCustomRes(false)
                          }}
                          className={cn(
                            'rounded px-1.5 py-1 text-[0.6rem] transition-colors',
                            theme.resolutionWidth === r.w &&
                              theme.resolutionHeight === r.h &&
                              !customRes
                              ? 'bg-primary/10 text-primary border border-primary/30'
                              : 'text-muted-foreground hover:bg-accent border border-transparent'
                          )}
                        >
                          {r.w}×{r.h}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setCustomRes(true)}
                      className={cn(
                        'w-full rounded px-1.5 py-1 text-xs transition-colors',
                        customRes
                          ? 'bg-primary/10 text-primary border border-primary/30'
                          : 'text-muted-foreground hover:bg-accent border border-transparent'
                      )}
                    >
                      Custom
                    </button>
                    {customRes && (
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          value={theme.resolutionWidth}
                          onChange={(e) => set({ resolutionWidth: Number(e.target.value) })}
                          className="h-7 text-xs"
                          placeholder="Width"
                        />
                        <span className="self-center text-muted-foreground">×</span>
                        <Input
                          type="number"
                          value={theme.resolutionHeight}
                          onChange={(e) => set({ resolutionHeight: Number(e.target.value) })}
                          className="h-7 text-xs"
                          placeholder="Height"
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* --- TEXT TAB --- */}
              {activeTab === 'text' && (
                <>
                  <SectionHead icon={Textbox} title="Verse Text" />

                  <Row label="Color">
                    <ColorInput value={theme.textColor} onChange={(v) => set({ textColor: v })} />
                  </Row>

                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">Font family</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex h-7 w-full items-center justify-between rounded-md border border-input bg-background px-2 text-xs hover:bg-accent"
                        >
                          <span className="truncate" style={{ fontFamily: theme.fontFamily }}>
                            {SYSTEM_FONTS.find((f) => f.value === theme.fontFamily)?.label ??
                              'Custom'}
                          </span>
                          <CaretDown className="size-3 shrink-0 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-60 p-1" align="start">
                        {SYSTEM_FONTS.map((f) => (
                          <button
                            key={f.value}
                            type="button"
                            onClick={() => set({ fontFamily: f.value })}
                            className={cn(
                              'flex w-full items-center rounded px-2 py-1.5 text-sm hover:bg-accent',
                              theme.fontFamily === f.value && 'bg-primary/10 text-primary'
                            )}
                            style={{ fontFamily: f.value }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs text-muted-foreground">Font weight</span>
                    <div className="grid grid-cols-4 gap-0.5">
                      {FONT_WEIGHTS.map((w) => (
                        <button
                          key={w.value}
                          type="button"
                          onClick={() => set({ fontWeight: w.value })}
                          className={cn(
                            'rounded px-1 py-1 text-[0.6rem] transition-colors',
                            theme.fontWeight === w.value
                              ? 'bg-primary/10 text-primary border border-primary/30'
                              : 'text-muted-foreground hover:bg-accent border border-transparent'
                          )}
                          style={{ fontWeight: w.value }}
                        >
                          {w.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Font size</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {theme.fontSize}px
                      </span>
                    </div>
                    <Slider
                      min={18}
                      max={160}
                      step={2}
                      value={[theme.fontSize]}
                      onValueChange={([v]) => set({ fontSize: v })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Line height</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {theme.lineHeight.toFixed(2)}
                      </span>
                    </div>
                    <Slider
                      min={1}
                      max={2.5}
                      step={0.05}
                      value={[theme.lineHeight]}
                      onValueChange={([v]) => set({ lineHeight: v })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Letter spacing</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {theme.letterSpacing.toFixed(2)}em
                      </span>
                    </div>
                    <Slider
                      min={-0.1}
                      max={0.3}
                      step={0.01}
                      value={[theme.letterSpacing]}
                      onValueChange={([v]) => set({ letterSpacing: v })}
                    />
                  </div>

                  <div className="border-t border-border pt-3 space-y-2">
                    <SectionHead icon={MagicWand} title="Text Shadow" />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className="text-[0.625rem] text-muted-foreground">Blur</span>
                        <Input
                          type="number"
                          min={0}
                          max={80}
                          value={theme.textShadowBlur}
                          onChange={(e) => set({ textShadowBlur: Number(e.target.value) })}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[0.625rem] text-muted-foreground">Color</span>
                        <ColorInput
                          value={theme.textShadowColor}
                          onChange={(v) => set({ textShadowColor: v })}
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[0.625rem] text-muted-foreground">X offset</span>
                        <Input
                          type="number"
                          min={-40}
                          max={40}
                          value={theme.textShadowX}
                          onChange={(e) => set({ textShadowX: Number(e.target.value) })}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[0.625rem] text-muted-foreground">Y offset</span>
                        <Input
                          type="number"
                          min={-40}
                          max={40}
                          value={theme.textShadowY}
                          onChange={(e) => set({ textShadowY: Number(e.target.value) })}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2">
                    <SectionHead icon={Swap} title="Text Stroke / Outline" />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <span className="text-[0.625rem] text-muted-foreground">Width (px)</span>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step={0.5}
                          value={theme.textStrokeWidth}
                          onChange={(e) => set({ textStrokeWidth: Number(e.target.value) })}
                          className="h-7 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[0.625rem] text-muted-foreground">Color</span>
                        <ColorInput
                          value={theme.textStrokeColor}
                          onChange={(v) => set({ textStrokeColor: v })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2">
                    <SectionHead icon={Textbox} title="Reference Line" />
                    <Row label="Color">
                      <ColorInput
                        value={theme.referenceColor}
                        onChange={(v) => set({ referenceColor: v })}
                      />
                    </Row>
                    <Row label="Alignment">
                      <ToggleGroup
                        value={theme.referenceAlign}
                        options={[
                          { label: 'L', value: 'left' },
                          { label: 'C', value: 'center' },
                          { label: 'R', value: 'right' }
                        ]}
                        onChange={(v) => set({ referenceAlign: v as 'left' | 'center' | 'right' })}
                      />
                    </Row>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          Ref font size <span className="text-muted-foreground/50">(0 = auto)</span>
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {theme.referenceFontSize}px
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={80}
                        step={2}
                        value={[theme.referenceFontSize]}
                        onValueChange={([v]) => set({ referenceFontSize: v })}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* --- LAYOUT TAB --- */}
              {activeTab === 'layout' && (
                <>
                  <SectionHead icon={ArrowsInSimple} title="Text Alignment" />
                  <Row label="Align">
                    <ToggleGroup
                      value={theme.textAlign}
                      options={[
                        { label: 'Left', value: 'left' },
                        { label: 'Center', value: 'center' },
                        { label: 'Right', value: 'right' }
                      ]}
                      onChange={(v) => set({ textAlign: v as 'left' | 'center' | 'right' })}
                    />
                  </Row>

                  <div className="border-t border-border pt-3">
                    <SectionHead icon={ArrowsOutSimple} title="Vertical Position" />
                    <ToggleGroup
                      value={theme.verticalPosition}
                      options={[
                        { label: 'Top', value: 'top' },
                        { label: 'Center', value: 'center' },
                        { label: 'Bottom', value: 'bottom' }
                      ]}
                      onChange={(v) =>
                        set({ verticalPosition: v as LivingTextOutputTheme['verticalPosition'] })
                      }
                    />
                  </div>

                  <div className="border-t border-border pt-3 space-y-3">
                    <SectionHead icon={ArrowsInSimple} title="Padding & Width" />
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Horizontal padding</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {theme.horizontalPaddingPct}%
                        </span>
                      </div>
                      <Slider
                        min={0}
                        max={25}
                        step={1}
                        value={[theme.horizontalPaddingPct]}
                        onValueChange={([v]) => set({ horizontalPaddingPct: v })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Max text width</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {theme.maxWidthPct}%
                        </span>
                      </div>
                      <Slider
                        min={30}
                        max={100}
                        step={5}
                        value={[theme.maxWidthPct]}
                        onValueChange={([v]) => set({ maxWidthPct: v })}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* --- LIBRARY TAB --- */}
              {activeTab === 'library' && (
                <>
                  <SectionHead icon={FloppyDisk} title="Save Current Theme" />
                  <div className="flex gap-2">
                    <Input
                      value={saveNameInput}
                      onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setSaveNameInput(e.target.value)
                      }
                      placeholder="Theme name…"
                      className="h-7 flex-1 text-xs"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveTheme()
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={handleSaveTheme}
                      disabled={!saveNameInput.trim()}
                      className="gap-1.5"
                    >
                      <FloppyDisk className="size-3.5" />
                      Save
                    </Button>
                  </div>

                  <div className="border-t border-border pt-3">
                    <SectionHead icon={Eye} title="Saved Themes" />
                    {savedThemes.length === 0 ? (
                      <p className="text-center text-xs text-muted-foreground py-4">
                        No saved themes yet.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {savedThemes.map((saved) => (
                          <div
                            key={saved.name}
                            className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2"
                          >
                            <button
                              type="button"
                              onClick={() => handleLoadTheme(saved)}
                              className="flex-1 text-left text-sm font-medium text-foreground hover:text-primary transition-colors"
                            >
                              {saved.name}
                            </button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteTheme(saved.name)}
                            >
                              <Trash className="size-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
