import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import type {
  AgentsPanelData,
  DashboardTab,
  DailyPanelData,
  HourlyPanelData,
  MetricsSnapshot,
  ModelsPanelData,
  MonitorSettings,
  PanelResponse,
  PanelTab,
  StatsPanelData,
  UsageEntry,
} from './types'

const REFRESH_OPTIONS = [5, 10, 15, 30, 60, 120, 300]

const TAB_META: Record<DashboardTab, { label: string; hint: string }> = {
  overview: { label: 'Overview', hint: 'Live summary' },
  models: { label: 'Models', hint: 'Model ranking' },
  daily: { label: 'Daily', hint: 'Day trend' },
  hourly: { label: 'Hourly', hint: 'Hour trend' },
  stats: { label: 'Stats', hint: 'Monthly stats' },
  agents: { label: 'Agents', hint: 'Client scanner' },
}

interface PanelEnvelope {
  status: 'idle' | 'loading' | 'ready' | 'error'
  payload: PanelResponse<unknown> | null
  errorMessage: string
}

interface HourlyChartPoint {
  hour: number
  label: string
  cost: number
  messages: number
}

const initialPanelState: PanelEnvelope = {
  status: 'idle',
  payload: null,
  errorMessage: '',
}

const emptySnapshot: MetricsSnapshot = {
  status: 'loading',
  sourceCommand: '',
  entries: [],
  totalInput: 0,
  totalOutput: 0,
  totalCacheRead: 0,
  totalCacheWrite: 0,
  totalMessages: 0,
  totalCost: 0,
  processingTimeMs: 0,
  lastUpdated: '',
  errorMessage: '',
}

const numberFormatter = new Intl.NumberFormat('en-US')

function formatCount(value: number): string {
  return numberFormatter.format(Math.max(0, Math.round(value)))
}

function formatCost(value: number): string {
  return `$${value.toFixed(4)}`
}

function formatTime(isoString: string): string {
  if (!isoString) {
    return '--:--:--'
  }

  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) {
    return '--:--:--'
  }

  return parsed.toLocaleTimeString('en-GB', { hour12: false })
}

function statusLabel(status: MetricsSnapshot['status']): string {
  if (status === 'ok') {
    return 'Live'
  }

  if (status === 'error') {
    return 'Retrying'
  }

  return 'Connecting'
}

function widthPercent(value: number, total: number): number {
  if (value <= 0 || total <= 0) {
    return 0
  }

  return Math.max(4, Math.round((value / total) * 100))
}

function mapInitialPanels(): Record<PanelTab, PanelEnvelope> {
  return {
    models: { ...initialPanelState },
    daily: { ...initialPanelState },
    hourly: { ...initialPanelState },
    stats: { ...initialPanelState },
    agents: { ...initialPanelState },
  }
}

function buildHourlyChartPoints(hourlyData?: HourlyPanelData): HourlyChartPoint[] {
  const points: HourlyChartPoint[] = Array.from({ length: 24 }, (_unused, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    cost: 0,
    messages: 0,
  }))

  if (!hourlyData) {
    return points
  }

  for (const entry of hourlyData.entries) {
    const match = entry.hour.match(/(\d{2}):\d{2}$/)
    if (!match) {
      continue
    }

    const hour = Number(match[1])
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
      continue
    }

    points[hour].cost += Math.max(0, entry.cost)
    points[hour].messages += Math.max(0, entry.messageCount)
  }

  return points
}

