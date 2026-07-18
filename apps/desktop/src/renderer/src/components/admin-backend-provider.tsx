import { createContext, useContext, type ReactElement, type ReactNode } from 'react'

import { useAdminBackend, type UseAdminBackend } from '@/hooks/use-admin-backend'

// Sermons/Videos/Events/Members/Alerts each used to call useAdminBackend()
// independently, so every tab owned its own WebSocket connection and state —
// torn down and refetched from zero on every switch away and back, since
// AppShell conditionally mounts/unmounts tabs. One shared instance here means
// data (and the connection) survive tab navigation: revisiting a tab shows
// what's already loaded while the existing `loading && data.length === 0`
// guards in each tab naturally do a silent background refresh underneath it.
const AdminBackendContext = createContext<UseAdminBackend | null>(null)

export function AdminBackendProvider({ children }: { children: ReactNode }): ReactElement {
  const value = useAdminBackend()
  return <AdminBackendContext.Provider value={value}>{children}</AdminBackendContext.Provider>
}

export function useAdminBackendContext(): UseAdminBackend {
  const value = useContext(AdminBackendContext)
  if (!value) {
    throw new Error('useAdminBackendContext must be used within an AdminBackendProvider')
  }
  return value
}
