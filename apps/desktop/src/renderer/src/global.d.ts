import type { VideorcApi } from '../../shared/backend'

declare global {
  interface Window {
    videorc: VideorcApi
  }
}

export {}
