export interface LsofSocket {
  pid: number
  commandName: string
  address: string
  port: number
}

export function parseLsofListeners(output: string): LsofSocket[] {
  const sockets: LsofSocket[] = []
  let pid: number | null = null
  let commandName = ''

  for (const line of output.split('\n')) {
    if (!line) continue
    const kind = line[0]
    const value = line.slice(1)
    if (kind === 'p') {
      const parsedPid = Number(value)
      pid = Number.isInteger(parsedPid) ? parsedPid : null
      commandName = ''
      continue
    }
    if (kind === 'c') {
      commandName = value.trim()
      continue
    }
    if (kind !== 'n' || pid === null) continue
    const address = parseListenAddress(value.trim())
    if (!address) continue
    sockets.push({ pid, commandName, address: address.host, port: address.port })
  }

  return sockets
}

export function parseWorkingDirectories(output: string): Map<number, string> {
  const directories = new Map<number, string>()
  let pid: number | null = null

  for (const line of output.split('\n')) {
    if (!line) continue
    if (line.startsWith('p')) {
      const parsedPid = Number(line.slice(1))
      pid = Number.isInteger(parsedPid) ? parsedPid : null
      continue
    }
    if (!line.startsWith('n') || pid === null || directories.has(pid)) continue
    const directory = line.slice(1).trim()
    if (directory) directories.set(pid, directory)
  }

  return directories
}

function parseListenAddress(name: string): { host: string; port: number } | null {
  const ipv6 = /^\[(.*)\]:(\d+)$/.exec(name)
  if (ipv6) {
    const port = Number(ipv6[2])
    return Number.isInteger(port) ? { host: ipv6[1] ?? '', port } : null
  }

  const colon = name.lastIndexOf(':')
  if (colon <= 0) return null
  const port = Number(name.slice(colon + 1))
  if (!Number.isInteger(port)) return null
  return { host: name.slice(0, colon), port }
}
