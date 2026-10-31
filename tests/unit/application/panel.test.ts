import assert from 'node:assert/strict'
import test from 'node:test'
import { visibleListeners } from '../../../application/panel'
import type { ListenerRow, Snapshot } from '../../../types'

test('visibleListeners hides system rows in the dev view and matches search terms', () => {
  const snapshot = sampleSnapshot()
  const devRows = visibleListeners(snapshot, '')
  assert.deepEqual(devRows.map((row) => row.port), [3000])

  const searched = visibleListeners(snapshot, 'vite shop')
  assert.deepEqual(searched.map((row) => row.id), ['222:3000'])

  const systemRows = visibleListeners({ ...snapshot, settings: { ...snapshot.settings, filter: 'system' } }, '')
  assert.deepEqual(systemRows.map((row) => row.port), [5000])
})

function sampleSnapshot(): Snapshot {
  return {
    listeners: [serverRow(), systemRow()],
    scannedAt: '2026-10-28T10:00:00.000Z',
    error: null,
    settings: { openAtLogin: false, closeAfterAction: false, sortKey: 'port', filter: 'dev' },
    shortcutRegistered: true,
    homeDirectory: '/Users/samra',
    devListenerCount: 1,
  }
}

function serverRow(): ListenerRow {
  return {
    id: '222:3000',
    port: 3000,
    pid: 222,
    processName: 'node',
    commandLine: 'node /repo/node_modules/vite/bin/vite.js',
    cwd: '/Users/samra/shop-web',
    projectName: 'shop-web',
    addresses: ['127.0.0.1'],
    bindScope: 'localhost',
    cpuPercent: 1,
    memoryMb: 80,
    uptimeSeconds: 30,
    runtime: 'Node',
    framework: 'Vite',
    confidence: 'high',
    hostAppName: null,
    hostAppPath: null,
    canStop: true,
    stopBlockReason: null,
    isSystem: false,
    openUrl: 'http://127.0.0.1:3000',
  }
}

function systemRow(): ListenerRow {
  return {
    ...serverRow(),
    id: '681:5000',
    port: 5000,
    pid: 681,
    processName: 'ControlCenter',
    commandLine: '/System/Library/CoreServices/ControlCenter.app/Contents/MacOS/ControlCenter',
    cwd: null,
    projectName: null,
    framework: null,
    runtime: null,
    confidence: 'low',
    canStop: false,
    stopBlockReason: 'System process.',
    isSystem: true,
    openUrl: 'http://127.0.0.1:5000',
  }
}
