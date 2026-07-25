import type { LivingTextOutputTheme, LivingTextOutputVerse, NdiAlphaMode } from '@/lib/backend'

/**
 * Canvas2D renderer that mirrors the Living Text output window
 * (livingTextOutputWindowHtml in main/index.ts) and the Theme Designer
 * preview so the NDI broadcast frame matches what the operator sees.
 *
 * Font metrics are authored against theme.resolutionWidth (default 1920) and
 * scaled by ndiWidth / resolutionWidth — the same rule the preview uses — so
 * 720p and 4K frames keep the same proportions as the designed output.
 *
 * CSS `text-wrap: balance` has no canvas equivalent; wrapping is greedy.
 */

export interface NdiVerseFrameInput {
  theme: LivingTextOutputTheme
  verse: LivingTextOutputVerse | null
  /** Pre-loaded background image (the producer caches it by path). */
  backgroundImage: HTMLImageElement | null
  alphaMode: NdiAlphaMode
}

interface WrappedText {
  lines: string[]
  lineHeightPx: number
  fontSizePx: number
}

/** CSS linear-gradient angle (0deg = to top, 90deg = to right) -> canvas points. */
function gradientEndpoints(
  angleDeg: number,
  width: number,
  height: number
): [number, number, number, number] {
  const rad = ((angleDeg % 360) * Math.PI) / 180
  const dirX = Math.sin(rad)
  const dirY = -Math.cos(rad)
  const half = (Math.abs(width * dirX) + Math.abs(height * dirY)) / 2
  const cx = width / 2
  const cy = height / 2
  return [cx - dirX * half, cy - dirY * half, cx + dirX * half, cy + dirY * half]
}

function drawBackgroundCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
): void {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function fontString(weight: number, sizePx: number, family: string): string {
  return `${weight} ${sizePx}px ${family}`
}

/** Chromium canvases honor ctx.letterSpacing; degrade gracefully elsewhere. */
function setLetterSpacing(ctx: CanvasRenderingContext2D, em: number, fontSizePx: number): void {
  const target = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if ('letterSpacing' in target) {
    target.letterSpacing = `${Math.max(0, em) * fontSizePx}px`
  }
}

/** Greedy word-wrap that preserves explicit newlines (CSS pre-wrap). */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
  fontSizePx: number
): WrappedText {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter((word) => word.length > 0)
    if (words.length === 0) {
      lines.push('')
      continue
    }
    let current = words[0]
    for (let index = 1; index < words.length; index += 1) {
      const candidate = `${current} ${words[index]}`
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate
      } else {
        lines.push(current)
        current = words[index]
      }
    }
    lines.push(current)
  }
  return { lines, lineHeightPx: fontSizePx * lineHeight, fontSizePx }
}

