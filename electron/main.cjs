const { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { autoUpdater } = require('electron-updater')

const DEFAULT_INTERVAL_MS = 30000
const MIN_INTERVAL_MS = 5000
const MAX_INTERVAL_MS = 300000
const MAX_BACKOFF_MS = 120000
const COMMAND_TIMEOUT_MS = 90000
const OVERVIEW_ARGS = ['--json', '--today', '--no-spinner']
const MODELS_ARGS = ['models', '--json', '--today', '--no-spinner']
const DAILY_ARGS = ['hourly', '--json', '--week', '--no-spinner']
const HOURLY_ARGS = ['hourly', '--json', '--today', '--no-spinner']
const STATS_ARGS = ['monthly', '--json', '--no-spinner']
const AGENTS_ARGS = ['clients', '--json']

function detectProxy() {
  if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY) {
    return Promise.resolve(null)
  }

  const net = require('node:net')
  return new Promise((resolve) => {
    const socket = net.createConnection(7890, '127.0.0.1', () => {
      socket.destroy()
      resolve('http://127.0.0.1:7890')
    })
    socket.on('error', () => resolve(null))
    socket.setTimeout(3000, () => {
      socket.destroy()
      resolve(null)
    })
  })
}

const LOG_FILE = app.isPackaged ? null : path.join(__dirname, '..', 'dev_main.log')

