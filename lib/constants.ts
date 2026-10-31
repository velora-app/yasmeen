/**
 * App-wide constants. Use these instead of magic strings and numbers.
 */
export const channels = {
  snapshot: 'snapshot',
  refresh: 'snapshot:refresh',
  open: 'listener:open',
  copy: 'listener:copy',
  focus: 'listener:focus',
  stop: 'listener:stop',
  stopVisible: 'listener:stop-visible',
  updateSettings: 'settings:update',
  hide: 'window:hide',
} as const

export const shortcutAccelerator = 'Command+Option+P'

export const panelWidth = 440

export const panelHeight = 660

export const scanIntervalMs = 4000

export const previewSnapshotDelayMs = 2200

export const stopVisibleLimit = 200

export const processCommandTimeoutMs = 8000

export const listenerIdPattern = /^\d+:\d+$/