function applyShadow(
  ctx: CanvasRenderingContext2D,
  theme: LivingTextOutputTheme,
  scale: number
): void {
  if (theme.textShadowBlur > 0 || theme.textShadowX !== 0 || theme.textShadowY !== 0) {
    ctx.shadowColor = theme.textShadowColor || 'rgba(0,0,0,0.6)'
    ctx.shadowBlur = (theme.textShadowBlur || 0) * scale
    ctx.shadowOffsetX = (theme.textShadowX || 0) * scale
    ctx.shadowOffsetY = (theme.textShadowY || 2) * scale
  } else {
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  wrapped: WrappedText,
  options: {
    color: string
    strokeColor: string | null
    strokeWidthPx: number
    align: 'left' | 'center' | 'right'
    boxX: number
    boxWidth: number
    topY: number
  }
): void {
  const { lines, lineHeightPx, fontSizePx } = wrapped
  const halfLeading = (lineHeightPx - fontSizePx) / 2
  ctx.textAlign = options.align
  ctx.textBaseline = 'top'
  const x =
    options.align === 'left'
      ? options.boxX
      : options.align === 'right'
        ? options.boxX + options.boxWidth
        : options.boxX + options.boxWidth / 2

  ctx.fillStyle = options.color
  lines.forEach((line, index) => {
    const y = options.topY + index * lineHeightPx + halfLeading
    if (options.strokeColor && options.strokeWidthPx > 0) {
      // Centered outline: double width + fill over the inner half matches
      // the look of CSS -webkit-text-stroke.
      ctx.lineWidth = options.strokeWidthPx * 2
      ctx.strokeStyle = options.strokeColor
      ctx.lineJoin = 'round'
      ctx.strokeText(line, x, y)
    }
    ctx.fillText(line, x, y)
  })
}

export function renderNdiVerseFrame(canvas: HTMLCanvasElement, input: NdiVerseFrameInput): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { theme, verse, backgroundImage, alphaMode } = input
  const width = canvas.width
  const height = canvas.height
  const scale = width / (theme.resolutionWidth || 1920)

  ctx.save()
  ctx.clearRect(0, 0, width, height)

  const isLowerThird = theme.displayMode === 'lower-third'
  // Straight-alpha + lower-third is the OBS overlay workflow: leave the
  // surround transparent so the keyed band composites without color-keying.
  const paintBackground = !(isLowerThird && alphaMode === 'straightAlpha')

  // --- Background ---
  if (paintBackground) {
    const type = theme.backgroundType || 'solid'
    if (type === 'gradient') {
      const [x0, y0, x1, y1] = gradientEndpoints(theme.gradientAngle ?? 135, width, height)
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
      gradient.addColorStop(0, theme.gradientColorStart || '#0f0c29')
      gradient.addColorStop(1, theme.gradientColorEnd || '#302b63')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)
    } else if (type === 'image' && theme.backgroundImagePath && backgroundImage) {
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, width, height)
      drawBackgroundCover(ctx, backgroundImage, width, height)
      ctx.fillStyle = `rgba(0,0,0,${1 - (theme.backgroundImageOpacity ?? 0.5)})`
      ctx.fillRect(0, 0, width, height)
    } else {
      ctx.fillStyle = theme.backgroundColor || '#000'
      ctx.fillRect(0, 0, width, height)
    }
  }

  // --- Placeholder when no verse is live ---
  if (!verse) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = fontString(500, 15 * scale, theme.fontFamily || 'system-ui, sans-serif')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Bible Verse — waiting for a verse…', width / 2, height / 2)
    ctx.restore()
    return
  }

  // --- Measure the verse + reference blocks ---
  const fontFamily = theme.fontFamily || 'system-ui, sans-serif'
  const verseFontSize = (theme.fontSize || 56) * scale
  const verseWeight = theme.fontWeight || 600
  const lineHeight = theme.lineHeight || 1.35
  const refFontSize =
    (theme.referenceFontSize > 0 ? theme.referenceFontSize : (theme.fontSize || 56) * 0.4) * scale
  const refGapPx = refFontSize * 0.5 // CSS margin-top: 0.5em (of the ref font)

  // Content box: fullscreen honors horizontalPaddingPct + maxWidthPct;
  // lower-third content sits inside the band padding (6% of width).
  const bandPadX = width * 0.06
  const bandPadY = width * 0.04
  const fullContentWidth = Math.min(
    width * (1 - (2 * (theme.horizontalPaddingPct ?? 8)) / 100),
    (width * (theme.maxWidthPct ?? 80)) / 100
  )
  const contentWidth = isLowerThird ? width - 2 * bandPadX : fullContentWidth
  const contentX = isLowerThird ? bandPadX : (width - fullContentWidth) / 2

  ctx.font = fontString(verseWeight, verseFontSize, fontFamily)
  setLetterSpacing(ctx, theme.letterSpacing || 0, verseFontSize)
  const verseBlock = wrapText(ctx, verse.text, contentWidth, lineHeight, verseFontSize)

  ctx.font = fontString(Math.min(verseWeight, 500), refFontSize, fontFamily)
  setLetterSpacing(ctx, 0.02, refFontSize)
  const refBlock = wrapText(ctx, verse.reference, contentWidth, 1.3, refFontSize)

  const blockHeight =
    verseBlock.lines.length * verseBlock.lineHeightPx +
    refGapPx +
    refBlock.lines.length * refBlock.lineHeightPx

  // --- Vertical placement ---
  const verticalPosition = isLowerThird ? 'bottom' : theme.verticalPosition || 'center'
  let contentTop: number
  if (verticalPosition === 'top') {
    contentTop = height * 0.06
  } else if (verticalPosition === 'bottom') {
    contentTop = isLowerThird ? height - bandPadY - blockHeight : height * 0.94 - blockHeight
  } else {
    contentTop = (height - blockHeight) / 2
  }

  // --- Lower-third band ---
  if (isLowerThird) {
    ctx.fillStyle = 'rgba(0,0,0,0.75)'
    ctx.fillRect(0, contentTop - bandPadY, width, blockHeight + 2 * bandPadY)
  }

  // --- Text ---
  applyShadow(ctx, theme, scale)
  const strokeColor = theme.textStrokeWidth > 0 ? theme.textStrokeColor || '#000000' : null
  const strokeWidthPx = (theme.textStrokeWidth || 0) * scale
  const align = theme.textAlign || 'center'
  const refAlign = theme.referenceAlign || align

  ctx.font = fontString(verseWeight, verseFontSize, fontFamily)
  setLetterSpacing(ctx, theme.letterSpacing || 0, verseFontSize)
  drawTextBlock(ctx, verseBlock, {
    color: theme.textColor || '#fff',
    strokeColor,
    strokeWidthPx,
    align,
    boxX: contentX,
    boxWidth: contentWidth,
    topY: contentTop
  })

  ctx.font = fontString(Math.min(verseWeight, 500), refFontSize, fontFamily)
  setLetterSpacing(ctx, 0.02, refFontSize)
  drawTextBlock(ctx, refBlock, {
    color: theme.referenceColor || '#f5c451',
    strokeColor,
    strokeWidthPx,
    align: refAlign,
    boxX: contentX,
    boxWidth: contentWidth,
    topY: contentTop + verseBlock.lines.length * verseBlock.lineHeightPx + refGapPx
  })

  ctx.restore()
}
