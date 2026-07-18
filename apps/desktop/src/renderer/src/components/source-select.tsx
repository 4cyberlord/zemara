import { useId, type ReactElement, type ReactNode } from 'react'

import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { Device } from '@/lib/backend'
import { missingSelection, sourceSelectPlaceholder } from '@/lib/source-select-state'

const NONE_VALUE = '__none__'

export function SourceSelect({
  label,
  devices,
  value,
  onChange,
  allowNone = false,
  placeholder,
  discoveryPending = false,
  description,
  disabled = false
}: {
  label: string
  devices: Device[]
  value?: string
  onChange: (value: string | undefined) => void
  allowNone?: boolean
  placeholder?: string
  /** Device discovery hasn't reported yet — show "Finding devices…" over "none found". */
  discoveryPending?: boolean
  description?: ReactNode
  disabled?: boolean
}): ReactElement {
  const id = useId()
  // Q6 (plan 022): the select must never render a blank surface. A saved id
  // with no matching device gets a synthetic disabled item (so the trigger
  // has words), and the placeholder names loading/none-found explicitly.
  const missing = missingSelection(devices, value)

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        disabled={disabled}
        value={value ?? (allowNone ? NONE_VALUE : '')}
        onValueChange={(next) => onChange(next === NONE_VALUE || next === '' ? undefined : next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue
            placeholder={placeholder ?? sourceSelectPlaceholder(devices.length, discoveryPending)}
          />
        </SelectTrigger>
        <SelectContent align="start" position="popper">
          <SelectGroup>
            {allowNone ? <SelectItem value={NONE_VALUE}>None</SelectItem> : null}
            {missing ? (
              <SelectItem disabled value={missing.value}>
                {missing.label}
              </SelectItem>
            ) : null}
            {devices.map((device) => (
              <SelectItem
                // A device that only needs permission must stay selectable —
                // selecting it is what causes the app to actually attempt
                // opening it, which is the only thing that triggers the real
                // system permission prompt. Only a genuinely unavailable
                // device (disconnected, in use elsewhere) should be inert.
                disabled={device.status === 'unavailable'}
                key={device.id}
                value={device.id}
              >
                {device.name}
                {device.status !== 'available' ? ` (${device.status})` : ''}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}
