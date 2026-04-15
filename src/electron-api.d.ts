import type { TokenMonitorApi } from './types'

declare global {
  interface Window {
    tokenMonitor?: TokenMonitorApi
  }
}

export {}
