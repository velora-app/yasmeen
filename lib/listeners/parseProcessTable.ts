export interface ProcessSnapshot {
  pid: number
  ppid: number
  uid: number
  uptimeSeconds: number | null
  cpuPercent: number | null
  rssKb: number
  commandLine: string
}

const processLinePattern = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.*\S)\s*$/

export function parseProcessTable(output: string): Map<number, ProcessSnapshot> {
  const processes = new Map<number, ProcessSnapshot>()

  for (const line of output.split('\n')) {
    const match = processLinePattern.exec(line)
    if (!match) continue
    const pid = Number(match[1])
    const ppid = Number(match[2])
    const uid = Number(match[3])
    const commandLine = match[7]?.trim() ?? ''
    if (!commandLine) continue
    processes.set(pid, {
      pid,
      ppid,
      uid,
      uptimeSeconds: parseEtime(match[4] ?? ''),
      cpuPercent: Number(match[5]),
      rssKb: Number(match[6]),
      commandLine,
    })
  }

  return processes
}

export function parseEtime(value: string): number | null {
  const trimmed = value.trim()
  let days = 0
  let clock = trimmed
  if (trimmed.includes('-')) {
    const [dayText, rest] = trimmed.split('-')
    days = Number(dayText)
    clock = rest ?? ''
    if (!Number.isInteger(days)) return null
  }

  const parts = clock.split(':').map((part) => Number(part))
  if (parts.some((part) => !Number.isInteger(part))) return null
  if (parts.length === 2) {
    const [minutes, seconds] = parts
    return days * 86400 + (minutes ?? 0) * 60 + (seconds ?? 0)
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts
    return days * 86400 + (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0)
  }
  return null
}

export function collectOwnProcessIds(
  rootPid: number,
  processes: Map<number, { ppid: number }>,
): Set<number> {
  const ownProcessIds = new Set<number>([rootPid])
  let current = rootPid
  for (let depth = 0; depth < 24; depth += 1) {
    const record = processes.get(current)
    if (!record || record.ppid <= 1 || ownProcessIds.has(record.ppid)) break
    ownProcessIds.add(record.ppid)
    current = record.ppid
  }

  const descendants = new Set<number>([rootPid])
  let grew = true
  while (grew) {
    grew = false
    for (const [pid, record] of processes) {
      if (descendants.has(record.ppid) && !descendants.has(pid)) {
        descendants.add(pid)
        grew = true
      }
    }
  }
  for (const pid of descendants) ownProcessIds.add(pid)
  return ownProcessIds
}
