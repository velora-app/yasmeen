import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, screen, shell, Tray } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  channels,
  listenerIdPattern,
  panelHeight,
  panelWidth,
  previewSnapshotDelayMs,
  scanIntervalMs,
  shortcutAccelerator,
  stopVisibleLimit,
} from '../lib/constants'
import { logger } from '../lib/logger'
import { execFileText, scanListeners, stopListener, type StopGate } from '../lib/listeners'
import { loadSettings, normalizeSettings, saveSettings, settingsPatch } from '../lib/storage'
import type { ActionResult, BulkStopResult, ListenerRow, Snapshot, StopSignal } from '../types'
import { createTrayImage } from './trayIcon'

const preview = process.env.YASMEEN_PREVIEW === '1'

let tray: Tray | null = null
let panel: BrowserWindow | null = null
let latest: Snapshot | null = null
let gate: StopGate = { currentUid: process.getuid?.() ?? -1, ownPids: new Set([process.pid]), ownExecutablePath: '' }
let scanInFlight: Promise<Snapshot> | null = null
let shortcutRegistered = false
let quitting = false
let ignoreNextTrayClick = false

if (process.platform !== 'darwin') {
  logger.error('Yasmeen runs on macOS.')
  process.exit(1)
}

app.setName('Yasmeen')

app.whenReady().then(() => {
  app.setActivationPolicy(preview ? 'regular' : 'accessory')
  const settingsDirectory = app.getPath('userData')
  const settings = loadSettings(settingsDirectory)
  gate = { ...gate, ownExecutablePath: app.getPath('exe') }
  if (settings.openAtLogin) applyLoginItem(true)
  panel = createPanel()
  tray = createTray()
  registerIpc(settingsDirectory)
  shortcutRegistered = globalShortcut.register(shortcutAccelerator, () => togglePanel())
  panel.webContents.on('did-finish-load', () => {
    void publish()
  })
  setInterval(() => {
    void publish()
  }, scanIntervalMs)
  if (preview) {
    panel.setPosition(180, 80)
    panel.show()
  }
}).catch((error: unknown) => {
  logger.error('Yasmeen failed to start.', error)
  app.quit()
})

app.on('before-quit', () => {
  quitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  // A menu bar app keeps running after its panel hides.
})

function createPanel(): BrowserWindow {
  const window = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    show: false,
    frame: false,
    resizable: false,
    movable: preview,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: !preview,
    alwaysOnTop: !preview,
    transparent: false,
    backgroundColor: '#f7fffb',
    roundedCorners: true,
    hasShadow: true,
    title: 'Yasmeen',
    type: preview ? undefined : 'panel',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })
  window.on('blur', () => {
    if (preview || !window.isVisible()) return
    window.hide()
    ignoreNextTrayClick = true
    setTimeout(() => {
      ignoreNextTrayClick = false
    }, 280)
  })
  window.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    window.hide()
  })
  if (preview && process.env.YASMEEN_SNAPSHOT) {
    const snapshotFile = process.env.YASMEEN_SNAPSHOT
    window.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        void writePreviewSnapshot(snapshotFile)
      }, previewSnapshotDelayMs)
    })
  }
  void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  return window
}

function createTray(): Tray {
  const created = new Tray(createTrayImage())
  created.setToolTip('Yasmeen')
  created.on('click', () => {
    if (ignoreNextTrayClick) {
      ignoreNextTrayClick = false
      return
    }
    togglePanel()
  })
  return created
}

function togglePanel(): void {
  if (!panel) return
  if (panel.isVisible()) {
    panel.hide()
    return
  }
  positionPanel(panel)
  panel.show()
  panel.focus()
}

function positionPanel(window: BrowserWindow): void {
  const trayBounds = tray?.getBounds() ?? { x: 0, y: 0, width: 0, height: 0 }
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })
  const area = display.workArea
  let x = Math.round(trayBounds.x + trayBounds.width / 2 - panelWidth / 2)
  const y = Math.round(trayBounds.y + trayBounds.height + 6)
  x = Math.min(Math.max(x, area.x + 8), area.x + area.width - panelWidth - 8)
  const top = Math.min(y, area.y + area.height - panelHeight - 8)
  window.setPosition(x, Math.max(area.y + 8, top), false)
}

