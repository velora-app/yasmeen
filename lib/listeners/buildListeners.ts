import type { BindScope, ListenerRow } from '../../types'
import { classifyCommand, executableName } from './classifyCommand'
import type { LsofSocket } from './parseLsof'
import type { ProcessSnapshot } from './parseProcessTable'
import { assessStop } from './safety'

export interface ScanContext {
  currentUid: number
  ownPids: ReadonlySet<number>
  ownExecutablePath: string
  homeDirectory: string
}

interface MergedSocket {
  pid: number
  commandName: string
  port: number
  addresses: string[]
}

export function buildListeners(
  sockets: LsofSocket[],
  processes: Map<number, ProcessSnapshot>,
  workingDirectories: Map<number, string>,
  context: ScanContext,
): ListenerRow[] {
  const merged = new Map<string, MergedSocket>()
  for (const socket of sockets) {
    const key = `${socket.pid}:${socket.port}`
    const existing = merged.get(key)
    if (existing) {
      if (!existing.addresses.includes(socket.address)) existing.addresses.push(socket.address)
      continue
    }
    merged.set(key, {
      pid: socket.pid,
      commandName: socket.commandName,
      port: socket.port,
      addresses: [socket.address],
    })
  }

  const rows: ListenerRow[] = []
  for (const socket of merged.values()) {
    const processRecord = processes.get(socket.pid)
    if (!processRecord || processRecord.uid !== context.currentUid) continue
    const commandLine = processRecord.commandLine
    const cwd = workingDirectories.get(socket.pid) ?? null
    const classification = classifyCommand(commandLine)
    const safety = assessStop({
      pid: socket.pid,
      uid: processRecord.uid,
      commandLine,
      currentUid: context.currentUid,
      ownPids: context.ownPids,
      ownExecutablePath: context.ownExecutablePath,
    })
    const hostApp = findHostApp(socket.pid, processes)
    const bindScope = bindScopeFor(socket.addresses)
    rows.push({
      id: `${socket.pid}:${socket.port}`,
      port: socket.port,
      pid: socket.pid,
      processName: executableName(commandLine) || socket.commandName || 'process',
      commandLine,
      cwd,
      projectName: projectName(cwd, context.homeDirectory),
      addresses: [...socket.addresses].sort(),
      bindScope,
      cpuPercent: processRecord.cpuPercent,
      memoryMb: processRecord.rssKb / 1024,
      uptimeSeconds: processRecord.uptimeSeconds,
      runtime: classification.runtime,
      framework: classification.framework,
      confidence: classification.confidence,
      hostAppName: hostApp?.appName ?? null,
      hostAppPath: hostApp?.appPath ?? null,
      canStop: safety.canStop,
      stopBlockReason: safety.reason,
      isSystem: safety.isSystem,
      openUrl: openUrlFor(bindScope, socket.addresses, socket.port),
    })
  }

  return rows.sort((left, right) => left.port - right.port || left.pid - right.pid)
}

function bindScopeFor(addresses: string[]): BindScope {
  const normalized = addresses.map((address) => address.toLowerCase())
  if (normalized.some((address) => address === '*' || address === '0.0.0.0' || address === '::')) return 'all'
  if (normalized.every((address) => address === '127.0.0.1' || address === '::1' || address === 'localhost')) {
    return 'localhost'
  }
  return 'lan'
}

function openUrlFor(bindScope: BindScope, addresses: string[], port: number): string {
  if (bindScope === 'localhost' || bindScope === 'all') return `http://127.0.0.1:${port}`
  const host = addresses.find((address) => address !== '*' && address !== '0.0.0.0' && address !== '::')
  if (!host) return `http://127.0.0.1:${port}`
  return host.includes(':') ? `http://[${host}]:${port}` : `http://${host}:${port}`
}

function projectName(cwd: string | null, homeDirectory: string): string | null {
  if (!cwd || cwd === '/' || cwd === homeDirectory) return null
  const name = cwd.split('/').filter(Boolean).pop()
  return name || null
}

function findHostApp(
  pid: number,
  processes: Map<number, ProcessSnapshot>,
): { appName: string; appPath: string } | null {
  let current = pid
  const seen = new Set<number>()
  for (let depth = 0; depth < 8; depth += 1) {
    if (seen.has(current)) return null
    seen.add(current)
    const record = processes.get(current)
    if (!record) return null
    const bundle = appBundleFromCommand(record.commandLine)
    if (bundle) return bundle
    if (record.ppid <= 0 || record.ppid === current) return null
    current = record.ppid
  }
  return null
}

function appBundleFromCommand(commandLine: string): { appName: string; appPath: string } | null {
  const match = /(\/[^:\n]*?\.app)\//.exec(commandLine)
  const appPath = match?.[1]
  if (!appPath || appPath.includes('.framework/') || appPath.includes('/Frameworks/')) return null
  const appName = appPath.split('/').pop()?.replace(/\.app$/, '')
  if (!appName) return null
  return { appName, appPath }
}
