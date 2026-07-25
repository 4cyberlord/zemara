import { Quotes } from '@phosphor-icons/react'
import { useEffect, useRef, type ReactElement } from 'react'

import { useAdminBackendContext } from '@/components/admin-backend-provider'
import { PanelSection } from '@/components/panel-section'
import { AppSelect } from '@/components/ui/app-select'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { useStudioCore } from '@/hooks/use-studio'
import type { CaptionsCaptureSettings } from '@/lib/capture'

/** Radix Select rejects empty-string item values, so "no stored default"
 *  rides the select as a sentinel. */
const NO_DEFAULT_TRANSLATION = '__app-default__'

/**
 * Settings > Bible Verse: how Zemara detects Bible citations from the live
 * microphone — the preferred translation, the detection toggles, how
 * confident a detection must be before it queues or presents itself, and how
 * long repeat detections of the same reference are ignored.
 */
export function LivingTextSettingsSection(): ReactElement {
  const {
    livingTextTranslations,
    livingTextTranslationsLoading,
    livingTextTranslationsError,
    refreshLivingTextTranslations,
    livingTextDefaultTranslationCode,
    setLivingTextDefaultTranslationCode,
    setActiveTranslationCode,
    isLiveDetectionEnabled,
    setLiveDetectionEnabled,
    isAutoPresentEnabled,
    setAutoPresentEnabled,
    isReadingModeEnabled,
    setReadingModeEnabled,
    isLiveSyncEnabled,
    setLiveSyncEnabled,
    livingTextConfidenceThreshold,
    setLivingTextConfidenceThreshold,
    livingTextDetectionCooldownMs,
    setLivingTextDetectionCooldownMs
  } = useAdminBackendContext()
  const { captureConfig, setCaptureConfig } = useStudioCore()
  const captions = captureConfig.captions
  const patchCaptions = (patch: Partial<CaptionsCaptureSettings>): void => {
    setCaptureConfig((current) => ({
      ...current,
      captions: { ...current.captions, ...patch }
    }))
  }

  // The select needs the synced-translation list even when the operator opens
  // Settings before ever visiting the Bible Verse tab. Fetch once per mount —
  // on failure the error copy below is the explicit status, not a retry loop.
  const refreshAttemptedRef = useRef(false)
  useEffect(() => {
    if (refreshAttemptedRef.current) return
    if (livingTextTranslations.length > 0 || livingTextTranslationsLoading) return
    refreshAttemptedRef.current = true
    void refreshLivingTextTranslations()
  }, [livingTextTranslations.length, livingTextTranslationsLoading, refreshLivingTextTranslations])

  const cooldownSeconds = Math.round(livingTextDetectionCooldownMs / 1000)

  return (
    <PanelSection
      description="How Zemara detects Bible citations from the live microphone and what it does with them."
      icon={Quotes}
      title="Bible Verse"
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="living-text-default-translation">Default translation</FieldLabel>
          {livingTextTranslations.length > 0 ? (
            <AppSelect
              id="living-text-default-translation"
              value={livingTextDefaultTranslationCode || NO_DEFAULT_TRANSLATION}
              onValueChange={(value) => {
                const next = value === NO_DEFAULT_TRANSLATION ? '' : value
                setLivingTextDefaultTranslationCode(next)
                // Apply immediately — detection and browsing switch now, not
                // only on the next launch. "App default" leaves the live
                // session on whatever translation it already had.
                if (next) setActiveTranslationCode(next)
              }}
              options={[
                { value: NO_DEFAULT_TRANSLATION, label: 'App default (NIV)' },
                ...livingTextTranslations.map((translation) => ({
                  value: translation.code,
                  label: `${translation.code} · ${translation.name}`
                }))
              ]}
              className="w-64"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {livingTextTranslationsError ??
                'No translations synced on this device yet — sync one from the Bible Verse tab.'}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Detection and browsing start on this translation.
          </p>
        </Field>
      </FieldGroup>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="living-text-speech-engine">Speech engine</FieldLabel>
          <AppSelect
            id="living-text-speech-engine"
            value={captions.provider}
            onValueChange={(value) => {
              if (value === 'local' || value === 'cloud') {
                patchCaptions({ provider: value })
              }
            }}
            options={[
              { value: 'local', label: 'Manual — on-device (no account needed)' },
              { value: 'cloud', label: 'Cloud — Deepgram API key' }
            ]}
            className="w-72"
          />
          <p className="text-xs text-muted-foreground">
            {captions.provider === 'local'
              ? 'Runs entirely on this device — live captions and verse detection work with no sign-in. First use downloads the speech model once (~74 MB).'
              : 'Uses your own Deepgram key for faster cloud transcription. The key is stored only on this device.'}
          </p>
        </Field>
        {captions.provider === 'cloud' ? (
          <Field>
            <FieldLabel htmlFor="living-text-deepgram-key">Deepgram API key</FieldLabel>
            <Input
              id="living-text-deepgram-key"
              type="password"
              autoComplete="off"
              placeholder="Paste your Deepgram API key"
              className="w-72"
              value={captions.deepgramApiKey ?? ''}
              onChange={(event) =>
                patchCaptions({ deepgramApiKey: event.target.value.trim() || null })
              }
            />
            <p className="text-xs text-muted-foreground">
              Get a key at deepgram.com — without one, Cloud falls back to the signed-in Zemara
              account.
            </p>
          </Field>
        ) : null}
      </FieldGroup>

      <FieldGroup>
        <div className="flex items-center justify-between">
          <Label htmlFor="settings-live-detect-switch" className="flex flex-col gap-1">
            <span className="text-sm font-medium">Live Microphone Detection</span>
            <span className="text-xs font-normal text-muted-foreground">
              Monitor transcripts for Bible citations
            </span>
          </Label>
          <Switch
            id="settings-live-detect-switch"
            checked={isLiveDetectionEnabled}
            onCheckedChange={setLiveDetectionEnabled}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="settings-auto-present-switch" className="flex flex-col gap-1">
            <span className="text-sm font-medium">Auto-Present</span>
            <span className="text-xs font-normal text-muted-foreground">
              Send to broadcast without queuing
            </span>
          </Label>
          <Switch
            id="settings-auto-present-switch"
            checked={isAutoPresentEnabled}
            onCheckedChange={setAutoPresentEnabled}
            disabled={!isLiveDetectionEnabled}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="settings-reading-mode-switch" className="flex flex-col gap-1">
            <span className="text-sm font-medium">Reading Mode</span>
            <span className="text-xs font-normal text-muted-foreground">
              Buffer consecutive transcript lines; enables &ldquo;next/previous verse&rdquo; voice
              navigation
            </span>
          </Label>
          <Switch
            id="settings-reading-mode-switch"
            checked={isReadingModeEnabled}
            onCheckedChange={setReadingModeEnabled}
            disabled={!isLiveDetectionEnabled}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="settings-live-sync-switch" className="flex flex-col gap-1">
            <span className="text-sm font-medium">Live Sync</span>
            <span className="text-xs font-normal text-muted-foreground">
              Push verse &amp; theme changes to the output window in real time
            </span>
          </Label>
          <Switch
            id="settings-live-sync-switch"
            checked={isLiveSyncEnabled}
            onCheckedChange={setLiveSyncEnabled}
          />
        </div>
      </FieldGroup>

      <FieldGroup>
        <Field>
          <div className="flex items-center justify-between">
            <FieldLabel>Auto-action confidence threshold</FieldLabel>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(livingTextConfidenceThreshold * 100)}%
            </span>
          </div>
          <Slider
            min={0.35}
            max={1}
            step={0.05}
            value={[livingTextConfidenceThreshold]}
            onValueChange={([value]) => setLivingTextConfidenceThreshold(Number(value.toFixed(2)))}
          />
          <p className="text-xs text-muted-foreground">
            Detections below this confidence appear in the detection feed only — they won't queue or
            auto-present.
          </p>
        </Field>
        <Field>
          <FieldLabel htmlFor="living-text-detection-cooldown">
            Detection cooldown (seconds)
          </FieldLabel>
          <Input
            id="living-text-detection-cooldown"
            type="number"
            min={0}
            max={600}
            step={1}
            className="w-24"
            value={cooldownSeconds}
            onChange={(event) => {
              const seconds = Number(event.target.value)
              if (event.target.value !== '' && Number.isFinite(seconds) && seconds >= 0) {
                setLivingTextDetectionCooldownMs(Math.round(seconds) * 1000)
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            Repeat detections of the same reference within this window are ignored.
          </p>
        </Field>
      </FieldGroup>
    </PanelSection>
  )
}