function registerIpc(settingsDirectory: string): void {
  ipcMain.handle(channels.refresh, () => publish())
  ipcMain.handle(channels.hide, () => {
    panel?.hide()
  })
  ipcMain.handle(channels.updateSettings, (_event, patch: unknown) => {
    const nextPatch = settingsPatch(patch)
    if (!nextPatch) return publish()
    const next = normalizeSettings({ ...(latest?.settings ?? loadSettings(settingsDirectory)), ...nextPatch })
    saveSettings(settingsDirectory, next)
    if (typeof nextPatch.openAtLogin === 'boolean') applyLoginItem(next.openAtLogin)
    return publish()
  })
  ipcMain.handle(channels.open, async (_event, id: unknown) => actOnListener(id, openListener))
  ipcMain.handle(channels.copy, async (_event, id: unknown) => actOnListener(id, copyListener))
  ipcMain.handle(channels.focus, async (_event, id: unknown) => actOnListener(id, focusListener))
  ipcMain.handle(channels.stop, async (_event, payload: unknown) => {
    const request = parseStopRequest(payload)
    if (!request) return { ok: false, message: 'Unusable stop request.' }
    const row = findListener(request.id)
    if (!row) return { ok: false, message: 'That listener is no longer here.' }
    const result = await stopListener(row, request.signal, gate)
    await publish()
    return result
  })
  ipcMain.handle(channels.stopVisible, async (_event, ids: unknown) => stopVisible(ids))
}

async function actOnListener(id: unknown, action: (row: ListenerRow) => Promise<ActionResult>): Promise<ActionResult> {
  if (!isListenerId(id)) return { ok: false, message: 'Unusable listener.' }
  const row = findListener(id)
  if (!row) return { ok: false, message: 'That listener is no longer here.' }
  const result = await action(row)
  if (result.ok && latest?.settings.closeAfterAction) panel?.hide()
  return result
}

async function openListener(row: ListenerRow): Promise<ActionResult> {
  if (!row.openUrl) return { ok: false, message: 'This listener has no local URL.' }
  await shell.openExternal(row.openUrl)
  return { ok: true, message: `Opened ${row.openUrl}` }
}

async function copyListener(row: ListenerRow): Promise<ActionResult> {
  clipboard.writeText(listenerDetails(row))
  return { ok: true, message: `Copied port ${row.port}.` }
}

async function focusListener(row: ListenerRow): Promise<ActionResult> {
  if (!isApplicationPath(row.hostAppPath)) return { ok: false, message: 'No host app to focus.' }
  await execFileText('/usr/bin/open', [row.hostAppPath])
  return { ok: true, message: `Focused ${row.hostAppName ?? 'host app'}.` }
}

async function stopVisible(ids: unknown): Promise<BulkStopResult> {
  if (!Array.isArray(ids) || ids.length > stopVisibleLimit || ids.some((id) => !isListenerId(id))) {
    return { ok: false, message: 'Unusable stop request.', stoppedIds: [] }
  }
  const chosen: ListenerRow[] = []
  const seenPids = new Set<number>()
  for (const id of ids) {
    const row = findListener(id)
    if (!row || !row.canStop || seenPids.has(row.pid)) continue
    seenPids.add(row.pid)
    chosen.push(row)
  }
  if (chosen.length === 0) return { ok: false, message: 'Nothing visible can be stopped.', stoppedIds: [] }
  const stoppedIds: string[] = []
  const failures: string[] = []
  for (const row of chosen) {
    const result = await stopListener(row, 'SIGTERM', gate)
    if (result.ok) stoppedIds.push(row.id)
    else failures.push(result.message)
  }
  await publish()
  if (failures.length > 0) {
    return {
      ok: false,
      message: `Stopped ${stoppedIds.length}. ${failures[0] ?? 'Some processes stayed running.'}`,
      stoppedIds,
    }
  }
  return { ok: true, message: `Stop sent to ${stoppedIds.length} process${stoppedIds.length === 1 ? '' : 'es'}.`, stoppedIds }
}

