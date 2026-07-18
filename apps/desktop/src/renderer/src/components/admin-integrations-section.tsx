import { PuzzlePiece } from '@phosphor-icons/react'
import type { ReactElement } from 'react'

import { PanelSection } from '@/components/panel-section'
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

/** A future integration Zemara can install/enable — appended here as each one ships. */
export type IntegrationDefinition = {
  id: string
  name: string
  description: string
}

// Deliberately empty for now — this is the shell the plan calls for. Real
// entries get appended to this array as each integration is actually built;
// nothing else about this component needs to change when that happens.
const AVAILABLE_INTEGRATIONS: IntegrationDefinition[] = []

export function AdminIntegrationsSection(): ReactElement {
  return (
    <PanelSection
      description="Optional capabilities you can install and enable for Zemara."
      icon={PuzzlePiece}
      title="Integrations"
    >
      {AVAILABLE_INTEGRATIONS.length === 0 ? (
        <Empty className="py-10">
          <EmptyMedia variant="icon">
            <PuzzlePiece weight="duotone" />
          </EmptyMedia>
          <EmptyTitle>No integrations yet</EmptyTitle>
          <EmptyDescription>
            Features you can install and enable for Zemara will show up here.
          </EmptyDescription>
        </Empty>
      ) : (
        <div className="flex flex-col gap-1">
          {AVAILABLE_INTEGRATIONS.map((integration) => (
            <div key={integration.id} className="rounded-row px-2.5 py-2 text-sm">
              <div className="font-medium">{integration.name}</div>
              <div className="text-xs text-muted-foreground">{integration.description}</div>
            </div>
          ))}
        </div>
      )}
    </PanelSection>
  )
}