function devLog(msg) {
  if (!LOG_FILE) return
  const ts = new Date().toISOString().slice(11, 19)
  try { fs.appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`) } catch (_e) { /* ignore */ }
}

let cachedProxyUrl = null

let mainWindow = null
let tray = null
let isQuitting = false
let refreshIntervalMs = DEFAULT_INTERVAL_MS
let consecutiveFailures = 0
let pollingInFlight = false
let pollTimer = null

let latestSnapshot = createSnapshot({
  status: 'loading',
  errorMessage: 'Waiting for first refresh.',
})

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }

  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
})

app.on('window-all-closed', (event) => {
  if (!isQuitting) {
    event.preventDefault()
  }
})

// 自动更新事件监听器
if (app.isPackaged) {
  autoUpdater.on('checking-for-update', () => {
    console.log('[auto-updater] Checking for updates...')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { status: 'checking' })
    }
  })
  
  autoUpdater.on('update-available', (info) => {
    console.log('[auto-updater] Update available:', info.version)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info)
    }
  })
  
  autoUpdater.on('update-not-available', () => {
    console.log('[auto-updater] Update not available')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { status: 'up-to-date' })
    }
  })
  
  autoUpdater.on('error', (err) => {
    console.log('[auto-updater] Error:', err.message)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { status: 'error', message: err.message })
    }
  })
  
  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`[auto-updater] Download progress: ${progressObj.percent}%`)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-progress', progressObj)
    }
  })
  
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[auto-updater] Update downloaded, will install on quit')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', info)
    }
  })
}

app.whenReady().then(async () => {
  app.setAppUserModelId('com.tokscale.floatingmonitor')
  cachedProxyUrl = await detectProxy()
  if (cachedProxyUrl) {
    console.log('[tokscale-monitor] Auto-detected proxy:', cachedProxyUrl)
    devLog('Auto-detected proxy: ' + cachedProxyUrl)
  }
  createMainWindow()
  createTray()
  registerIpcHandlers()
  devLog('Scheduling first poll in 500ms')
  schedulePoll(500)
  
  // 初始化自动更新（如果配置了发布服务器）
  if (app.isPackaged) {
    autoUpdater.logger = console
    autoUpdater.autoDownload = false  // 手动下载更新
    autoUpdater.autoInstallOnAppQuit = true  // 退出时自动安装
    
    // 检查更新，但不自动下载
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.log('[auto-updater] Check failed (normal if no publish config):', err.message)
      })
    }, 10000)  // 延迟10秒检查，避免影响启动
  }
})

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
  }

  showMainWindow()
})

function createSnapshot(partial = {}) {
  return {
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
    lastUpdated: new Date().toISOString(),
    errorMessage: '',
    ...partial,
  }
}

function resolveLogoPath() {
  const candidates = []

  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'logo.png'))
    candidates.push(path.join(app.getAppPath(), 'dist', 'logo.png'))
  }

  candidates.push(path.join(__dirname, '..', 'dist', 'logo.png'))
  candidates.push(path.join(__dirname, '..', 'public', 'logo.png'))

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }

  return process.execPath
}

function createMainWindow() {
  const logoPath = resolveLogoPath()

  mainWindow = new BrowserWindow({
    width: 460,
    height: 620,
    minWidth: 420,
    minHeight: 520,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#08111c',
    title: 'Tokscale Floating Monitor',
    icon: logoPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.setMenuBarVisibility(false)
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  } else {
    mainWindow.loadURL('http://localhost:5173')
  }

  mainWindow.once('ready-to-show', () => {
    showMainWindow()
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    mainWindow.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray() {
  const trayImage = nativeImage.createFromPath(resolveLogoPath())
  const trayIcon = trayImage.isEmpty()
    ? nativeImage.createFromPath(process.execPath).resize({ width: 16, height: 16 })
    : trayImage.resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('Tokscale Floating Monitor')
  tray.on('click', toggleMainWindow)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show / Hide',
      click: toggleMainWindow,
    },
    {
      label: 'Refresh now',
      click: () => {
        void refreshNow()
      },
    },
    {
      label: 'Check for updates',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('check-updates')
        }
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    return
  }

  showMainWindow()
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

function registerIpcHandlers() {
  ipcMain.handle('metrics:get-latest', () => {
    return latestSnapshot
  })

  ipcMain.handle('metrics:refresh', async () => {
    return refreshNow()
  })

  ipcMain.handle('settings:get', () => {
    return {
      refreshIntervalSec: Math.round(refreshIntervalMs / 1000),
    }
  })

  ipcMain.handle('settings:set-refresh-interval', (_event, seconds) => {
    const requested = Number(seconds)
    if (!Number.isFinite(requested)) {
      throw new Error('Refresh interval must be a number.')
    }

    const normalizedMs = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, Math.round(requested * 1000)))
    refreshIntervalMs = normalizedMs
    schedulePoll(refreshIntervalMs)

    return {
      refreshIntervalSec: Math.round(refreshIntervalMs / 1000),
    }
  })

  ipcMain.handle('panel:get', async (_event, tab) => {
    return fetchPanelData(tab)
  })

  ipcMain.handle('window:hide', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide()
    }
  })
  
  // 更新相关 IPC 处理程序
  ipcMain.handle('updater:check', () => {
    if (app.isPackaged) {
      return autoUpdater.checkForUpdates().catch(err => {
        console.log('[updater] Manual check failed:', err.message)
        throw err
      })
    } else {
      throw new Error('Auto-update only available in packaged app')
    }
  })
  
  ipcMain.handle('updater:download', () => {
    if (app.isPackaged) {
      return autoUpdater.downloadUpdate().catch(err => {
        console.log('[updater] Download failed:', err.message)
        throw err
      })
    } else {
      throw new Error('Auto-update only available in packaged app')
    }
  })
  
  ipcMain.handle('updater:install', () => {
    if (app.isPackaged) {
      autoUpdater.quitAndInstall()
      return true
    } else {
      throw new Error('Auto-update only available in packaged app')
    }
  })
  
  ipcMain.handle('updater:open-releases', () => {
    shell.openExternal('https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/releases')
  })
}

function schedulePoll(delayMs) {
  if (pollTimer) {
    clearTimeout(pollTimer)
  }

  pollTimer = setTimeout(() => {
    void pollOnce()
  }, delayMs)
}

async function refreshNow() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }

  return pollOnce()
}

async function pollOnce() {
  if (pollingInFlight) {
    schedulePoll(refreshIntervalMs)
    return latestSnapshot
  }

  pollingInFlight = true
  devLog('pollOnce: starting OVERVIEW poll')
  try {
    const { payload, sourceCommand } = await readTokscalePayload(OVERVIEW_ARGS)
    const normalized = normalizeTokscalePayload(payload)
    latestSnapshot = createSnapshot({
      ...normalized,
      status: 'ok',
      sourceCommand,
      errorMessage: '',
      lastUpdated: new Date().toISOString(),
    })

    consecutiveFailures = 0
    devLog('pollOnce: SUCCESS entries=' + normalized.entries.length + ' cost=' + normalized.totalCost)
    broadcastSnapshot(latestSnapshot)
  } catch (error) {
    consecutiveFailures += 1
    const message = error instanceof Error ? error.message : 'Unknown polling error.'
    devLog('pollOnce: FAILED attempt=' + consecutiveFailures + ' err=' + message.slice(0, 200))
    latestSnapshot = createSnapshot({
      ...latestSnapshot,
      status: 'error',
      errorMessage: message,
      lastUpdated: new Date().toISOString(),
    })
    broadcastSnapshot(latestSnapshot)
  } finally {
    pollingInFlight = false
  }

  const nextDelay =
    latestSnapshot.status === 'ok'
      ? refreshIntervalMs
      : Math.min(refreshIntervalMs * 2 ** Math.min(consecutiveFailures, 4), MAX_BACKOFF_MS)

  schedulePoll(nextDelay)
  return latestSnapshot
}

function broadcastSnapshot(snapshot) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  mainWindow.webContents.send('metrics:update', snapshot)
}

async function fetchPanelData(tab) {
  const tabKey = String(tab || '').toLowerCase()
  devLog('fetchPanelData: tab=' + tabKey)

  if (tabKey === 'models') {
    const { payload, sourceCommand, sourceArgs } = await readTokscalePayload(MODELS_ARGS)
    return {
      tab: 'models',
      fetchedAt: new Date().toISOString(),
      sourceCommand,
      sourceArgs,
      data: normalizeTokscalePayload(payload),
    }
  }

  if (tabKey === 'hourly') {
    const { payload, sourceCommand, sourceArgs } = await readTokscalePayload(HOURLY_ARGS)
    return {
      tab: 'hourly',
      fetchedAt: new Date().toISOString(),
      sourceCommand,
      sourceArgs,
      data: normalizeHourlyPayload(payload),
    }
  }

  if (tabKey === 'daily') {
    const { payload, sourceCommand, sourceArgs } = await readTokscalePayload(DAILY_ARGS)
    const hourly = normalizeHourlyPayload(payload)
    return {
      tab: 'daily',
      fetchedAt: new Date().toISOString(),
      sourceCommand,
      sourceArgs,
      data: buildDailyFromHourly(hourly),
    }
  }

  if (tabKey === 'stats') {
    const { payload, sourceCommand, sourceArgs } = await readTokscalePayload(STATS_ARGS)
    return {
      tab: 'stats',
      fetchedAt: new Date().toISOString(),
      sourceCommand,
      sourceArgs,
      data: normalizeStatsPayload(payload),
    }
  }

  if (tabKey === 'agents') {
    const { payload, sourceCommand, sourceArgs } = await readTokscalePayload(AGENTS_ARGS)
    return {
      tab: 'agents',
      fetchedAt: new Date().toISOString(),
      sourceCommand,
      sourceArgs,
      data: normalizeAgentsPayload(payload),
    }
  }

  throw new Error(`Unsupported panel: ${String(tab)}`)
}

function normalizeTokscalePayload(payload) {
  const entries = Array.isArray(payload.entries)
    ? payload.entries.map((entry) => ({
        client: stringOrEmpty(entry.client),
        mergedClients: Array.isArray(entry.mergedClients) ? entry.mergedClients.map(String) : null,
        model: stringOrEmpty(entry.model),
        provider: stringOrEmpty(entry.provider),
        input: numberOrZero(entry.input),
        output: numberOrZero(entry.output),
        cacheRead: numberOrZero(entry.cacheRead),
        cacheWrite: numberOrZero(entry.cacheWrite),
        reasoning: numberOrZero(entry.reasoning),
        messageCount: numberOrZero(entry.messageCount),
        cost: numberOrZero(entry.cost),
      }))
    : []

  return {
    entries,
    totalInput: numberOrZero(payload.totalInput),
    totalOutput: numberOrZero(payload.totalOutput),
    totalCacheRead: numberOrZero(payload.totalCacheRead),
    totalCacheWrite: numberOrZero(payload.totalCacheWrite),
    totalMessages: numberOrZero(payload.totalMessages),
    totalCost: numberOrZero(payload.totalCost),
    processingTimeMs: numberOrZero(payload.processingTimeMs),
  }
}

function normalizeHourlyPayload(payload) {
  const entries = Array.isArray(payload.entries)
    ? payload.entries.map((entry) => ({
        hour: stringOrEmpty(entry.hour),
        clients: Array.isArray(entry.clients) ? entry.clients.map(String) : [],
        models: Array.isArray(entry.models) ? entry.models.map(String) : [],
        input: numberOrZero(entry.input),
        output: numberOrZero(entry.output),
        cacheRead: numberOrZero(entry.cacheRead),
        cacheWrite: numberOrZero(entry.cacheWrite),
        messageCount: numberOrZero(entry.messageCount),
        turnCount: numberOrZero(entry.turnCount),
        cost: numberOrZero(entry.cost),
      }))
    : []

  return {
    entries,
    totalCost: numberOrZero(payload.totalCost),
    processingTimeMs: numberOrZero(payload.processingTimeMs),
  }
}

function buildDailyFromHourly(hourlyData) {
  const dayMap = new Map()

  for (const entry of hourlyData.entries) {
    const day = entry.hour.split(' ')[0] || entry.hour
    if (!dayMap.has(day)) {
      dayMap.set(day, {
        day,
        clients: new Set(),
        models: new Set(),
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        messageCount: 0,
        turnCount: 0,
        cost: 0,
        activeHours: 0,
      })
    }

    const bucket = dayMap.get(day)
    entry.clients.forEach((client) => bucket.clients.add(client))
    entry.models.forEach((model) => bucket.models.add(model))
    bucket.input += entry.input
    bucket.output += entry.output
    bucket.cacheRead += entry.cacheRead
    bucket.cacheWrite += entry.cacheWrite
    bucket.messageCount += entry.messageCount
    bucket.turnCount += entry.turnCount
    bucket.cost += entry.cost
    bucket.activeHours += 1
  }

  const entries = [...dayMap.values()]
    .map((bucket) => ({
      day: bucket.day,
      clients: [...bucket.clients].sort((a, b) => a.localeCompare(b)),
      models: [...bucket.models].sort((a, b) => a.localeCompare(b)),
      input: bucket.input,
      output: bucket.output,
      cacheRead: bucket.cacheRead,
      cacheWrite: bucket.cacheWrite,
      messageCount: bucket.messageCount,
      turnCount: bucket.turnCount,
      cost: bucket.cost,
      activeHours: bucket.activeHours,
    }))
    .sort((left, right) => right.day.localeCompare(left.day))

  return {
    entries,
    totalCost: entries.reduce((sum, entry) => sum + entry.cost, 0),
    processingTimeMs: hourlyData.processingTimeMs,
  }
}

function normalizeStatsPayload(payload) {
  const entries = Array.isArray(payload.entries)
    ? payload.entries.map((entry) => ({
        month: stringOrEmpty(entry.month),
        models: Array.isArray(entry.models) ? entry.models.map(String) : [],
        input: numberOrZero(entry.input),
        output: numberOrZero(entry.output),
        cacheRead: numberOrZero(entry.cacheRead),
        cacheWrite: numberOrZero(entry.cacheWrite),
        messageCount: numberOrZero(entry.messageCount),
        cost: numberOrZero(entry.cost),
      }))
    : []

  return {
    entries,
    totalCost: numberOrZero(payload.totalCost),
    processingTimeMs: numberOrZero(payload.processingTimeMs),
  }
}

function normalizeAgentsPayload(payload) {
  const clients = Array.isArray(payload.clients)
    ? payload.clients.map((entry) => ({
        client: stringOrEmpty(entry.client),
        label: stringOrEmpty(entry.label),
        sessionsPath: stringOrEmpty(entry.sessionsPath),
        sessionsPathExists: Boolean(entry.sessionsPathExists),
        messageCount: numberOrZero(entry.messageCount),
        headlessSupported: Boolean(entry.headlessSupported),
        headlessMessageCount: numberOrZero(entry.headlessMessageCount),
      }))
    : []

  return {
    clients,
    headlessRoots: Array.isArray(payload.headlessRoots) ? payload.headlessRoots.map(String) : [],
    note: stringOrEmpty(payload.note),
  }
}

function numberOrZero(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function stringOrEmpty(value) {
  return typeof value === 'string' ? value : ''
}

function parseJsonSafely(rawOutput) {
  const trimmed = rawOutput.trim().replace(/^\uFEFF/, '')
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch (_error) {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch (_secondError) {
        return null
      }
    }

    return null
  }
}

async function readTokscalePayload(args = OVERVIEW_ARGS) {
  const candidates = getTokscaleCandidates()
  const errors = []

  for (const candidate of candidates) {
    try {
      const { stdout, stderr } = await executeTokscaleCandidate(candidate, args)
      const parsed = parseJsonSafely(stdout)
      if (!parsed || typeof parsed !== 'object') {
        throw new Error(`Command output is not valid JSON. stdout=${stdout.length}B stderr=${stderr.slice(0, 200)}`)
      }

      return {
        payload: parsed,
        sourceCommand: candidate,
        sourceArgs: [...args],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${candidate} -> ${message}`)
    }
  }

  throw new Error(`Unable to execute tokscale. ${errors.join(' | ')}`)
}

