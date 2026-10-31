import assert from 'node:assert/strict'
import test from 'node:test'
import { buildListeners } from '../../../../lib/listeners/buildListeners'
import { classifyCommand } from '../../../../lib/listeners/classifyCommand'
import { parseLsofListeners } from '../../../../lib/listeners/parseLsof'
import { collectOwnProcessIds, parseEtime, parseProcessTable } from '../../../../lib/listeners/parseProcessTable'
import { assessStop } from '../../../../lib/listeners/safety'

const sampleLsof = `p615
crapportd
f11
n*:51806
f12
n*:51806
p78302
choppscotch-desktop
f10
n127.0.0.1:15000
f11
n[::1]:15000
`

test('parseLsofListeners keeps the port and address', () => {
  const sockets = parseLsofListeners(sampleLsof)
  assert.deepEqual(
    sockets.map((socket) => `${socket.pid}:${socket.address}:${socket.port}`),
    ['615:*:51806', '615:*:51806', '78302:127.0.0.1:15000', '78302:::1:15000'],
  )
})

test('parseProcessTable reads the command after the numeric columns', () => {
  const processes = parseProcessTable(
    '  681     1   501 01-22:16:03   0.1  49536 /System/Library/CoreServices/ControlCenter.app/Contents/MacOS/ControlCenter\n' +
      '85702 32460   501 03:39 0.2 55296 Cursor Helper (Plugin): extension-host Testing app\n',
  )
  const controlCenter = processes.get(681)
  assert.equal(controlCenter?.ppid, 1)
  assert.equal(controlCenter?.uptimeSeconds, 86400 + 22 * 3600 + 16 * 60 + 3)
  assert.equal(controlCenter?.commandLine.includes('ControlCenter.app'), true)
  assert.equal(processes.get(85702)?.commandLine, 'Cursor Helper (Plugin): extension-host Testing app')
})

test('parseEtime accepts minutes and days', () => {
  assert.equal(parseEtime('17:26'), 17 * 60 + 26)
  assert.equal(parseEtime('2-01:02:03'), 2 * 86400 + 3600 + 120 + 3)
})

test('classifyCommand names the framework and runtime', () => {
  assert.deepEqual(classifyCommand('/opt/homebrew/bin/node node_modules/vite/bin/vite.js'), {
    runtime: 'Node',
    framework: 'Vite',
    confidence: 'high',
  })
  assert.equal(classifyCommand('python3 -m http.server 8765 --bind 127.0.0.1').framework, 'Python http.server')
  assert.equal(classifyCommand('/usr/bin/ruby bin/rails server').framework, 'Rails')
  assert.equal(classifyCommand('bun node_modules/vite/bin/vite.js').runtime, 'Bun')
})

test('assessStop refuses system processes, editors, and Yasmeen', () => {
  const base = { currentUid: 501, ownPids: new Set([10]), ownExecutablePath: '/Applications/Yasmeen.app/Contents/MacOS/Yasmeen' }
  assert.equal(assessStop({ ...base, pid: 681, uid: 501, commandLine: '/System/Library/CoreServices/ControlCenter.app/Contents/MacOS/ControlCenter' }).canStop, false)
  assert.equal(assessStop({ ...base, pid: 80, uid: 501, commandLine: 'Cursor Helper (Plugin): extension-host' }).canStop, false)
  assert.equal(assessStop({ ...base, pid: 10, uid: 501, commandLine: '/Applications/Yasmeen.app/Contents/MacOS/Yasmeen' }).reason, 'This is Yasmeen.')
  const server = assessStop({ ...base, pid: 222, uid: 501, commandLine: 'node server.js' })
  assert.equal(server.canStop, true)
  assert.equal(server.isSystem, false)
})

test('collectOwnProcessIds protects Yasmeen and its parent without swallowing sibling servers', () => {
  const processes = new Map([
    [1, { ppid: 0 }],
    [10, { ppid: 1 }],
    [20, { ppid: 10 }],
    [21, { ppid: 20 }],
    [30, { ppid: 10 }],
  ])
  const ownProcessIds = collectOwnProcessIds(20, processes)
  assert.equal(ownProcessIds.has(20), true)
  assert.equal(ownProcessIds.has(21), true)
  assert.equal(ownProcessIds.has(10), true)
  assert.equal(ownProcessIds.has(1), false)
  assert.equal(ownProcessIds.has(30), false)
})

test('buildListeners dedupes one process port and keeps dev servers stoppable', () => {
  const rows = buildListeners(
    [
      { pid: 222, commandName: 'node', address: '127.0.0.1', port: 3000 },
      { pid: 222, commandName: 'node', address: '::1', port: 3000 },
      { pid: 681, commandName: 'ControlCe', address: '*', port: 5000 },
    ],
    new Map([
      [222, { pid: 222, ppid: 1, uid: 501, uptimeSeconds: 12, cpuPercent: 0.4, rssKb: 20480, commandLine: 'node /repo/node_modules/vite/bin/vite.js' }],
      [681, { pid: 681, ppid: 1, uid: 501, uptimeSeconds: 90, cpuPercent: 0, rssKb: 1024, commandLine: '/System/Library/CoreServices/ControlCenter.app/Contents/MacOS/ControlCenter' }],
      [50, { pid: 50, ppid: 1, uid: 501, uptimeSeconds: 10, cpuPercent: 0, rssKb: 1024, commandLine: '/Applications/Cursor.app/Contents/MacOS/Cursor' }],
    ]),
    new Map([[222, '/Users/samra/shop-web']]),
    { currentUid: 501, ownPids: new Set([10]), ownExecutablePath: '/Applications/Yasmeen.app/Contents/MacOS/Yasmeen', homeDirectory: '/Users/samra' },
  )

  const vite = rows.find((row) => row.port === 3000)
  assert.equal(rows.filter((row) => row.port === 3000).length, 1)
  assert.equal(vite?.framework, 'Vite')
  assert.equal(vite?.bindScope, 'localhost')
  assert.equal(vite?.projectName, 'shop-web')
  assert.equal(vite?.canStop, true)
  assert.equal(vite?.openUrl, 'http://127.0.0.1:3000')
  assert.equal(rows.find((row) => row.port === 5000)?.canStop, false)
})

test('buildListeners does not treat a language framework bundle as the host app', () => {
  const rows = buildListeners(
    [{ pid: 9, commandName: 'python3', address: '127.0.0.1', port: 8766 }],
    new Map([
      [9, {
        pid: 9,
        ppid: 1,
        uid: 501,
        uptimeSeconds: 4,
        cpuPercent: 0,
        rssKb: 4096,
        commandLine: '/opt/homebrew/Cellar/python@3.14/3.14.6/Frameworks/Python.framework/Versions/3.14/Resources/Python.app/Contents/MacOS/Python -m http.server 8766',
      }],
    ]),
    new Map([[9, '/Users/samra/yasmeen']]),
    {
      currentUid: 501,
      ownPids: new Set([10]),
      ownExecutablePath: '/Applications/Yasmeen.app/Contents/MacOS/Yasmeen',
      homeDirectory: '/Users/samra',
    },
  )
  assert.equal(rows[0]?.hostAppPath, null)
  assert.equal(rows[0]?.canStop, true)
  assert.equal(rows[0]?.framework, 'Python http.server')
})
