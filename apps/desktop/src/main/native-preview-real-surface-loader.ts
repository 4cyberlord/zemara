import type { NativePreviewRealSurfaceDriver } from '../shared/native-preview-host-driver'

export interface NativePreviewRealSurfaceDriverLoadOptions {
  modulePath?: string
  loadModule: (modulePath: string) => unknown
}

export interface NativePreviewRealSurfaceDriverLoadResult {
  driver: NativePreviewRealSurfaceDriver | null
  unavailableReason?: string
}

export function loadNativePreviewRealSurfaceDriver(
  options: NativePreviewRealSurfaceDriverLoadOptions
): NativePreviewRealSurfaceDriverLoadResult {
  const modulePath = options.modulePath?.trim()
  if (!modulePath) {
    return {
      driver: null,
      unavailableReason: 'Real CAMetalLayer IOSurface presenter module is not configured'
    }
  }

  let loadedModule: unknown
  try {
    loadedModule = options.loadModule(modulePath)
  } catch (error) {
    return {
      driver: null,
      unavailableReason: `Real CAMetalLayer IOSurface presenter module failed to load: ${errorMessage(error)}`
    }
  }

  const driver = nativePreviewRealSurfaceDriverFromModule(loadedModule)
  if (!driver) {
    return {
      driver: null,
      unavailableReason:
        'Real CAMetalLayer IOSurface presenter module did not export a valid native-preview driver'
    }
  }

  return { driver }
}

function nativePreviewRealSurfaceDriverFromModule(
  moduleValue: unknown
): NativePreviewRealSurfaceDriver | null {
  if (isNativePreviewRealSurfaceDriver(moduleValue)) {
    return moduleValue
  }
  if (!isObject(moduleValue)) {
    return null
  }

  const defaultExport = moduleValue.default
  if (isNativePreviewRealSurfaceDriver(defaultExport)) {
    return defaultExport
  }

  const factory = moduleValue.createNativePreviewRealSurfaceDriver
  if (typeof factory === 'function') {
    const driver = factory()
    return isNativePreviewRealSurfaceDriver(driver) ? driver : null
  }

  if (isObject(defaultExport)) {
    const defaultFactory = defaultExport.createNativePreviewRealSurfaceDriver
    if (typeof defaultFactory === 'function') {
      const driver = defaultFactory()
      return isNativePreviewRealSurfaceDriver(driver) ? driver : null
    }
  }

  return null
}

function isNativePreviewRealSurfaceDriver(value: unknown): value is NativePreviewRealSurfaceDriver {
  return (
    isObject(value) &&
    typeof value.applyHostCommands === 'function' &&
    typeof value.presentCompositorHandoff === 'function'
  )
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