function toPolylinePoints(points: HourlyChartPoint[]): string {
  const chartWidth = 100
  const chartHeight = 42
  const xPadding = 4
  const yPadding = 4

  const maxCost = Math.max(0.0001, ...points.map((point) => point.cost))

  return points
    .map((point, index) => {
      const x = xPadding + (index / (points.length - 1)) * (chartWidth - xPadding * 2)
      const ratio = point.cost / maxCost
      const y = chartHeight - yPadding - ratio * (chartHeight - yPadding * 2)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function App() {
  const [snapshot, setSnapshot] = useState<MetricsSnapshot>(emptySnapshot)
  const [settings, setSettings] = useState<MonitorSettings>({ refreshIntervalSec: 30 })
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [panels, setPanels] = useState<Record<PanelTab, PanelEnvelope>>(mapInitialPanels)
  const [isRefreshingOverview, setIsRefreshingOverview] = useState(false)

  useEffect(() => {
    const monitorApi = window.tokenMonitor
    if (!monitorApi) {
      setSnapshot((previous) => ({
        ...previous,
        status: 'error',
        errorMessage: 'Electron preload API not found. Please launch with npm run dev.',
      }))
      return
    }

    const api = monitorApi
    let isActive = true
    let unsubscribe = () => {}

    async function bootstrap(): Promise<void> {
      try {
        const [latest, monitorSettings, hourlyPanel] = await Promise.all([
          api.getLatest(),
          api.getSettings(),
          api.getPanel('hourly').catch(() => null),
        ])
        if (!isActive) {
          return
        }

        setSnapshot(latest)
        setSettings(monitorSettings)
        if (hourlyPanel) {
          setPanels((previous) => ({
            ...previous,
            hourly: {
              status: 'ready',
              payload: hourlyPanel,
              errorMessage: '',
            },
          }))
        }
        unsubscribe = api.onUpdate((nextSnapshot) => {
          setSnapshot(nextSnapshot)
        })
      } catch (error) {
        if (!isActive) {
          return
        }

        const message = error instanceof Error ? error.message : 'Initialization failed.'
        setSnapshot((previous) => ({
          ...previous,
          status: 'error',
          errorMessage: message,
        }))
      }
    }

    void bootstrap()

    return () => {
      isActive = false
      unsubscribe()
    }
  }, [])

  const totalTokens =
    snapshot.totalInput +
    snapshot.totalOutput +
    snapshot.totalCacheRead +
    snapshot.totalCacheWrite

  const topEntries = useMemo(() => {
    return [...snapshot.entries].sort((left, right) => right.cost - left.cost).slice(0, 6)
  }, [snapshot.entries])

  const panelState = activeTab === 'overview' ? null : panels[activeTab]
  const panelBusy = Boolean(panelState && panelState.status === 'loading')
  const refreshBusy = isRefreshingOverview || panelBusy
  const activeErrorMessage =
    activeTab === 'overview' ? snapshot.errorMessage : (panelState?.errorMessage ?? '')
  const activeTimestamp =
    activeTab === 'overview' ? snapshot.lastUpdated : (panelState?.payload?.fetchedAt ?? '')

  const hourlyChartData = panels.hourly.payload?.data as HourlyPanelData | undefined
  const chartPoints = useMemo(() => buildHourlyChartPoints(hourlyChartData), [hourlyChartData])
  const chartPolyline = useMemo(() => toPolylinePoints(chartPoints), [chartPoints])
  const chartTotalCost = useMemo(() => chartPoints.reduce((sum, point) => sum + point.cost, 0), [chartPoints])
  const chartPeak = useMemo(() => {
    return chartPoints.reduce(
      (best, point) => {
        if (point.cost > best.cost) {
          return point
        }

        return best
      },
      chartPoints[0],
    )
  }, [chartPoints])

  const fetchPanel = useCallback(async (tab: PanelTab, force = false): Promise<void> => {
    const monitorApi = window.tokenMonitor
    if (!monitorApi) {
      return
    }

    let shouldRequest = true
    setPanels((previous) => {
      if (!force && previous[tab].status === 'loading') {
        shouldRequest = false
        return previous
      }

      return {
        ...previous,
        [tab]: {
          ...previous[tab],
          status: 'loading',
          errorMessage: '',
        },
      }
    })

    if (!shouldRequest) {
      return
    }

    try {
      const payload = await monitorApi.getPanel(tab)
      setPanels((previous) => ({
        ...previous,
        [tab]: {
          status: 'ready',
          payload,
          errorMessage: '',
        },
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Panel loading failed.'
      setPanels((previous) => ({
        ...previous,
        [tab]: {
          ...previous[tab],
          status: 'error',
          errorMessage: message,
        },
      }))
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'overview') {
      return
    }

    const panel = panels[activeTab]
    if (panel.status === 'idle') {
      void fetchPanel(activeTab)
    }
  }, [activeTab, panels, fetchPanel])

  useEffect(() => {
    if (!snapshot.lastUpdated || snapshot.status !== 'ok') {
      return
    }

    void fetchPanel('hourly', true)
  }, [snapshot.lastUpdated, snapshot.status, fetchPanel])

  async function handleRefresh(): Promise<void> {
    const monitorApi = window.tokenMonitor
    if (!monitorApi) {
      return
    }

    if (activeTab === 'overview') {
      setIsRefreshingOverview(true)
      try {
        const nextSnapshot = await monitorApi.refreshNow()
        setSnapshot(nextSnapshot)
        await fetchPanel('hourly', true)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Manual refresh failed.'
        setSnapshot((previous) => ({
          ...previous,
          status: 'error',
          errorMessage: message,
        }))
      } finally {
        setIsRefreshingOverview(false)
      }
      return
    }

    await fetchPanel(activeTab, true)
  }

  async function handleIntervalChange(seconds: number): Promise<void> {
    const monitorApi = window.tokenMonitor
    if (!monitorApi) {
      return
    }

    try {
      const nextSettings = await monitorApi.setRefreshInterval(seconds)
      setSettings(nextSettings)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update refresh interval.'
      setSnapshot((previous) => ({
        ...previous,
        status: 'error',
        errorMessage: message,
      }))
    }
  }

  async function handleHideWindow(): Promise<void> {
    const monitorApi = window.tokenMonitor
    if (!monitorApi) {
      return
    }

    await monitorApi.hideWindow()
  }

  function renderOverviewPanel() {
    return (
      <>
        <section className="cards">
          <article className="card">
            <p className="label">Total Cost</p>
            <p className="value">{formatCost(snapshot.totalCost)}</p>
          </article>
          <article className="card">
            <p className="label">Total Tokens</p>
            <p className="value">{formatCount(totalTokens)}</p>
          </article>
          <article className="card">
            <p className="label">Messages</p>
            <p className="value">{formatCount(snapshot.totalMessages)}</p>
          </article>
          <article className="card">
            <p className="label">Models</p>
            <p className="value">{formatCount(snapshot.entries.length)}</p>
          </article>
        </section>

        <section className="panel-box">
          <h2>Traffic Breakdown</h2>
          <div className="metric-line">
            <span>Input</span>
            <strong>{formatCount(snapshot.totalInput)}</strong>
            <div className="meter">
              <span style={{ width: `${widthPercent(snapshot.totalInput, totalTokens)}%` }} />
            </div>
          </div>
          <div className="metric-line">
            <span>Output</span>
            <strong>{formatCount(snapshot.totalOutput)}</strong>
            <div className="meter">
              <span style={{ width: `${widthPercent(snapshot.totalOutput, totalTokens)}%` }} />
            </div>
          </div>
          <div className="metric-line">
            <span>Cache Read</span>
            <strong>{formatCount(snapshot.totalCacheRead)}</strong>
            <div className="meter">
              <span style={{ width: `${widthPercent(snapshot.totalCacheRead, totalTokens)}%` }} />
            </div>
          </div>
          <div className="metric-line">
            <span>Cache Write</span>
            <strong>{formatCount(snapshot.totalCacheWrite)}</strong>
            <div className="meter">
              <span style={{ width: `${widthPercent(snapshot.totalCacheWrite, totalTokens)}%` }} />
            </div>
          </div>
        </section>

        <section className="panel-box">
          <h2>Top Models by Cost</h2>
          <ul className="list">
            {topEntries.map((entry) => {
              return (
                <li key={`${entry.client}:${entry.model}`}>
                  <div>
                    <strong>{entry.model}</strong>
                    <p>
                      {entry.client} / {entry.provider}
                    </p>
                  </div>
                  <div className="row-values">
                    <span>{formatCost(entry.cost)}</span>
                    <small>{formatCount(entry.messageCount)} msgs</small>
                  </div>
                </li>
              )
            })}
            {topEntries.length === 0 && <li className="empty">Waiting for tokscale data...</li>}
          </ul>
        </section>
      </>
    )
  }

  function renderModelsPanel() {
    const data = panels.models.payload?.data as ModelsPanelData | undefined
    if (!data) {
      return <section className="panel-box empty">No model data yet.</section>
    }

    const sortedModels = [...data.entries].sort((left, right) => right.cost - left.cost)

    return (
      <>
        <section className="cards">
          <article className="card">
            <p className="label">Model Cost</p>
            <p className="value">{formatCost(data.totalCost)}</p>
          </article>
          <article className="card">
            <p className="label">Model Messages</p>
            <p className="value">{formatCount(data.totalMessages)}</p>
          </article>
          <article className="card">
            <p className="label">Input Tokens</p>
            <p className="value">{formatCount(data.totalInput)}</p>
          </article>
          <article className="card">
            <p className="label">Output Tokens</p>
            <p className="value">{formatCount(data.totalOutput)}</p>
          </article>
        </section>

        <section className="panel-box">
          <h2>Model Ranking</h2>
          <ul className="list">
            {sortedModels.map((entry: UsageEntry) => (
              <li key={`${entry.client}:${entry.model}`}>
                <div>
                  <strong>{entry.model}</strong>
                  <p>
                    {entry.provider} / {entry.client}
                  </p>
                </div>
                <div className="row-values">
                  <span>{formatCost(entry.cost)}</span>
                  <small>{formatCount(entry.messageCount)} msgs</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </>
    )
  }

  function renderDailyPanel() {
    const data = panels.daily.payload?.data as DailyPanelData | undefined
    if (!data) {
      return <section className="panel-box empty">No daily trend yet.</section>
    }

    return (
      <section className="panel-box">
        <h2>Daily Timeline (7 days)</h2>
        <ul className="list">
          {data.entries.map((entry) => (
            <li key={entry.day}>
              <div>
                <strong>{entry.day}</strong>
                <p>
                  {entry.activeHours} active hours / {entry.models.length} models
                </p>
              </div>
              <div className="row-values">
                <span>{formatCost(entry.cost)}</span>
                <small>{formatCount(entry.messageCount)} msgs</small>
              </div>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  function renderHourlyPanel() {
    const data = panels.hourly.payload?.data as HourlyPanelData | undefined
    if (!data) {
      return <section className="panel-box empty">No hourly trend yet.</section>
    }

    return (
      <section className="panel-box">
        <h2>Hourly Timeline (today)</h2>
        <ul className="list">
          {data.entries.map((entry) => (
            <li key={entry.hour}>
              <div>
                <strong>{entry.hour}</strong>
                <p>
                  {entry.clients.join(', ')} / {entry.models.length} models
                </p>
              </div>
              <div className="row-values">
                <span>{formatCost(entry.cost)}</span>
                <small>{formatCount(entry.messageCount)} msgs</small>
              </div>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  function renderStatsPanel() {
    const data = panels.stats.payload?.data as StatsPanelData | undefined
    if (!data) {
      return <section className="panel-box empty">No stats data yet.</section>
    }

    return (
      <>
        <section className="cards">
          <article className="card">
            <p className="label">All Time Cost</p>
            <p className="value">{formatCost(data.totalCost)}</p>
          </article>
          <article className="card">
            <p className="label">Tracked Months</p>
            <p className="value">{formatCount(data.entries.length)}</p>
          </article>
        </section>
        <section className="panel-box">
          <h2>Monthly Overview</h2>
          <ul className="list">
            {data.entries.map((entry) => (
              <li key={entry.month}>
                <div>
                  <strong>{entry.month}</strong>
                  <p>{entry.models.length} models tracked</p>
                </div>
                <div className="row-values">
                  <span>{formatCost(entry.cost)}</span>
                  <small>{formatCount(entry.messageCount)} msgs</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </>
    )
  }

  function renderAgentsPanel() {
    const data = panels.agents.payload?.data as AgentsPanelData | undefined
    if (!data) {
      return <section className="panel-box empty">No agent scanner info yet.</section>
    }

    return (
      <section className="panel-box">
        <h2>Agent Discovery</h2>
        <ul className="list">
          {data.clients.map((entry) => (
            <li key={entry.client}>
              <div>
                <strong>{entry.label}</strong>
                <p>{entry.sessionsPath}</p>
              </div>
              <div className="row-values">
                <span>{entry.sessionsPathExists ? 'Ready' : 'Missing'}</span>
                <small>{formatCount(entry.messageCount)} msgs</small>
              </div>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  function renderActivePanel() {
    if (activeTab === 'overview') {
      return renderOverviewPanel()
    }

    if (activeTab === 'models') {
      return renderModelsPanel()
    }

    if (activeTab === 'daily') {
      return renderDailyPanel()
    }

    if (activeTab === 'hourly') {
      return renderHourlyPanel()
    }

    if (activeTab === 'stats') {
      return renderStatsPanel()
    }

    return renderAgentsPanel()
  }

  return (
    <main className="shell">
      <header className="titlebar">
        <div className="title-wrap">
          <p className="kicker">Tokscale Live</p>
          <h1>Token Floating Monitor</h1>
        </div>
        <div className="controls no-drag">
          <label className="field" htmlFor="refresh-interval">
            Interval
            <select
              id="refresh-interval"
              value={settings.refreshIntervalSec}
              onChange={(event) => {
                const nextSeconds = Number(event.target.value)
                void handleIntervalChange(nextSeconds)
              }}
            >
              {REFRESH_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`}
                </option>
              ))}
            </select>
          </label>
          <button className="ghost" type="button" onClick={() => void handleHideWindow()}>
            Hide
          </button>
          <button type="button" onClick={() => void handleRefresh()} disabled={refreshBusy}>
            {refreshBusy ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </header>

      <section className="hero-chart no-drag">
        <div className="hero-head">
          <div className="hero-brand">
            <img src="./logo.png" alt="Tokscale logo" className="brand-logo" />
            <div>
              <strong>24H Cost Curve</strong>
              <p>Hourly usage trend from tokscale</p>
            </div>
          </div>
          <div className="hero-metrics">
            <span>{formatCost(chartTotalCost)}</span>
            <small>Peak {chartPeak?.label ?? '--:--'} / {formatCost(chartPeak?.cost ?? 0)}</small>
          </div>
        </div>
        <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="hero-svg" aria-label="24 hour usage line chart">
          <defs>
            <linearGradient id="costLine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#75deff" />
              <stop offset="100%" stopColor="#56ffc8" />
            </linearGradient>
          </defs>
          <polyline
            points="4,38 96,38"
            className="baseline"
          />
          <polyline
            points={chartPolyline}
            className="curve"
          />
        </svg>
        <div className="axis-row">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>23:00</span>
        </div>
      </section>

      <section className="tab-strip no-drag">
        {(Object.keys(TAB_META) as DashboardTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab)
            }}
          >
            <strong>{TAB_META[tab].label}</strong>
            <small>{TAB_META[tab].hint}</small>
          </button>
        ))}
      </section>

      <section className="status-row no-drag">
        <span className={`dot ${activeTab === 'overview' ? snapshot.status : panelState?.status ?? 'loading'}`} aria-hidden="true" />
        <span className="status-text">{activeTab === 'overview' ? statusLabel(snapshot.status) : panelState?.status ?? 'idle'}</span>
        <span className="muted">Updated {formatTime(activeTimestamp)}</span>
      </section>

      {activeErrorMessage && <section className="error-box no-drag">{activeErrorMessage}</section>}

      <section className="panel-stack no-drag">{renderActivePanel()}</section>

      <footer className="footnote no-drag">
        Source command:{' '}
        <code>
          {activeTab === 'overview'
            ? snapshot.sourceCommand || 'auto-detect'
            : panelState?.payload?.sourceCommand || 'on demand'}
        </code>
        <span>
          {activeTab === 'overview'
            ? snapshot.processingTimeMs > 0
              ? `${snapshot.processingTimeMs} ms`
              : 'pending'
            : panelState?.payload
              ? `${(panelState.payload.data as { processingTimeMs?: number }).processingTimeMs ?? 0} ms`
              : 'pending'}
        </span>
      </footer>
    </main>
  )
}

export default App