function getTokscaleCandidates() {
  const fromEnv = process.env.TOKSCALE_PATH ? [normalizeCandidate(process.env.TOKSCALE_PATH)] : []
  const appData = process.env.APPDATA || ''
  const bundled = app.isPackaged
    ? [path.join(process.resourcesPath, 'tokscale.exe')]
    : [path.join(__dirname, '..', 'build', 'tokscale.exe')]
  const tokscaleNativeBin = appData
    ? [path.join(appData, 'npm', 'node_modules', 'tokscale', 'node_modules', '@tokscale', 'cli-win32-x64-msvc', 'bin', 'tokscale.exe')]
    : []
  const appDataBin = appData ? [path.join(appData, 'npm', 'node_modules', 'tokscale', 'bin.js')] : []
  const winDefault = appData ? [path.join(appData, 'npm', 'tokscale.cmd')] : []
  const pathFallback = ['tokscale', 'tokscale.cmd', 'tokscale.exe']
  const envDerivedBin = fromEnv.flatMap((value) => deriveBinFromCommandPath(value))

  const fileCandidates = [...bundled, ...tokscaleNativeBin, ...appDataBin, ...envDerivedBin].filter((candidate) => fs.existsSync(candidate))

  return [...new Set([...fileCandidates, ...fromEnv, ...winDefault, ...pathFallback])]
}

