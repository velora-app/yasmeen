import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import test from 'node:test'
import { scanListeners } from '../../../../lib/listeners/scanListeners'
import { stopListener } from '../../../../lib/listeners/stopListener'

const ownExecutablePath = '/Applications/Yasmeen.app/Contents/MacOS/Yasmeen'

test('scan keeps system listeners protected and can stop a server it did not spawn', async () => {
  const scan = await scanListeners(ownExecutablePath)
  assert.equal(scan.error, null)
  for (const row of scan.listeners.filter((listener) => listener.isSystem)) {
    assert.equal(row.canStop, false, row.commandLine)
  }

  const port = await freePort()
  const pid = await startDetachedServer(port)
  try {
    const row = await waitForServer(port, pid)
    assert.equal(row.canStop, true)
    assert.equal(row.framework, 'Python http.server')

    const refused = await stopListener(
      { ...row, commandLine: 'not-the-real-command' },
      'SIGTERM',
      { currentUid: scan.context.currentUid, ownPids: scan.context.ownPids, ownExecutablePath },
    )
    assert.equal(refused.ok, false)
    process.kill(pid, 0)

    const stopped = await stopListener(row, 'SIGTERM', {
      currentUid: scan.context.currentUid,
      ownPids: scan.context.ownPids,
      ownExecutablePath,
    })
    assert.equal(stopped.ok, true)
    await waitUntilGone(pid)
  } finally {
    silenceKill(pid)
  }
})

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Could not reserve a port.'))
        return
      }
      server.close(() => resolve(address.port))
    })
  })
}

function startDetachedServer(port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', launcher, String(port)], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    let errors = ''
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      errors += chunk.toString()
    })
    child.on('exit', (code) => {
      const pid = Number(output.trim())
      if (code !== 0 || !Number.isInteger(pid) || pid <= 0) {
        reject(new Error(errors.trim() || `Server launcher exited ${code ?? 'unknown'}.`))
        return
      }
      resolve(pid)
    })
  })
}

const launcher = `
const { spawn } = require('node:child_process')
const server = spawn('python3', ['-m', 'http.server', process.argv[1], '--bind', '127.0.0.1'], { detached: true, stdio: 'ignore' })
server.unref()
process.stdout.write(String(server.pid))
`

async function waitForServer(port: number, pid: number) {
  const started = Date.now()
  while (Date.now() - started < 6000) {
    const scan = await scanListeners(ownExecutablePath)
    const row = scan.listeners.find((listener) => listener.port === port && listener.pid === pid)
    if (row) return row
    await delay(200)
  }
  throw new Error(`Python server ${pid} did not show up on port ${port}.`)
}

async function waitUntilGone(pid: number): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < 4000) {
    if (!processExists(pid)) return
    await delay(150)
  }
  throw new Error(`Process ${pid} was still running after SIGTERM.`)
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function silenceKill(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // The server already exited.
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
