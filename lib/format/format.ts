export function formatUptime(seconds: number | null): string {
  if (seconds === null || seconds < 0) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${Math.floor(seconds)}s`
}

export function formatMemory(memoryMb: number | null): string {
  if (memoryMb === null) return '—'
  if (memoryMb >= 1024) return `${(memoryMb / 1024).toFixed(1)} GB`
  return `${Math.max(1, Math.round(memoryMb))} MB`
}

export function formatCpu(cpuPercent: number | null): string {
  if (cpuPercent === null) return '—'
  return `${cpuPercent.toFixed(1)}% CPU`
}

export function formatBindScope(bindScope: 'localhost' | 'lan' | 'all'): string {
  if (bindScope === 'localhost') return 'localhost'
  if (bindScope === 'all') return 'all interfaces'
  return 'local network'
}

export function displayPath(cwd: string, homeDirectory: string): string {
  if (homeDirectory && (cwd === homeDirectory || cwd.startsWith(`${homeDirectory}/`))) {
    return `~${cwd.slice(homeDirectory.length)}`
  }
  return cwd
}

export function shortCommand(commandLine: string): string {
  const trimmed = commandLine.trim()
  const executable = trimmed.split(/\s+/)[0] ?? ''
  if (!executable.includes('/')) return trimmed
  const baseName = executable.split('/').pop() || executable
  const rest = trimmed.slice(executable.length).trim()
  return rest ? `${baseName} ${rest}` : baseName
}

export function formatScannedAt(isoTime: string, now = Date.now()): string {
  const scannedAt = Date.parse(isoTime)
  if (Number.isNaN(scannedAt)) return 'Not scanned yet'
  const elapsedSeconds = Math.max(0, Math.round((now - scannedAt) / 1000))
  if (elapsedSeconds < 2) return 'Scanned just now'
  if (elapsedSeconds < 60) return `Scanned ${elapsedSeconds}s ago`
  return `Scanned ${Math.floor(elapsedSeconds / 60)}m ago`
}
