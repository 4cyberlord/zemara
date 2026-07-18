import type { DeviceList } from '@/lib/backend'

export type ProtectedOverlayWindow = {
  open: boolean
  windowId?: number
}

export function protectedOverlayWindowIdsFromOverlayWindows(
  ...windows: ProtectedOverlayWindow[]
): number[] {
  return windows
    .filter((window) => window.open && typeof window.windowId === 'number')
    .map((window) => window.windowId as number)
}

export function deviceListWithoutProtectedOverlayWindows(
  deviceList: DeviceList,
  ...windows: ProtectedOverlayWindow[]
): DeviceList {
  const protectedWindowIds = protectedOverlayWindowIdsFromOverlayWindows(...windows)
  if (protectedWindowIds.length === 0) {
    return deviceList
  }
  const protectedIds = new Set(protectedWindowIds.map((id) => `window:screencapturekit:${id}`))
  const devices = deviceList.devices.filter((device) => !protectedIds.has(device.id))
  return devices.length === deviceList.devices.length ? deviceList : { ...deviceList, devices }
}
