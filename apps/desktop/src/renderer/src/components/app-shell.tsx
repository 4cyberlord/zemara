import { ChatCircle } from '@phosphor-icons/react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactElement } from 'react'

import { AdminBackendProvider } from '@/components/admin-backend-provider'
import { CommandPalette } from '@/components/command-palette'
import { FooterActionBar, FooterActionDivider } from '@/components/footer-action-bar'
import { Sidebar } from '@/components/sidebar'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'

import type { StatusDotTone } from '@/components/status-dot'
import { StudioTab } from '@/components/tabs/studio-tab'
import {
  WORKSPACE_SHORTCUTS,
  WorkspaceNavContext,
  isStudioPanel,
  isWorkspaceTab,
  workspaceTabLabel,
  type StudioPanel,
  type WorkspaceTab
} from '@/components/workspace-nav'
import { TermsAgreementDialog, TERMS_VERSION } from '@/components/terms-agreement-dialog'
import { WhatsNewDialog } from '@/components/whats-new-dialog'
import { useStudioAudio, useStudioCore, useStudioShell } from '@/hooks/use-studio'
import { useWhatsNew } from '@/hooks/use-whats-new'
import { ONBOARDING_DISMISSED_VALUE, STORAGE_KEYS } from '@/lib/capture'
import { WHATS_NEW_STORAGE_KEY } from '@/lib/whats-new'
import { displayKeyGlyph } from '@/lib/platform'
import { isActiveRecordingState } from '@/lib/format'
import {
  isMediaAccessSnapshotReady,
  shouldShowPermissionsOnboarding,
  systemAccessRows
} from '@/lib/system-access'
import { cn } from '@/lib/utils'

// Studio is the launch surface and stays eager. Every other workspace is loaded
// only on first navigation, then retained by the browser module cache. This keeps
// AI, Library, Diagnostics, and their heavier dependencies out of first paint.
const AiTab = lazy(async () => ({ default: (await import('@/components/tabs/ai-tab')).AiTab }))
const AssetsTab = lazy(async () => ({
  default: (await import('@/components/tabs/assets-tab')).AssetsTab
}))
const CaptionsTab = lazy(async () => ({
  default: (await import('@/components/tabs/captions-tab')).CaptionsTab
}))
const DiagnosticsTab = lazy(async () => ({
  default: (await import('@/components/tabs/diagnostics-tab')).DiagnosticsTab
}))
const loadLayoutTab = () => import('@/components/tabs/layout-tab')
const LayoutTab = lazy(async () => ({ default: (await loadLayoutTab()).LayoutTab }))
const LibraryTab = lazy(async () => ({
  default: (await import('@/components/tabs/library-tab')).LibraryTab
}))
const SermonsTab = lazy(async () => ({
  default: (await import('@/components/tabs/sermons-tab')).SermonsTab
}))
const VideosTab = lazy(async () => ({
  default: (await import('@/components/tabs/videos-tab')).VideosTab
}))
const EventsTab = lazy(async () => ({
  default: (await import('@/components/tabs/events-tab')).EventsTab
}))
const MembersTab = lazy(async () => ({
  default: (await import('@/components/tabs/members-tab')).MembersTab
}))
const AlertsTab = lazy(async () => ({
  default: (await import('@/components/tabs/alerts-tab')).AlertsTab
}))
const LivingTextTab = lazy(async () => ({
  default: (await import('@/components/tabs/living-text-tab')).LivingTextTab
}))
const DepartmentsTab = lazy(async () => ({
  default: (await import('@/components/tabs/departments-tab')).DepartmentsTab
}))
const StaffAccessTab = lazy(async () => ({
  default: (await import('@/components/tabs/staff-access-tab')).StaffAccessTab
}))
const RecordingTab = lazy(async () => ({
  default: (await import('@/components/tabs/recording-tab')).RecordingTab
}))
const loadSettingsTab = () => import('@/components/tabs/settings-tab')
const SettingsTab = lazy(async () => ({ default: (await loadSettingsTab()).SettingsTab }))
const loadSourcesTab = () => import('@/components/tabs/sources-tab')
const SourcesTab = lazy(async () => ({ default: (await loadSourcesTab()).SourcesTab }))
const StreamingTab = lazy(async () => ({
  default: (await import('@/components/tabs/streaming-tab')).StreamingTab
}))
const PermissionsOnboardingDialog = lazy(async () => ({
  default: (await import('@/components/permissions-onboarding-dialog')).PermissionsOnboardingDialog
}))

