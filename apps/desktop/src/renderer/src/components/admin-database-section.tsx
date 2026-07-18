import { CheckCircle, CircleNotch, Database, Warning, XCircle } from '@phosphor-icons/react'
import { useEffect, useState, type ReactElement } from 'react'

import { PanelSection } from '@/components/panel-section'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAdminBackend, type UseAdminBackend } from '@/hooks/use-admin-backend'

/**
 * Settings > Database: the connection Zemara uses to read/write Sermons
 * against your prophet-roja-admin deployment. No database credentials ever
 * live here — just a base URL + API key, sent as a Bearer token to that
 * app's existing /api/admin/* REST API (owner decision 2026-07-15: keep the
 * API external, never bake DB access into this app).
 */
export function AdminDatabaseSection(): ReactElement {
  const admin = useAdminBackend()
  return <AdminDatabaseSectionView admin={admin} />
}

function AdminDatabaseSectionView({ admin }: { admin: UseAdminBackend }): ReactElement {
  const { connection, connectionLoading, connectionError, saveConnection, clearConnection, testConnection } =
    admin

  const [baseUrlDraft, setBaseUrlDraft] = useState('')
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [savePending, setSavePending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testPending, setTestPending] = useState(false)
  const [testResult, setTestResult] = useState<
    { reachable: boolean; databaseOk: boolean; authOk: boolean; message: string } | null
  >(null)
  const [registerOpen, setRegisterOpen] = useState(false)

  // Seed the draft from the stored connection once it loads — but only once,
  // so it doesn't stomp on text the user is actively editing.
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (seeded || connectionLoading) return
    setBaseUrlDraft(connection?.baseUrl ?? '')
    setSeeded(true)
  }, [seeded, connectionLoading, connection])

  const handleTestConnection = (): void => {
    setTestPending(true)
    setTestResult(null)
    void testConnection(baseUrlDraft, apiKeyDraft || '')
      .then(setTestResult)
      .catch((error: unknown) =>
        setTestResult({
          reachable: false,
          databaseOk: false,
          authOk: false,
          message: error instanceof Error ? error.message : String(error)
        })
      )
      .finally(() => setTestPending(false))
  }

  const handleSave = (): void => {
    setSavePending(true)
    setSaveError(null)
    void saveConnection(baseUrlDraft, apiKeyDraft || undefined)
      .then(() => {
        // The key never round-trips back — clear the draft once it's stored
        // so the field returns to showing the masked hint, not stale text.
        setApiKeyDraft('')
        setTestResult(null)
      })
      .catch((error: unknown) => setSaveError(error instanceof Error ? error.message : String(error)))
      .finally(() => setSavePending(false))
  }

  const handleDisconnect = (): void => {
    setSavePending(true)
    void clearConnection()
      .then(() => {
        setBaseUrlDraft('')
        setApiKeyDraft('')
        setTestResult(null)
      })
      .finally(() => setSavePending(false))
  }

  return (
    <PanelSection
      description="Connect Zemara to your prophet-roja-admin backend so Sermons you manage here write into the same database your dashboard and mobile app use."
      icon={Database}
      title="Database"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="admin-base-url">Admin API base URL</FieldLabel>
          <Input
            id="admin-base-url"
            placeholder="https://admin.yourchurch.org"
            value={baseUrlDraft}
            onChange={(event) => setBaseUrlDraft(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="admin-api-key">API key</FieldLabel>
          <Input
            id="admin-api-key"
            type="password"
            placeholder={
              connection?.apiKeyConfigured ? `Stored (ends ${connection.apiKeyHint})` : 'Paste your API key'
            }
            value={apiKeyDraft}
            onChange={(event) => setApiKeyDraft(event.target.value)}
          />
          {connection?.apiKeyConfigured && !apiKeyDraft ? (
            <p className="text-xs text-muted-foreground">
              A key is already stored — leave blank to keep it, or paste a new one to replace it.
            </p>
          ) : null}
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={testPending || !baseUrlDraft.trim()}
          size="sm"
          variant="outline"
          onClick={handleTestConnection}
        >
          {testPending ? <CircleNotch className="animate-spin" data-icon="inline-start" /> : null}
          Test connection
        </Button>
        <Button disabled={savePending || !baseUrlDraft.trim()} size="sm" onClick={handleSave}>
          {savePending ? <CircleNotch className="animate-spin" data-icon="inline-start" /> : null}
          Save
        </Button>
        {connection?.apiKeyConfigured || connection?.baseUrl ? (
          <Button disabled={savePending} size="sm" variant="ghost" onClick={handleDisconnect}>
            Disconnect
          </Button>
        ) : null}
        {connectionLoading ? (
          <StatusBadge tone="neutral" value="Checking…" />
        ) : connection?.apiKeyConfigured ? (
          <StatusBadge icon={CheckCircle} tone="good" value="Configured" />
        ) : (
          <StatusBadge tone="neutral" value="Not configured" />
        )}
      </div>

      {testResult ? (
        <div className="flex items-start gap-1.5 text-xs">
          {testResult.reachable && testResult.databaseOk && testResult.authOk ? (
            <CheckCircle className="size-3.5 shrink-0 text-success" weight="fill" />
          ) : (
            <XCircle className="size-3.5 shrink-0 text-destructive" weight="fill" />
          )}
          <span className="text-muted-foreground">{testResult.message}</span>
        </div>
      ) : null}
      {saveError ? (
        <div className="flex items-start gap-1.5 text-xs text-warning-foreground dark:text-warning">
          <Warning className="size-3.5 shrink-0" weight="fill" />
          <span>{saveError}</span>
        </div>
      ) : null}
      {connectionError ? (
        <div className="flex items-start gap-1.5 text-xs text-warning-foreground dark:text-warning">
          <Warning className="size-3.5 shrink-0" weight="fill" />
          <span>{connectionError}</span>
        </div>
      ) : null}

      {!connection?.apiKeyConfigured ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed p-3">
          <p className="text-xs text-muted-foreground">
            Don't have an API key yet? Register your church and Zemara will generate one for you.
          </p>
          <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
            <DialogTrigger asChild>
              <Button disabled={!baseUrlDraft.trim()} size="sm" variant="outline">
                Create a new church workspace
              </Button>
            </DialogTrigger>
            <RegisterOrganizationDialog
              admin={admin}
              baseUrl={baseUrlDraft}
              onClose={() => setRegisterOpen(false)}
            />
          </Dialog>
        </div>
      ) : null}
    </PanelSection>
  )
}

