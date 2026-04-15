export interface UsageEntry {
  client: string
  mergedClients: string[] | null
  model: string
  provider: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  messageCount: number
  cost: number
}

export type SnapshotStatus = 'loading' | 'ok' | 'error'

export interface MetricsSnapshot {
  status: SnapshotStatus
  sourceCommand: string
  entries: UsageEntry[]
  totalInput: number
  totalOutput: number
  totalCacheRead: number
  totalCacheWrite: number
  totalMessages: number
  totalCost: number
  processingTimeMs: number
  lastUpdated: string
  errorMessage: string
}

export interface MonitorSettings {
  refreshIntervalSec: number
}

export type DashboardTab = 'overview' | 'models' | 'daily' | 'hourly' | 'stats' | 'agents'
export type PanelTab = Exclude<DashboardTab, 'overview'>

export interface HourlyEntry {
  hour: string
  clients: string[]
  models: string[]
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  messageCount: number
  turnCount: number
  cost: number
}

export interface DailyEntry {
  day: string
  clients: string[]
  models: string[]
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  messageCount: number
  turnCount: number
  cost: number
  activeHours: number
}

export interface MonthlyEntry {
  month: string
  models: string[]
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  messageCount: number
  cost: number
}

export interface AgentClientEntry {
  client: string
  label: string
  sessionsPath: string
  sessionsPathExists: boolean
  messageCount: number
  headlessSupported: boolean
  headlessMessageCount: number
}

export interface ModelsPanelData {
  entries: UsageEntry[]
  totalInput: number
  totalOutput: number
  totalCacheRead: number
  totalCacheWrite: number
  totalMessages: number
  totalCost: number
  processingTimeMs: number
}

export interface HourlyPanelData {
  entries: HourlyEntry[]
  totalCost: number
  processingTimeMs: number
}

export interface DailyPanelData {
  entries: DailyEntry[]
  totalCost: number
  processingTimeMs: number
}

export interface StatsPanelData {
  entries: MonthlyEntry[]
  totalCost: number
  processingTimeMs: number
}

export interface AgentsPanelData {
  clients: AgentClientEntry[]
  headlessRoots: string[]
  note: string
}

export interface PanelDataMap {
  models: ModelsPanelData
  daily: DailyPanelData
  hourly: HourlyPanelData
  stats: StatsPanelData
  agents: AgentsPanelData
}

export interface PanelResponse<T> {
  tab: PanelTab
  fetchedAt: string
  sourceCommand: string
  sourceArgs: string[]
  data: T
}

export interface TokenMonitorApi {
  getLatest: () => Promise<MetricsSnapshot>
  refreshNow: () => Promise<MetricsSnapshot>
  getSettings: () => Promise<MonitorSettings>
  setRefreshInterval: (seconds: number) => Promise<MonitorSettings>
  getPanel: <T extends PanelTab>(tab: T) => Promise<PanelResponse<PanelDataMap[T]>>
  onUpdate: (callback: (snapshot: MetricsSnapshot) => void) => () => void
  hideWindow: () => Promise<void>
}
