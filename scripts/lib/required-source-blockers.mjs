export function requiredSourceBlocker(
  label,
  device,
  { disabled = false, override, disableHint, requiredPrefix, allowForcedOverride = false } = {}
) {
  if (disabled) return null
  if (override && requiredPrefix && !override.startsWith(requiredPrefix)) {
    return `${label} override ${override} is not a native ScreenCaptureKit source`
  }
  if (override && (allowForcedOverride || device?.status === 'available')) return null
  if (!device) {
    const native = requiredPrefix ? ' native ScreenCaptureKit source' : ''
    return `${label}${native} missing (set ${disableHint} to omit it intentionally)`
  }
  if (device.status !== 'available') {
    return `${label} ${device.name} [${device.id}] is ${device.status} (set ${disableHint} to omit it intentionally)`
  }
  if (requiredPrefix && !device.id.startsWith(requiredPrefix)) {
    return `${label} ${device.name} [${device.id}] is not a native ScreenCaptureKit source`
  }
  return null
}
