'use client'

import * as React from 'react'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

export interface AppSelectOption {
  value: string
  label: React.ReactNode
  disabled?: boolean
  title?: string
  className?: string
}

export interface AppSelectGroup {
  label?: React.ReactNode
  options: AppSelectOption[]
}

export interface AppSelectProps {
  value?: string
  onValueChange: (value: string) => void
  options?: AppSelectOption[]
  groups?: AppSelectGroup[]
  placeholder?: string
  disabled?: boolean
  size?: 'sm' | 'default'
  className?: string
  contentClassName?: string
  id?: string
  'aria-label'?: string
  /** Overrides what the trigger displays, independent of the selected item's own label. */
  valueContent?: React.ReactNode
  /** Escape hatch for content that doesn't fit the options/groups shape (e.g. externally rendered items). */
  children?: React.ReactNode
}

/**
 * Thin wrapper around the Select primitives that collapses the common
 * "list of options, maybe grouped" case to a single call, while still
 * accepting raw children for cases that need full control over content.
 */
function AppSelect({
  value,
  onValueChange,
  options,
  groups,
  placeholder,
  disabled,
  size = 'default',
  className,
  contentClassName,
  id,
  valueContent,
  children,
  ...ariaProps
}: AppSelectProps): React.JSX.Element {
  const resolvedGroups = groups ?? (options ? [{ options }] : [])

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} size={size} className={className} {...ariaProps}>
        <SelectValue placeholder={placeholder}>{valueContent}</SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {children ??
          resolvedGroups.map((group, index) => (
            <React.Fragment key={group.label ? String(group.label) : index}>
              <SelectGroup>
                {group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
                {group.options.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    disabled={option.disabled}
                    title={option.title}
                    className={option.className}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
              {groups && index < resolvedGroups.length - 1 ? <SelectSeparator /> : null}
            </React.Fragment>
          ))}
      </SelectContent>
    </Select>
  )
}

export { AppSelect }