function executeTokscaleCandidate(candidate, args) {
  return new Promise((resolve, reject) => {
    const target = normalizeCandidate(candidate)

    const env = Object.assign({}, process.env, {
      APPDATA: process.env.APPDATA,
      LOCALAPPDATA: process.env.LOCALAPPDATA,
      USERPROFILE: process.env.USERPROFILE,
      HOME: process.env.USERPROFILE,
      PATH: process.env.PATH,
      NODE_ENV: 'production',
    })

    if (cachedProxyUrl && !env.HTTPS_PROXY && !env.HTTP_PROXY) {
      env.HTTPS_PROXY = cachedProxyUrl
      env.HTTP_PROXY = cachedProxyUrl
    }

    if (isNodeScript(target)) {
      const nodeRuntime = getNodeRuntimeForScript(target)
      const child = spawn(nodeRuntime, [target, ...args], {
        windowsHide: true,
        shell: false,
        env,
      })

      attachProcessEvents(child, resolve, reject)
      return
    }

    const child =
      process.platform === 'win32' && isWindowsCmdScript(target)
        ? spawn(
            process.env.ComSpec || 'cmd.exe',
            ['/d', '/s', '/c', formatCmdCommand(target, args)],
            {
              windowsHide: true,
              shell: false,
              windowsVerbatimArguments: true,
              env,
            },
          )
        : spawn(target, args, {
            windowsHide: true,
            shell: false,
            env,
          })

    attachProcessEvents(child, resolve, reject)
  })
}

