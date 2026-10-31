import fs from 'node:fs'
import path from 'node:path'
import type { Settings } from '../../types'
import { isListenerFilter, isSortKey } from './guards'

export const defaultSettings: Settings = {
  openAtLogin: false,
  closeAfterAction: false,
  sortKey: 'port',
  filter: 'dev',
}

export function loadSettings(directory: string): Settings {
  try {
    const raw = fs.readFileSync(settingsPath(directory), 'utf8')
    return normalizeSettings(JSON.parse(raw) as unknown)
  } catch {
    return { ...defaultSettings }
  }
}

export function saveSettings(directory: string, settings: Settings): void {
  fs.mkdirSync(directory, { recursive: true })
  const temporaryPath = `${settingsPath(directory)}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  fs.renameSync(temporaryPath, settingsPath(directory))
}

export function normalizeSettings(value: unknown): Settings {
  const record = isRecord(value) ? value : {}
  return {
    openAtLogin: typeof record.openAtLogin === 'boolean' ? record.openAtLogin : defaultSettings.openAtLogin,
    closeAfterAction: typeof record.closeAfterAction === 'boolean' ? record.closeAfterAction : defaultSettings.closeAfterAction,
    sortKey: isSortKey(record.sortKey) ? record.sortKey : defaultSettings.sortKey,
    filter: isListenerFilter(record.filter) ? record.filter : defaultSettings.filter,
  }
}

export function settingsPatch(value: unknown): Partial<Settings> | null {
  if (!isRecord(value)) return null
  const patch: Partial<Settings> = {}
  if (typeof value.openAtLogin === 'boolean') patch.openAtLogin = value.openAtLogin
  if (typeof value.closeAfterAction === 'boolean') patch.closeAfterAction = value.closeAfterAction
  if (isSortKey(value.sortKey)) patch.sortKey = value.sortKey
  if (isListenerFilter(value.filter)) patch.filter = value.filter
  return patch
}

function settingsPath(directory: string): string {
  return path.join(directory, 'settings.json')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
