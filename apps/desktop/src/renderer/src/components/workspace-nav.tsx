import {
  Bell,
  BookOpen,
  Broadcast,
  CalendarBlank,
  ClosedCaptioning,
  FilmReel,
  GearSix,
  ImageSquare,
  Monitor,
  MonitorPlay,
  Pulse,
  Quotes,
  Record,
  ShieldCheck,
  Sparkle,
  SquaresFour,
  TreeStructure,
  Users,
  VideoCamera,
  type Icon
} from '@phosphor-icons/react'
import { createContext, useContext } from 'react'

// Studio control pages, grouped under "Studio" in the sidebar: one click away, but
// they are FULL pages — studio content renders only on the Studio tab (user decision
// 2026-06-09, overriding the earlier push-rail idea). Sources is the single home for
// every capture device — screen/window, camera, AND microphone — so changing what
// gets captured never requires hunting across pages (UI rewrite plan, 2026-06-10).
export type StudioPanel = 'sources' | 'layouts' | 'assets' | 'live' | 'captions' | 'recording'

// Full pages: they replace the workspace content area.
export type WorkspaceTab =
  | 'studio'
  | StudioPanel
  | 'library'
  | 'sermons'
  | 'videos'
  | 'events'
  | 'members'
  | 'alerts'
  | 'livingText'
  | 'departments'
  | 'staffAccess'
  | 'ai'
  | 'diagnostics'
  | 'settings'

// Sidebar zones (ux-ia-refactor-plan): the stage row, then SETUP (the studio
// panels), then CONTENT, then MINISTRY, then SYSTEM. 'setup' rows come from
// STUDIO_PANELS. CONTENT/MINISTRY replaced a single flat "Library" zone
// (owner request 2026-07-17) — CONTENT is what you record/host (Library,
// Sermons, Videos, Publish), MINISTRY is audience-facing operations
// (Events, Members, Alerts).
export type WorkspaceTabGroup = 'stage' | 'content' | 'ministry' | 'system'

export type WorkspaceTabMeta = {
  id: WorkspaceTab
  label: string
  icon: Icon
  group: WorkspaceTabGroup
}

export type StudioPanelMeta = {
  id: StudioPanel
  label: string
  icon: Icon
  // The pre-rail tab id; kept as the `data-videorc-tab-trigger` value so smokes and
  // automation keep working across the C1 shell change.
  legacyTabId: string
}

export const WORKSPACE_TABS: WorkspaceTabMeta[] = [
  { id: 'studio', label: 'Studio', icon: VideoCamera, group: 'stage' },
  { id: 'library', label: 'Library', icon: FilmReel, group: 'content' },
  { id: 'sermons', label: 'Sermons', icon: BookOpen, group: 'content' },
  { id: 'videos', label: 'Videos', icon: MonitorPlay, group: 'content' },
  { id: 'ai', label: 'Publish', icon: Sparkle, group: 'content' },
  { id: 'events', label: 'Events', icon: CalendarBlank, group: 'ministry' },
  { id: 'members', label: 'Members', icon: Users, group: 'ministry' },
  { id: 'alerts', label: 'Alerts', icon: Bell, group: 'ministry' },
  { id: 'livingText', label: 'Bible Verse', icon: Quotes, group: 'ministry' },
  { id: 'departments', label: 'Departments', icon: TreeStructure, group: 'ministry' },
  { id: 'staffAccess', label: 'Staff & Access', icon: ShieldCheck, group: 'system' },
  { id: 'settings', label: 'Settings', icon: GearSix, group: 'system' },
  { id: 'diagnostics', label: 'Health', icon: Pulse, group: 'system' }
]

// Sidebar order mirrors the live workflow: pick sources, compose, go live, output.
// There is no Audio page — the microphone and mixer live on Sources with every
// other capture device. Labels renamed 2026-06-13 (ux-ia-refactor-plan); ids and
// legacyTabId stay so smokes and deep links keep working.
export const STUDIO_PANELS: StudioPanelMeta[] = [
  { id: 'sources', label: 'Sources', icon: Monitor, legacyTabId: 'sources' },
  { id: 'layouts', label: 'Scene', icon: SquaresFour, legacyTabId: 'layout' },
  { id: 'assets', label: 'Assets', icon: ImageSquare, legacyTabId: 'assets' },
  { id: 'live', label: 'Livestream', icon: Broadcast, legacyTabId: 'streaming' },
  { id: 'captions', label: 'Captions', icon: ClosedCaptioning, legacyTabId: 'captions' },
  { id: 'recording', label: 'Output', icon: Record, legacyTabId: 'recording' }
]

// Page shortcuts in sidebar order. Studio + the Setup pages + Library take ⌘1–⌘8,
// and Settings keeps the platform-standard ⌘,. Health intentionally has NO
// digit — it stays reachable via ⌘K (and the account menu). The main process emits
// the raw key ('1'–'9', ',', or a nav letter) and AppShell maps whatever is listed here.
// Sermons/Videos/Events/Members/Publish/Living Text arrived after every
// ⌘1–⌘9 slot was already spoken for (Studio, the six Setup panels, Library)
// — same single ⌘+key pattern as the rest, just letters instead of digits,
// chosen to avoid macOS/app-standard meanings (⌘V paste, ⌘M minimize, ⌘S
// save, ⌘N new, ⌘K search, ⌘P preview are all already spoken for or
// reserved).
export const WORKSPACE_SHORTCUTS: { digit: string; tab: WorkspaceTab }[] = [
  { digit: '1', tab: 'studio' },
  { digit: '2', tab: 'sources' },
  { digit: '3', tab: 'layouts' },
  { digit: '4', tab: 'assets' },
  { digit: '5', tab: 'live' },
  { digit: '6', tab: 'captions' },
  { digit: '7', tab: 'recording' },
  { digit: '8', tab: 'library' },
  { digit: 'R', tab: 'sermons' },
  { digit: 'I', tab: 'videos' },
  { digit: 'E', tab: 'events' },
  { digit: 'B', tab: 'members' },
  { digit: 'L', tab: 'alerts' },
  { digit: 'T', tab: 'livingText' },
  { digit: 'D', tab: 'departments' },
  { digit: 'U', tab: 'ai' },
  { digit: 'A', tab: 'staffAccess' },
  { digit: ',', tab: 'settings' }
]

export function shortcutDigitFor(tab: WorkspaceTab): string | undefined {
  return WORKSPACE_SHORTCUTS.find((entry) => entry.tab === tab)?.digit
}

export function workspaceTabLabel(tab: WorkspaceTab): string {
  return (
    WORKSPACE_TABS.find((entry) => entry.id === tab)?.label ??
    STUDIO_PANELS.find((entry) => entry.id === tab)?.label ??
    tab
  )
}

export function isStudioPanel(value: unknown): value is StudioPanel {
  return STUDIO_PANELS.some((panel) => panel.id === value)
}

export function isWorkspaceTab(value: unknown): value is WorkspaceTab {
  return WORKSPACE_TABS.some((tab) => tab.id === value) || isStudioPanel(value)
}

type WorkspaceNavValue = {
  active: WorkspaceTab
  setActive: (tab: WorkspaceTab) => void
  activeStudioPanel: StudioPanel | null
  openStudioPanel: (panel: StudioPanel) => void
  closeStudioPanel: () => void
}

export const WorkspaceNavContext = createContext<WorkspaceNavValue | null>(null)

export function useWorkspaceNav(): WorkspaceNavValue {
  const value = useContext(WorkspaceNavContext)
  if (!value) {
    throw new Error('useWorkspaceNav must be used within a WorkspaceNavContext provider')
  }
  return value
}