function publish(): Promise<Snapshot> {
  if (scanInFlight) return scanInFlight
  scanInFlight = publishNow().finally(() => {
    scanInFlight = null
  })
  return scanInFlight
}

async function publishNow(): Promise<Snapshot> {
  const settingsDirectory = app.getPath('userData')
  const scan = await scanListeners(app.getPath('exe'))
  gate = {
    currentUid: scan.context.currentUid,
    ownPids: scan.context.ownPids,
    ownExecutablePath: scan.context.ownExecutablePath,
  }
  const devListenerCount = scan.listeners.filter((row) => !row.isSystem).length
  const snapshot: Snapshot = {
    listeners: scan.listeners,
    scannedAt: new Date().toISOString(),
    error: scan.error,
    settings: loadSettings(settingsDirectory),
    shortcutRegistered,
    homeDirectory: scan.context.homeDirectory,
    devListenerCount,
  }
  latest = snapshot
  tray?.setTitle(devListenerCount > 0 ? ` ${devListenerCount}` : '')
  tray?.setToolTip(devListenerCount === 0 ? 'Yasmeen' : `Yasmeen ${devListenerCount}`)
  if (panel && !panel.isDestroyed() && !panel.webContents.isDestroyed()) {
    panel.webContents.send(channels.snapshot, snapshot)
  }
  return snapshot
}

function findListener(id: string): ListenerRow | null {
  return latest?.listeners.find((row) => row.id === id) ?? null
}

function listenerDetails(row: ListenerRow): string {
  return [
    `Port ${row.port}`,
    `Process ${row.processName} (pid ${row.pid})`,
    `Command ${row.commandLine}`,
    row.cwd ? `Directory ${row.cwd}` : null,
    `Address ${row.addresses.join(', ')}`,
    row.runtime ? `Runtime ${row.runtime}` : null,
    row.framework ? `Framework ${row.framework}` : null,
    row.hostAppName ? `Host ${row.hostAppName}` : null,
  ].filter((line): line is string => line !== null).join('\n')
}

async function writePreviewSnapshot(snapshotFile: string): Promise<void> {
  if (!panel) return
  const probe = `({
    subtitle: document.querySelector('#subtitle')?.textContent ?? '',
    bannerHidden: document.querySelector('#banner')?.hidden ?? true,
    banner: document.querySelector('#banner')?.textContent ?? '',
    rowCount: document.querySelectorAll('.row').length,
    empty: document.querySelector('.empty')?.textContent ?? '',
    ports: [...document.querySelectorAll('.port')].map((node) => node.textContent),
    actions: [...document.querySelectorAll('.row-actions button')].map((node) => node.textContent)
  })`
  const before = await panel.webContents.executeJavaScript(probe, true)
  await panel.webContents.executeJavaScript(`document.querySelector('.row')?.click()`, true)
  await new Promise((resolve) => setTimeout(resolve, 250))
  const after = await panel.webContents.executeJavaScript(probe, true)
  const image = await panel.webContents.capturePage()
  fs.mkdirSync(path.dirname(snapshotFile), { recursive: true })
  fs.writeFileSync(snapshotFile, image.toPNG())
  fs.writeFileSync(snapshotFile.replace(/\.png$/, '.json'), JSON.stringify({ before, after }, null, 2))
  if (process.env.YASMEEN_SNAPSHOT_EXIT === '1') app.quit()
}

function applyLoginItem(openAtLogin: boolean): void {
  try {
    app.setLoginItemSettings({ openAtLogin })
  } catch (error) {
    logger.error('Could not update the login item.', error)
  }
}

function parseStopRequest(value: unknown): { id: string; signal: StopSignal } | null {
  if (!isRecord(value) || !isListenerId(value.id)) return null
  if (value.signal !== 'SIGTERM' && value.signal !== 'SIGKILL') return null
  return { id: value.id, signal: value.signal }
}

function isListenerId(value: unknown): value is string {
  return typeof value === 'string' && listenerIdPattern.test(value)
}

function isApplicationPath(value: string | null): value is string {
  return value !== null && value.startsWith('/') && value.endsWith('.app') && !value.includes('\0')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
