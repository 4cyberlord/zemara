import { CheckCircle, MagnifyingGlass, QrCode, UserPlus, X } from '@phosphor-icons/react'
import QRCode from 'qrcode'
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { toast } from 'sonner'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { IconStack } from '@/components/ui/icon-stack'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { AdminEvent, AdminMember, AttendanceRecord, AttendanceSession } from '@/lib/backend'
import { cn } from '@/lib/utils'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?'
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function AttendancePanel({
  event,
  open,
  onOpenChange
}: {
  event: AdminEvent
  open: boolean
  onOpenChange: (open: boolean) => void
}): ReactElement {
  const {
    members,
    membersLoading,
    refreshMembers,
    openAttendance,
    closeAttendance,
    getAttendanceQr,
    listAttendance,
    manualCheckIn,
    deleteAttendanceRecord
  } = useAdminBackendContext()

  const [session, setSession] = useState<AttendanceSession | null>(null)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [secondsUntilRotation, setSecondsUntilRotation] = useState(0)

  const [manualQuery, setManualQuery] = useState('')
  const [manualMember, setManualMember] = useState<AdminMember | null>(null)
  const [manualReason, setManualReason] = useState('')
  const [manualOpen, setManualOpen] = useState(false)

  const qrTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    const result = await listAttendance(event.id)
    setSession(result.session)
    setRecords(result.records)
  }, [event.id, listAttendance])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    refresh()
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not load attendance.'))
      .finally(() => setLoading(false))
    if (members.length === 0 && !membersLoading) void refreshMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event.id])

  const refreshQr = useCallback(async () => {
    try {
      const qr = await getAttendanceQr(event.id)
      const dataUrl = await QRCode.toDataURL(qr.token, { width: 320, margin: 1 })
      setQrDataUrl(dataUrl)
      const secondsLeft = Math.max(
        1,
        Math.round((new Date(qr.expiresAt).getTime() - Date.now()) / 1000) - 60
      )
      setSecondsUntilRotation(secondsLeft)
    } catch {
      // Session may have just closed — the next poll/refresh() call will
      // pick up the new status and stop showing a QR entirely.
    }
  }, [event.id, getAttendanceQr])

  useEffect(() => {
    if (qrTimerRef.current) clearInterval(qrTimerRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (!open || session?.status !== 'open') {
      setQrDataUrl(null)
      return
    }
    void refreshQr()
    qrTimerRef.current = setInterval(() => void refreshQr(), session.qrRotationSeconds * 1000)
    countdownRef.current = setInterval(() => {
      setSecondsUntilRotation((current) => Math.max(0, current - 1))
    }, 1000)
    return () => {
      if (qrTimerRef.current) clearInterval(qrTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.status, session?.qrRotationSeconds])

  // Live-updating checked-in count while the session is open.
  useEffect(() => {
    if (!open || session?.status !== 'open') return
    const timer = setInterval(() => void refresh(), 10_000)
    return () => clearInterval(timer)
  }, [open, session?.status, refresh])

  const handleOpen = (): void => {
    setBusy(true)
    void openAttendance(event.id)
      .then((newSession) => {
        setSession(newSession)
        toast.success('Attendance opened.')
        return refresh()
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not open attendance.'))
      .finally(() => setBusy(false))
  }

  const handleClose = (): void => {
    setBusy(true)
    void closeAttendance(event.id)
      .then((updated) => {
        setSession(updated)
        toast.success('Attendance closed.')
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not close attendance.'))
      .finally(() => setBusy(false))
  }

  const alreadyCheckedInIds = new Set(records.map((record) => record.memberId))
  const manualResults =
    manualQuery.trim().length >= 2
      ? members
          .filter((member) => !alreadyCheckedInIds.has(member.id))
          .filter((member) => member.fullName.toLowerCase().includes(manualQuery.trim().toLowerCase()))
          .slice(0, 8)
      : []

  const handleManualMark = (): void => {
    if (!manualMember) return
    if (!manualReason.trim()) {
      toast.error('A reason is required for a manual attendance mark.')
      return
    }
    setBusy(true)
    void manualCheckIn(event.id, { memberId: manualMember.id, manualReason: manualReason.trim() })
      .then(() => {
        toast.success(`Marked ${manualMember.fullName} present.`)
        setManualMember(null)
        setManualQuery('')
        setManualReason('')
        setManualOpen(false)
        return refresh()
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not mark attendance.'))
      .finally(() => setBusy(false))
  }

  const handleRemove = (recordId: string): void => {
    void deleteAttendanceRecord(event.id, recordId)
      .then(() => refresh())
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not remove this record.'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Attendance — {event.title}
            {session ? (
              <Badge variant={session.status === 'open' ? 'default' : 'secondary'}>
                {session.status === 'open' ? 'Open' : 'Closed'}
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {new Date(event.startsAt).toLocaleString('default', {
              weekday: 'long',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading attendance…</div>
        ) : !session ? (
          <Empty>
            <EmptyMedia variant="default">
              <IconStack>
                <QrCode weight="duotone" className="size-4" />
              </IconStack>
            </EmptyMedia>
            <EmptyTitle>Attendance not started</EmptyTitle>
            <EmptyDescription>
              Open attendance to show a rotating QR code for members to scan.
            </EmptyDescription>
            <Button className="mt-2" disabled={busy} onClick={handleOpen}>
              Open Attendance
            </Button>
          </Empty>
        ) : (
          <div className="flex flex-col gap-5">
            {session.status === 'open' ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-6">
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="Attendance QR code" className="size-64 rounded-xl" />
                ) : (
                  <div className="flex size-64 items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
                    Generating…
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Refreshes in {secondsUntilRotation}s — screenshots expire quickly
                </p>
              </div>
            ) : null}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-foreground">{records.length}</p>
                <p className="text-xs text-muted-foreground">checked in</p>
              </div>
              {session.status === 'open' ? (
                <Button variant="outline" disabled={busy} onClick={handleClose}>
                  Close Attendance
                </Button>
              ) : (
                <Button variant="outline" disabled={busy} onClick={handleOpen}>
                  Reopen Attendance
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Checked in</span>
                <Button size="sm" variant="ghost" onClick={() => setManualOpen((current) => !current)}>
                  <UserPlus className="size-4" />
                  Mark manually
                </Button>
              </div>

              {manualOpen ? (
                <div className="space-y-2 rounded-xl border bg-accent/40 p-3">
                  <div className="relative">
                    <MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search a member by name…"
                      value={manualMember ? manualMember.fullName : manualQuery}
                      onChange={(inputEvent) => {
                        setManualMember(null)
                        setManualQuery(inputEvent.target.value)
                      }}
                    />
                  </div>
                  {manualResults.length > 0 && !manualMember ? (
                    <div className="overflow-hidden rounded-lg border bg-popover">
                      {manualResults.map((member) => (
                        <button
                          key={member.id}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                          onClick={() => {
                            setManualMember(member)
                            setManualQuery(member.fullName)
                          }}
                        >
                          <Avatar size="sm">
                            <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                            <AvatarFallback>{initials(member.fullName)}</AvatarFallback>
                          </Avatar>
                          {member.fullName}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {manualMember ? (
                    <>
                      <Textarea
                        placeholder="Why is this being marked manually? e.g. no phone, phone was off…"
                        value={manualReason}
                        onChange={(inputEvent) => setManualReason(inputEvent.target.value)}
                        rows={2}
                      />
                      <Button size="sm" disabled={busy || !manualReason.trim()} onClick={handleManualMark}>
                        <CheckCircle className="size-4" />
                        Mark {manualMember.fullName} present
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}

              {records.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No one has checked in yet.</p>
              ) : (
                <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                  {records.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2"
                    >
                      <Avatar size="sm">
                        <AvatarFallback>{initials(record.displayNameSnapshot)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {record.displayNameSnapshot}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(record.checkedInAt)}
                          {record.method === 'manual' ? ' · marked manually' : ' · QR scan'}
                          {record.minutesLate && record.minutesLate > 0 ? ` · ${record.minutesLate}m late` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label="Remove attendance record"
                        className={cn(
                          'rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive'
                        )}
                        onClick={() => handleRemove(record.id)}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
