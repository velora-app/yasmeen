import os from 'node:os'
import type { ListenerRow } from '../../types'
import { buildListeners, type ScanContext } from './buildListeners'
import { execFileText } from './execFileText'
import { parseLsofListeners, parseWorkingDirectories } from './parseLsof'
import { collectOwnProcessIds, parseProcessTable, type ProcessSnapshot } from './parseProcessTable'

const lsofPath = '/usr/sbin/lsof'
const psPath = '/bin/ps'

export interface ScanOutput {
  listeners: ListenerRow[]
  error: string | null
  context: ScanContext
}

export async function scanListeners(ownExecutablePath: string): Promise<ScanOutput> {
  const homeDirectory = os.homedir()
  const currentUid = process.getuid?.() ?? -1
  try {
    const [socketOutput, processOutput] = await Promise.all([
      execFileText(lsofPath, ['-nP', '-i', 'TCP', '-sTCP:LISTEN', '-Fpcn']),
      execFileText(psPath, ['-axww', '-o', 'pid=,ppid=,uid=,etime=,pcpu=,rss=,command=']),
    ])
    const processes = parseProcessTable(processOutput)
    const context: ScanContext = {
      currentUid,
      ownPids: collectOwnProcessIds(process.pid, processes),
      ownExecutablePath,
      homeDirectory,
    }
    const sockets = parseLsofListeners(socketOutput)
    const workingDirectories = await readWorkingDirectories([...new Set(sockets.map((socket) => socket.pid))])
    return {
      listeners: buildListeners(sockets, processes, workingDirectories, context),
      error: null,
      context,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read local ports.'
    return {
      listeners: [],
      error: message,
      context: {
        currentUid,
        ownPids: new Set([process.pid]),
        ownExecutablePath,
        homeDirectory,
      },
    }
  }
}

export async function readProcess(pid: number): Promise<ProcessSnapshot | null> {
  const output = await execFileText(psPath, ['-ww', '-p', String(pid), '-o', 'pid=,ppid=,uid=,etime=,pcpu=,rss=,command='])
  return parseProcessTable(output).get(pid) ?? null
}

async function readWorkingDirectories(pids: number[]): Promise<Map<number, string>> {
  const directories = new Map<number, string>()
  if (pids.length === 0) return directories
  const chunks = chunk(pids, 80)
  const outputs = await Promise.all(
    chunks.map((group) => execFileText(lsofPath, ['-a', '-nP', '-p', group.join(','), '-d', 'cwd', '-Fn'])),
  )
  for (const output of outputs) {
    for (const [pid, directory] of parseWorkingDirectories(output)) directories.set(pid, directory)
  }
  return directories
}

function chunk<T>(values: T[], size: number): T[][] {
  const groups: T[][] = []
  for (let index = 0; index < values.length; index += size) groups.push(values.slice(index, index + size))
  return groups
}
