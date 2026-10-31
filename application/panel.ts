/**
 * Application layer: panel use case.
 * Turns a scan snapshot into the rows the view shows. The renderer only draws them.
 */
import { displayPath, formatBindScope } from '../lib/format'
import { isListenerFilter, isSortKey } from '../lib/storage/guards'
import type { ListenerFilter, ListenerRow, Snapshot, SortKey } from '../types'

export { isListenerFilter, isSortKey }

export function visibleListeners(snapshot: Snapshot | null, query: string): ListenerRow[] {
  if (!snapshot) return []
  return snapshot.listeners
    .filter((row) => matchesFilter(row, snapshot.settings.filter))
    .filter((row) => matchesQuery(row, query, snapshot.homeDirectory))
    .sort((left, right) => compareRows(left, right, snapshot.settings.sortKey))
}

export function rowSignature(row: ListenerRow): string {
  return [
    row.id,
    row.commandLine,
    row.framework ?? '',
    row.canStop,
    row.hostAppPath ?? '',
    Math.round(row.cpuPercent ?? -1),
    Math.round(row.memoryMb ?? -1),
  ].join('~')
}

export function metaLine(row: ListenerRow): string {
  const host = row.hostAppName === row.projectName ? null : row.hostAppName
  return [row.projectName, host].filter((part): part is string => Boolean(part)).join(' · ')
}

function matchesFilter(row: ListenerRow, filter: ListenerFilter): boolean {
  if (filter === 'system') return row.isSystem
  if (filter === 'all') return true
  if (row.isSystem) return false
  if (filter === 'localhost') return row.bindScope === 'localhost'
  return true
}

function matchesQuery(row: ListenerRow, rawQuery: string, homeDirectory: string): boolean {
  const terms = rawQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = [
    String(row.port),
    row.processName,
    row.commandLine,
    row.cwd ? displayPath(row.cwd, homeDirectory) : '',
    row.projectName ?? '',
    row.runtime ?? '',
    row.framework ?? '',
    row.hostAppName ?? '',
    String(row.pid),
    formatBindScope(row.bindScope),
  ]
    .join(' ')
    .toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

function compareRows(left: ListenerRow, right: ListenerRow, sortKey: SortKey): number {
  if (sortKey === 'cpu') return compareDesc(left.cpuPercent, right.cpuPercent) || left.port - right.port
  if (sortKey === 'memory') return compareDesc(left.memoryMb, right.memoryMb) || left.port - right.port
  if (sortKey === 'uptime') return compareDesc(left.uptimeSeconds, right.uptimeSeconds) || left.port - right.port
  return left.port - right.port || left.pid - right.pid
}

function compareDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return right - left
}
