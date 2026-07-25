import {
  type FormEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useState
} from 'react'

import { CircleNotch } from '@phosphor-icons/react'

import logoUrl from '@/assets/zemara-logo.png'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GateSurface } from '@/components/gate-surface'
import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { STORAGE_KEYS } from '@/lib/capture'

// The workspace-side wrapper: mounts the sign-in gate instead of the app
// until a staff session exists (or the user explicitly skips). Identity comes
// from the Rust secrets file via admin.auth.get, so a signed-in install goes
// straight to the workspace. `onGateChange` lets AppShell keep the window in
// its small gated size while this gate is up — setWindowGated has exactly one
// owner (AppShell), reported to from here.
export function ChurchSignInGate({
  children,
  onGateChange
}: {
  children: ReactNode
  onGateChange: (active: boolean) => void
}): ReactElement {
  const { identity, identityLoading } = useAdminBackendContext()
  const [skipped, setSkipped] = useState(
    () => localStorage.getItem(STORAGE_KEYS.churchSignInSkipped) !== null
  )
  // Gate while the stored session is still loading too — otherwise a
  // signed-out install would mount (and flash) the real workspace before the
  // identity check comes back. Signed-in users see a brief busy pane instead.
  const gating = identity === null && !skipped

  useEffect(() => {
    onGateChange(gating)
  }, [gating, onGateChange])

  const handleSkip = useCallback((): void => {
    localStorage.setItem(STORAGE_KEYS.churchSignInSkipped, 'skipped-v1')
    setSkipped(true)
  }, [])

  // The sidebar account menu's "Sign in to your church" row reopens the gate
  // after a skip — same event-bus pattern the workspace nav already uses.
  useEffect(() => {
    const reopen = (): void => {
      localStorage.removeItem(STORAGE_KEYS.churchSignInSkipped)
      setSkipped(false)
    }
    window.addEventListener('videorc:reopen-church-sign-in', reopen)
    return () => window.removeEventListener('videorc:reopen-church-sign-in', reopen)
  }, [])

  if (!gating) return <>{children}</>
  return (
    <GateSurface labelledBy="zemara-church-sign-in-title">
      {identityLoading ? (
        <div
          aria-live="polite"
          className="flex flex-1 flex-col items-center justify-center gap-3"
          role="status"
        >
          <CircleNotch className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Getting Zemara ready…</p>
        </div>
      ) : (
        <ChurchSignInPanel onSkip={handleSkip} />
      )}
    </GateSurface>
  )
}

// Church staff sign-in gate: the last first-run gate before the workspace
// mounts. Identifies WHO is at this desk and which church they belong to —
// the rk_ API key (Settings > Database) is only the machine credential.
// Signing in stores the session in the Rust secrets file, so later launches
// skip this gate. "Continue without signing in" is an explicit opt-out, also
// remembered; both can be reversed from the sidebar account menu.
export function ChurchSignInPanel({ onSkip }: { onSkip: () => void }): ReactElement {
  const { connection, signIn } = useAdminBackendContext()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? '')
  const [organization, setOrganization] = useState('')
  const [needsOrganization, setNeedsOrganization] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const hasStoredConnection = Boolean(connection?.baseUrl)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn({
        baseUrl: hasStoredConnection ? undefined : baseUrl.trim() || undefined,
        email: email.trim(),
        password,
        organization: organization.trim() || undefined
      })
      // Identity is now stored — the shell's gate chain advances on its own.
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      // The admin API answers 409 when this email+password exists at more
      // than one church — reveal the disambiguation field in that case.
      if (message.includes('more than one organization')) setNeedsOrganization(true)
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="flex items-start gap-3">
        <img alt="" className="size-10 shrink-0 rounded-xl" src={logoUrl} />
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground" id="zemara-church-sign-in-title">
            Sign in to your church
          </h2>
          <p className="text-sm text-muted-foreground">
            Connect this studio to your church&apos;s workspace — sermons, members, and live
            settings follow your account.
          </p>
        </div>
      </div>

      <form
        className="flex min-h-0 flex-1 flex-col gap-3"
        onSubmit={(event) => void handleSubmit(event)}
      >
        {!hasStoredConnection ? (
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="church-sign-in-base-url"
            >
              Admin server URL
            </label>
            <Input
              autoComplete="url"
              id="church-sign-in-base-url"
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://your-admin-server.com"
              required
              type="url"
              value={baseUrl}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="church-sign-in-email"
          >
            Email
          </label>
          <Input
            autoComplete="email"
            id="church-sign-in-email"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@yourchurch.org"
            required
            type="email"
            value={email}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor="church-sign-in-password"
          >
            Password
          </label>
          <Input
            autoComplete="current-password"
            id="church-sign-in-password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>

        {needsOrganization ? (
          <div className="flex flex-col gap-1.5">
            <label
              className="text-xs font-medium text-muted-foreground"
              htmlFor="church-sign-in-organization"
            >
              Organization name
            </label>
            <Input
              id="church-sign-in-organization"
              onChange={(event) => setOrganization(event.target.value)}
              placeholder="Your church name as registered"
              required
              value={organization}
            />
          </div>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <Button disabled={submitting} size="sm" type="button" variant="ghost" onClick={onSkip}>
            Continue without signing in
          </Button>
          <Button disabled={submitting} size="sm" type="submit">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  )
}