function WorkspaceTabFallback(): ReactElement {
  return (
    <div
      aria-live="polite"
      className="flex min-h-40 items-center justify-center text-xs text-muted-foreground"
      role="status"
    >
      Loading workspace…
    </div>
  )
}

function PermissionsOnboardingGate({
  open,
  onOpen,
  onComplete
}: {
  open: boolean
  onOpen: () => void
  onComplete: () => void
}): ReactElement {
  const { wsStatus, deviceList, mediaAccess, runtimeInfo } = useStudioCore()
  const { audioMeter } = useStudioAudio()
  const evaluatedRef = useRef(false)
  const dialogMountedRef = useRef(open)
  const backendReady = wsStatus === 'connected' && deviceList.devices.length > 0
  const mediaAccessReady = runtimeInfo !== null && isMediaAccessSnapshotReady(mediaAccess)

  if (open) {
    dialogMountedRef.current = true
  }

  useEffect(() => {
    if (evaluatedRef.current || !backendReady || !mediaAccessReady) {
      return
    }
    evaluatedRef.current = true
    const dismissed = localStorage.getItem(STORAGE_KEYS.onboarding) !== null
    const rows = systemAccessRows({
      deviceList,
      audioMeter,
      platform: runtimeInfo?.platform,
      mediaAccess
    })
    if (shouldShowPermissionsOnboarding({ rows, dismissed, backendReady, mediaAccessReady })) {
      onOpen()
    }
  }, [
    audioMeter,
    backendReady,
    deviceList,
    mediaAccess,
    mediaAccessReady,
    onOpen,
    runtimeInfo?.platform
  ])

  return (
    <Suspense fallback={null}>
      {dialogMountedRef.current ? (
        <PermissionsOnboardingDialog open={open} onComplete={onComplete} />
      ) : null}
    </Suspense>
  )
}

