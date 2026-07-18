import { type ReactElement, useCallback, useRef, useState } from 'react'

import logoUrl from '@/assets/zemara-logo.png'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'

// PLACEHOLDER — replace with the real Terms of Service / EULA before this
// ships to anyone outside development. This text is not legal advice and
// creates no binding agreement as written.
const TERMS_TEXT = `ZEMARA TERMS OF SERVICE (PLACEHOLDER)

Last updated: [DATE]

PLEASE READ THESE TERMS CAREFULLY BEFORE USING ZEMARA. BY CLICKING "AGREE" YOU
AGREE TO BE BOUND BY ALL OF THE TERMS AND CONDITIONS BELOW. IF YOU DO NOT AGREE
TO THESE TERMS, DO NOT USE ZEMARA.

1. General
This placeholder stands in for the real Terms of Service. Replace this entire
block with your actual, reviewed legal terms before distributing Zemara to
any user outside your development team.

2. Your account and data
Zemara connects to a prophet-roja-admin backend you configure yourself. No
database credentials are stored in Zemara — only a base URL and API key,
kept in the local OS secret store.

3. Acceptable use
[Add your acceptable-use terms here.]

4. Liability
[Add your liability and warranty terms here.]

5. Changes to these terms
Re-acceptance is required whenever this text changes — bump TERMS_VERSION
below when you edit TERMS_TEXT, and every installed copy of Zemara will show
this gate again on next launch, exactly like Xcode re-prompting its SDK
license on every major version.

6. Contact
[Add a contact method for legal questions.]
`

// Bump this whenever TERMS_TEXT changes — it's what actually triggers
// re-prompting existing users, independent of the app's own version number
// (mirrors how App Store apps version their EULA separately from the build).
export const TERMS_VERSION = 'placeholder-v1'

// How close to the bottom (px) counts as "reached the end" — exact-zero is
// too strict across browsers/zoom levels, a few px of slack is standard.
const SCROLL_BOTTOM_THRESHOLD_PX = 24

function downloadTermsText(): void {
  const blob = new Blob([TERMS_TEXT], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'Zemara Terms of Service.txt'
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * First-run legal gate, modeled on the installer-style License Agreement
 * convention Apple's own dev tools use (Xcode, Icon Composer): icon +
 * title/subtitle, scrollable terms body, Save / Disagree / Agree footer.
 *
 * Two behaviors that make this a real gate rather than a lookalike:
 * - Agree stays disabled until the user scrolls the terms to the bottom —
 *   the standard "you must actually see the whole thing" EULA pattern
 *   (InstallShield/NSIS installers, and Xcode's own SDK agreement, work the
 *   same way). Text short enough to need no scrolling counts as satisfied
 *   immediately.
 * - Disagree really quits the app (via the app:quit IPC channel) rather than
 *   just leaving the dialog open — matching how declining an installer's
 *   EULA cancels the install instead of pretending to continue.
 */
export function TermsAgreementDialog({
  open,
  onAgree
}: {
  open: boolean
  onAgree: () => void
}): ReactElement {
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [quitting, setQuitting] = useState(false)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  const checkScrollPosition = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight
    if (distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD_PX) {
      setScrolledToBottom(true)
    }
  }, [])

  const handleViewportRef = useCallback(
    (element: HTMLDivElement | null) => {
      viewportRef.current = element
      // Content that already fits without scrolling needs no gesture to
      // "reach the bottom" — check once on mount, same as the scroll handler.
      checkScrollPosition(element)
    },
    [checkScrollPosition]
  )

  const handleDisagree = (): void => {
    setQuitting(true)
    void window.videorc?.quitApp?.()
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="flex max-h-[85vh] max-w-lg flex-col gap-4"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="flex items-start gap-3">
          <img alt="" className="size-10 shrink-0 rounded-xl" src={logoUrl} />
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-foreground">Zemara Agreement</h2>
            <p className="text-sm text-muted-foreground">
              You must agree to the terms below in order to use Zemara.
            </p>
          </div>
        </div>

        <div
          className="h-80 overflow-y-auto rounded-xl border bg-input/30"
          ref={handleViewportRef}
          onScroll={(event) => checkScrollPosition(event.currentTarget)}
        >
          <pre className="whitespace-pre-wrap p-4 font-sans text-xs leading-relaxed text-muted-foreground">
            {TERMS_TEXT}
          </pre>
        </div>

        {!scrolledToBottom ? (
          <p className="text-xs text-muted-foreground">Scroll to the bottom to enable Agree.</p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Button disabled={quitting} size="sm" variant="ghost" onClick={downloadTermsText}>
            Save…
          </Button>
          <div className="flex gap-2">
            <Button disabled={quitting} size="sm" variant="outline" onClick={handleDisagree}>
              Disagree
            </Button>
            <Button disabled={quitting || !scrolledToBottom} size="sm" onClick={onAgree}>
              Agree
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