function RegisterOrganizationDialog({
  admin,
  baseUrl,
  onClose
}: {
  admin: UseAdminBackend
  baseUrl: string
  onClose: () => void
}): ReactElement {
  const [organizationName, setOrganizationName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordsMatch = ownerPassword.length > 0 && ownerPassword === confirmPassword
  const canSubmit =
    organizationName.trim().length >= 2 &&
    ownerName.trim().length >= 2 &&
    ownerEmail.trim().length > 3 &&
    ownerPassword.length >= 8 &&
    passwordsMatch &&
    baseUrl.trim().length > 0

  const handleSubmit = (): void => {
    if (!canSubmit) return
    setPending(true)
    setError(null)
    void admin
      .registerOrganization(baseUrl, organizationName.trim(), ownerName.trim(), ownerEmail.trim(), ownerPassword)
      .then(() => onClose())
      .catch((submitError: unknown) =>
        setError(submitError instanceof Error ? submitError.message : String(submitError))
      )
      .finally(() => setPending(false))
  }

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create a new church workspace</DialogTitle>
        <DialogDescription>
          This sets up a brand-new, fully separate workspace on {baseUrl || 'your admin API'} — its own church
          record, owner account, and API key. Existing churches on the same server are unaffected.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="register-org-name">Organization name</FieldLabel>
          <Input
            id="register-org-name"
            placeholder="Grace Chapel"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="register-owner-name">Your name</FieldLabel>
          <Input
            id="register-owner-name"
            placeholder="Jane Doe"
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="register-owner-email">Email</FieldLabel>
          <Input
            id="register-owner-email"
            placeholder="jane@gracechapel.org"
            type="email"
            value={ownerEmail}
            onChange={(event) => setOwnerEmail(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="register-owner-password">Password</FieldLabel>
          <Input
            id="register-owner-password"
            placeholder="At least 8 characters"
            type="password"
            value={ownerPassword}
            onChange={(event) => setOwnerPassword(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="register-confirm-password">Confirm password</FieldLabel>
          <Input
            id="register-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          {confirmPassword && !passwordsMatch ? (
            <p className="text-xs text-destructive">Passwords don't match.</p>
          ) : null}
        </Field>
      </FieldGroup>

      {error ? (
        <div className="flex items-start gap-1.5 text-xs text-warning-foreground dark:text-warning">
          <Warning className="size-3.5 shrink-0" weight="fill" />
          <span>{error}</span>
        </div>
      ) : null}

      <DialogFooter>
        <Button disabled={pending} variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button disabled={pending || !canSubmit} onClick={handleSubmit}>
          {pending ? <CircleNotch className="animate-spin" data-icon="inline-start" /> : null}
          Create workspace
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
