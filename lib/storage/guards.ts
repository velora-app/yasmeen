import type { ListenerFilter, SortKey } from '../../types'

export function isSortKey(value: unknown): value is SortKey {
  return value === 'port' || value === 'cpu' || value === 'memory' || value === 'uptime'
}

export function isListenerFilter(value: unknown): value is ListenerFilter {
  return value === 'dev' || value === 'all' || value === 'localhost' || value === 'system'
}