function attachProcessEvents(child, resolve, reject) {
  let stdout = ''
  let stderr = ''
  let completed = false

  const timeoutId = setTimeout(() => {
    if (completed) {
      return
    }

    completed = true
    child.kill()
    const stderrHint = stderr.trim() ? ` stderr: ${stderr.trim().slice(0, 300)}` : ''
    reject(new Error(`Timed out after ${COMMAND_TIMEOUT_MS}ms.${stderrHint}`))
  }, COMMAND_TIMEOUT_MS)

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString('utf8')
  })

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString('utf8')
  })

  child.on('error', (error) => {
    if (completed) {
      return
    }

    completed = true
    clearTimeout(timeoutId)
    reject(error)
  })

  child.on('close', (exitCode) => {
    if (completed) {
      return
    }

    completed = true
    clearTimeout(timeoutId)

    if (exitCode !== 0) {
      reject(new Error(`Exit code ${exitCode}. ${stderr.trim().slice(0, 500)}`))
      return
    }

    resolve({ stdout, stderr })
  })
}

function normalizeCandidate(value) {
  return String(value).trim().replace(/^"|"$/g, '')
}

function deriveBinFromCommandPath(value) {
  const normalized = normalizeCandidate(value)
  if (!normalized) {
    return []
  }

  if (normalized.endsWith('.js')) {
    return [normalized]
  }

  if (normalized.endsWith('.exe') && !normalized.endsWith('node.exe')) {
    return [normalized]
  }

  const directory = path.dirname(normalized)
  if (!directory || directory === '.' || directory === '\\') {
    return []
  }

  return [path.join(directory, 'node_modules', 'tokscale', 'bin.js')]
}