export function AppShell(): ReactElement {
  const {
    wsStatus,
    backendConnected,
    recordingState,
    runtimeInfo,
    entitlementTier,
    previewWindowOpen,
    togglePreviewWindow,
    notesWindowOpen,
    openNotesWindow,
    closeNotesWindow,
    commentsWindowOpen,
    openCommentsWindow,
    closeCommentsWindow,
    toggleCommentsWindow,
    toggleCaptionsWindow
  } = useStudioShell()
  const [active, setActive] = useState<WorkspaceTab>('studio')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(
    () => localStorage.getItem(STORAGE_KEYS.termsAcceptedVersion) === TERMS_VERSION
  )
  // A truly brand-new install (never accepted terms, never initialized the
  // what's-new tracker) gets a welcome "what's new" right after agreeing,
  // instead of the normal post-update-only behavior — captured once at
  // mount, before acceptTerms can change what these keys read.
  const isFreshInstallRef = useRef(
    localStorage.getItem(STORAGE_KEYS.termsAcceptedVersion) === null &&
      localStorage.getItem(WHATS_NEW_STORAGE_KEY) === null
  )
  const [welcomePending, setWelcomePending] = useState(false)
  const whatsNew = useWhatsNew(runtimeInfo?.version)
  const acceptTerms = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.termsAcceptedVersion, TERMS_VERSION)
    setTermsAccepted(true)
    if (isFreshInstallRef.current) {
      setWelcomePending(true)
      void whatsNew.showLatest().finally(() => setWelcomePending(false))
    }
  }, [whatsNew])
  // True only for the fresh-install path, from the moment terms are agreed
  // to until the welcome what's-new either shows or resolves to "nothing
  // available" — bridges the async gap so the real app never flashes into
  // view in between. Routine post-update what's-new (existing users) is
  // unaffected — that still overlays the already-familiar app as before.
  const showingWelcomeGate = isFreshInstallRef.current && (welcomePending || whatsNew.open)
  const showingFirstRunGate = !termsAccepted || showingWelcomeGate
  // Shrinks the window to a small centered panel while a gate is showing —
  // a native-style license panel, not a full workspace window with a small
  // dialog floating inside a mostly-empty black rectangle.
  useEffect(() => {
    void window.videorc?.setWindowGated?.(showingFirstRunGate)
  }, [showingFirstRunGate])
  const modKey = displayKeyGlyph('⌘', runtimeInfo?.platform)
  const shiftKey = displayKeyGlyph('⇧', runtimeInfo?.platform)

  // Keep first paint Studio-only, then warm the three most common setup pages
  // from local app assets once Chromium is idle. Navigation stays instant
  // without putting these modules into the eager entry chunk.
  useEffect(() => {
    const prefetch = (): void => {
      void Promise.allSettled([loadSourcesTab(), loadLayoutTab(), loadSettingsTab()])
    }
    if (typeof window.requestIdleCallback === 'function') {
      const requestId = window.requestIdleCallback(prefetch, { timeout: 5000 })
      return () => window.cancelIdleCallback(requestId)
    }
    const timer = window.setTimeout(prefetch, 2000)
    return () => window.clearTimeout(timer)
  }, [])

  // Studio control pages are ordinary tabs grouped under "Studio" in the sidebar.
  const openStudioPanel = useCallback((panel: StudioPanel) => {
    setActive(panel)
  }, [])

  const closeStudioPanel = useCallback(() => {
    setActive('studio')
  }, [])

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(STORAGE_KEYS.onboarding, ONBOARDING_DISMISSED_VALUE)
    setOnboardingOpen(false)
  }, [])

  // Settings' "Set up permissions": force-open regardless of grants or the
  // dismissal flag — no flag clearing, closing just re-dismisses.
  const openPermissionsSetup = useCallback(() => {
    setOnboardingOpen(true)
  }, [])

  const openInAi = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId)
    setActive('ai')
  }, [])

  // D6: the post-recording toast funnels here; clearing the selection lets
  // Publish preselect the newest completed session (the one just saved).
  useEffect(() => {
    const onOpenPublish = (): void => {
      setSelectedSessionId(null)
      setActive('ai')
    }
    window.addEventListener('videorc:open-publish', onOpenPublish)
    return () => window.removeEventListener('videorc:open-publish', onOpenPublish)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setCommandOpen((value) => !value)
      }
      if (event.key.toLowerCase() === 'p' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void togglePreviewWindow()
      }
      if (
        runtimeInfo?.notesWindowEnabled &&
        event.key.toLowerCase() === 'n' &&
        event.shiftKey &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        if (notesWindowOpen) {
          void closeNotesWindow()
        } else {
          void openNotesWindow()
        }
      }
      if (
        runtimeInfo?.commentsWindowEnabled &&
        event.key.toLowerCase() === 'j' &&
        event.shiftKey &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        void toggleCommentsWindow()
      }
      if (event.key.toLowerCase() === 'c' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void toggleCaptionsWindow()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [
    closeNotesWindow,
    notesWindowOpen,
    openNotesWindow,
    runtimeInfo?.commentsWindowEnabled,
    runtimeInfo?.notesWindowEnabled,
    toggleCommentsWindow,
    toggleCaptionsWindow,
    togglePreviewWindow
  ])

  // ⌘1–⌘9 / ⌘, arrive from the main process (Chromium swallows ⌘+digit before
  // the renderer keydown — see main's before-input-event handler). Map the raw
  // key to a page here, where navigation state lives. FX6: the IPC path
  // bypasses dialog focus entirely, so navigating behind an open modal has to
  // be gated here explicitly (ref — the subscription outlives renders).
  const modalOpenRef = useRef(false)
  modalOpenRef.current = onboardingOpen || whatsNew.open
  useEffect(() => {
    const off = window.videorc?.onShortcutNavigate?.((key) => {
      if (modalOpenRef.current) {
        return
      }
      const shortcut = WORKSPACE_SHORTCUTS.find((entry) => entry.digit === key)
      if (shortcut) {
        setActive(shortcut.tab)
      }
    })
    return off
  }, [])

  useEffect(() => {
    const onWorkspaceNavigate = (event: Event): void => {
      const tab = (event as CustomEvent<{ tab?: unknown }>).detail?.tab
      if (isWorkspaceTab(tab)) {
        setActive(tab)
      }
    }
    window.addEventListener('videorc:navigate-workspace', onWorkspaceNavigate)
    return () => window.removeEventListener('videorc:navigate-workspace', onWorkspaceNavigate)
  }, [])

  const live = isActiveRecordingState(recordingState)
  const statusTone: StatusDotTone = live
    ? 'error'
    : backendConnected
      ? 'good'
      : wsStatus === 'failed'
        ? 'error'
        : 'warn'
  const statusLabel = live ? recordingState : wsStatus

  return (
    <WorkspaceNavContext.Provider
      value={{
        active,
        setActive,
        activeStudioPanel: isStudioPanel(active) ? active : null,
        openStudioPanel,
        closeStudioPanel
      }}
    >
      {/* hiddenInset hides the OS title bar; this strip is the window's drag
          handle (the traffic lights sit inside it) and the shell pads below. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-50 h-9 [-webkit-app-region:drag]" />
      {/* No bg here: body already wears the one translucent glass coat, and a
          second 75% layer would stack to near-opaque and hide the vibrancy. */}
      {/* AdminBackendProvider lives at the shell root — one connection/state
          instance shared by Sermons/Videos/Events/Members/Alerts, so it
          survives tab switches instead of resetting each time (see
          admin-backend-provider.tsx). */}
      <AdminBackendProvider>
      {!termsAccepted ? (
        <TermsAgreementDialog open onAgree={acceptTerms} />
      ) : showingWelcomeGate ? (
        <WhatsNewDialog
          entry={whatsNew.entry}
          open={whatsNew.open}
          onClose={whatsNew.dismiss}
        />
      ) : (
      <div className="flex min-h-screen pt-9 text-foreground" data-videorc-active-tab={active}>
        <Sidebar
          active={active}
          activeStudioPanel={isStudioPanel(active) ? active : null}
          accountTier={entitlementTier}
          onSelect={setActive}
          onSelectStudioPanel={openStudioPanel}
          statusTone={statusTone}
          statusLabel={statusLabel}
          live={live}
          onOpenCommand={() => setCommandOpen(true)}
          platform={runtimeInfo?.platform}
        />

        <main className="flex h-[calc(100vh-2.25rem)] flex-1 flex-col">
          {/* Library manages its own scroll (pinned header/toolbar, only the
              table scrolls), so it fills the bounded height instead of the
              shell scrolling the whole tab. Living Text is a full-bleed
              production dashboard (its own panel grid, not prose content),
              so it skips the padded max-width wrapper entirely. Every other
              tab scrolls as one. */}
          <div
            className={cn(
              'min-h-0 flex-1',
              active === 'library' || active === 'livingText'
                ? 'flex flex-col'
                : 'app-scroll-region overflow-y-auto'
            )}
          >
            {active === 'livingText' ? (
              <Suspense fallback={<WorkspaceTabFallback />}>
                <LivingTextTab />
              </Suspense>
            ) : (
              // pt-4 matches the sidebar header's py-4 so every tab's content
              // top-aligns with the start of the sidebar.
              <div
                className={cn(
                  'mx-auto w-full max-w-[1600px] px-10 pt-4',
                  active === 'library' ? 'flex min-h-0 flex-1 flex-col pb-4' : 'pb-8'
                )}
              >
                <Suspense fallback={<WorkspaceTabFallback />}>
                  {active === 'studio' ? <StudioTab /> : null}
                  {active === 'sources' ? <SourcesTab /> : null}
                  {active === 'layouts' ? <LayoutTab /> : null}
                  {active === 'assets' ? <AssetsTab /> : null}
                  {active === 'live' ? <StreamingTab /> : null}
                  {active === 'captions' ? <CaptionsTab /> : null}
                  {active === 'recording' ? <RecordingTab /> : null}
                  {active === 'library' ? <LibraryTab onOpenInAi={openInAi} /> : null}
                  {active === 'sermons' ? <SermonsTab /> : null}
                  {active === 'videos' ? <VideosTab /> : null}
                  {active === 'events' ? <EventsTab /> : null}
                  {active === 'members' ? <MembersTab /> : null}
                  {active === 'alerts' ? <AlertsTab /> : null}
                  {active === 'departments' ? <DepartmentsTab /> : null}
                  {active === 'staffAccess' ? <StaffAccessTab /> : null}
                  {active === 'ai' ? (
                    <AiTab
                      selectedSessionId={selectedSessionId}
                      setSelectedSessionId={setSelectedSessionId}
                    />
                  ) : null}
                  {active === 'diagnostics' ? <DiagnosticsTab /> : null}
                  {active === 'settings' ? (
                    <SettingsTab
                      onOpenPermissionsSetup={openPermissionsSetup}
                      onShowWhatsNew={whatsNew.showLatest}
                    />
                  ) : null}
                </Suspense>
              </div>
            )}
          </div>
          {/* Global footer action bar: the shell's real shortcuts, always
              advertised (videorc-design keyboard-first rule). */}
          <FooterActionBar
            leading={<span>{workspaceTabLabel(active)}</span>}
            className="bg-background/60"
          >
            <Button size="sm" variant="ghost" onClick={() => setCommandOpen(true)}>
              Search
              <KbdGroup>
                <Kbd>{modKey}</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </Button>
            <FooterActionDivider />
            <Button size="sm" variant="ghost" onClick={() => void togglePreviewWindow()}>
              {previewWindowOpen ? 'Close Preview' : 'Open Preview'}
              <KbdGroup>
                <Kbd>{modKey}</Kbd>
                <Kbd>P</Kbd>
              </KbdGroup>
            </Button>
            {/* Flags default ON and runtimeInfo lands async — treating null
                as enabled keeps the footer at its final width from the first
                paint instead of growing when the fetch resolves. */}
            {runtimeInfo?.notesWindowEnabled !== false ? (
              <>
                <FooterActionDivider />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    notesWindowOpen ? void closeNotesWindow() : void openNotesWindow()
                  }
                >
                  {notesWindowOpen ? 'Close Notes' : 'Open Notes'}
                  <KbdGroup>
                    <Kbd>{modKey}</Kbd>
                    <Kbd>{shiftKey}</Kbd>
                    <Kbd>N</Kbd>
                  </KbdGroup>
                </Button>
              </>
            ) : null}
            {runtimeInfo?.commentsWindowEnabled !== false ? (
              <>
                <FooterActionDivider />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    commentsWindowOpen ? void closeCommentsWindow() : void openCommentsWindow()
                  }
                >
                  <ChatCircle data-icon="inline-start" />
                  {commentsWindowOpen ? 'Close Comments' : 'Open Comments'}
                  <KbdGroup>
                    <Kbd>{modKey}</Kbd>
                    <Kbd>{shiftKey}</Kbd>
                    <Kbd>J</Kbd>
                  </KbdGroup>
                </Button>
              </>
            ) : null}
          </FooterActionBar>
        </main>

        <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
        <PermissionsOnboardingGate
          open={onboardingOpen}
          onOpen={openPermissionsSetup}
          onComplete={completeOnboarding}
        />
        {/* Post-update highlights for already-onboarded users; suppressed
            behind permissions onboarding. The fresh-install welcome case is
            handled by the gate above this branch, before the app ever mounts. */}
        <WhatsNewDialog
          entry={whatsNew.entry}
          open={whatsNew.open && !onboardingOpen}
          onClose={whatsNew.dismiss}
        />
      </div>
      )}
      </AdminBackendProvider>
    </WorkspaceNavContext.Provider>
  )
}