function isNodeScript(target) {
  return target.toLowerCase().endsWith('.js')
}

function getNodeRuntimeForScript(scriptPath) {
  if (process.platform !== 'win32') {
    return 'node'
  }

  const fromEnv = normalizeCandidate(process.env.NODE_EXE || process.env.NODE || '')
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv
  }

  const npmDir = path.resolve(path.dirname(scriptPath), '..', '..', '..')
  const embeddedNode = path.join(npmDir, 'node.exe')
  if (fs.existsSync(embeddedNode)) {
    return embeddedNode
  }

  const commonInstallPaths = [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe') : '',
    process.env['ProgramFiles(x86)'] ? path.join(process.env['ProgramFiles(x86)'], 'nodejs', 'node.exe') : '',
  ]

  for (const candidate of commonInstallPaths) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate
    }
  }

  return 'node'
}

function isWindowsCmdScript(target) {
  const normalized = target.toLowerCase()
  return normalized.endsWith('.cmd') || normalized.endsWith('.bat')
}

function formatCmdCommand(commandPath, args) {
  const escapedCommand = `"${String(commandPath).replace(/"/g, '""')}"`
  const escapedArgs = args.map((arg) => `"${String(arg).replace(/"/g, '""')}"`).join(' ')
  return `${escapedCommand} ${escapedArgs}`
}
