import { isListenerFilter, isSortKey, metaLine, rowSignature, visibleListeners } from '../application'
import type { ActionResult, ListenerRow, Snapshot, StopSignal, WharfBridge } from '../types'

declare global {
  interface Window {
    wharf: WharfBridge
  }
}

type ConfirmState =
  | { kind: 'stop'; row: ListenerRow; signal: StopSignal }
  | { kind: 'bulk'; rows: ListenerRow[] }

const searchInput = document.querySelector<HTMLInputElement>('#search')
const list = document.querySelector<HTMLElement>('#list')
const banner = document.querySelector<HTMLElement>('#banner')
const status = document.querySelector<HTMLElement>('#status')
const settingsPanel = document.querySelector<HTMLElement>('#settings')
const settingsToggle = document.querySelector<HTMLButtonElement>('#settings-toggle')
const sortSelect = document.querySelector<HTMLSelectElement>('#sort')
const stopVisibleButton = document.querySelector<HTMLButtonElement>('#stop-visible')
const refreshButton = document.querySelector<HTMLButtonElement>('#refresh')
const openAtLogin = document.querySelector<HTMLInputElement>('#open-at-login')
const closeAfterAction = document.querySelector<HTMLInputElement>('#close-after-action')
const shortcut = document.querySelector<HTMLElement>('#shortcut')
const confirmDialog = document.querySelector<HTMLElement>('#confirm')
const confirmForm = document.querySelector<HTMLFormElement>('#confirm-form')
const confirmTitle = document.querySelector<HTMLElement>('#confirm-title')
const confirmBody = document.querySelector<HTMLElement>('#confirm-body')
const confirmAccept = document.querySelector<HTMLButtonElement>('#confirm-accept')
const confirmForce = document.querySelector<HTMLButtonElement>('#confirm-force')
const confirmCancel = document.querySelector<HTMLButtonElement>('#confirm-cancel')
const filterButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-filter]')]

let snapshot: Snapshot | null = null
let query = ''
let selectedId: string | null = null
let settingsOpen = false
let confirmState: ConfirmState | null = null
let listSignature = ''

refreshButton?.addEventListener('click', () => {
  void window.wharf.refresh()
})

settingsToggle?.addEventListener('click', () => {
  settingsOpen = !settingsOpen
  renderChrome()
})

searchInput?.addEventListener('input', () => {
  query = searchInput.value
  renderList()
})

sortSelect?.addEventListener('change', () => {
  const sortKey = sortSelect.value
  if (!isSortKey(sortKey)) return
  void window.wharf.updateSettings({ sortKey })
})

for (const button of filterButtons) {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter
    if (!isListenerFilter(filter)) return
    void window.wharf.updateSettings({ filter })
  })
}

openAtLogin?.addEventListener('change', () => {
  void window.wharf.updateSettings({ openAtLogin: openAtLogin.checked })
})

closeAfterAction?.addEventListener('change', () => {
  void window.wharf.updateSettings({ closeAfterAction: closeAfterAction.checked })
})

stopVisibleButton?.addEventListener('click', () => {
  const rows = visibleListeners(snapshot, query).filter((row) => row.canStop)
  if (rows.length === 0) return
  confirmState = { kind: 'bulk', rows }
  renderConfirm()
})

confirmCancel?.addEventListener('click', () => closeConfirm())

confirmForce?.addEventListener('click', () => {
  if (confirmState?.kind !== 'stop') return
  confirmState = { ...confirmState, signal: 'SIGKILL' }
  renderConfirm()
})

confirmForm?.addEventListener('submit', (event) => {
  event.preventDefault()
  void submitConfirm()
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    if (confirmState) closeConfirm()
    else if (settingsOpen) {
      settingsOpen = false
      renderChrome()
    } else void window.wharf.hide()
    return
  }
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveSelection(event.key === 'ArrowDown' ? 1 : -1)
  } else if (event.key === 'o' || event.key === 'O') void runSelected((row) => window.wharf.openListener(row.id))
  else if (event.key === 'f' || event.key === 'F') void runSelected((row) => window.wharf.focusListener(row.id))
  else if (event.key === 'c' || event.key === 'C') void runSelected((row) => window.wharf.copyListener(row.id))
  else if (event.key === 'k' || event.key === 'K') openStopConfirm()
  else if (event.key === '/') searchInput?.focus()
})

if (!window.wharf) {
  if (banner) {
    banner.hidden = false
    banner.textContent = 'Yasmeen is not connected.'
  }
} else {
  window.wharf.onSnapshot((next) => {
    snapshot = next
    render()
  })
  void window.wharf.refresh()
}

function render(): void {
  renderChrome()
  renderList()
  renderConfirm()
}

function renderChrome(): void {
  if (!snapshot || !settingsToggle || !settingsPanel || !sortSelect || !openAtLogin || !closeAfterAction || !shortcut || !banner) return
  settingsToggle.setAttribute('aria-pressed', String(settingsOpen))
  settingsPanel.hidden = !settingsOpen
  if (list) list.hidden = settingsOpen
  sortSelect.value = snapshot.settings.sortKey
  for (const button of filterButtons) {
    button.setAttribute('aria-checked', String(button.dataset.filter === snapshot.settings.filter))
  }
  openAtLogin.checked = snapshot.settings.openAtLogin
  closeAfterAction.checked = snapshot.settings.closeAfterAction
  shortcut.textContent = snapshot.shortcutRegistered ? '⌘⌥P' : '⌘⌥P in use'
  banner.hidden = !snapshot.error
  banner.textContent = snapshot.error ?? ''
  if (stopVisibleButton) stopVisibleButton.disabled = visibleListeners(snapshot, query).every((row) => !row.canStop)
}

function renderList(force = false): void {
  if (!list || !snapshot) return
  const rows = visibleListeners(snapshot, query)
  if (selectedId && !rows.some((row) => row.id === selectedId)) selectedId = rows[0]?.id ?? null
  if (!selectedId && rows[0]) selectedId = rows[0].id
  const signature = `${selectedId}|${rows.map(rowSignature).join('|')}`
  if (!force && (signature === listSignature || list.contains(document.activeElement))) return
  listSignature = signature
  list.replaceChildren()
  if (rows.length === 0) {
    const empty = document.createElement('p')
    empty.className = 'empty'
    empty.textContent = 'None'
    list.append(empty)
    return
  }
  for (const row of rows) {
    list.append(renderRow(row, row.id === selectedId))
  }
}

function renderRow(row: ListenerRow, selected: boolean): HTMLElement {
  const item = document.createElement('div')
  item.className = selected ? 'row selected' : 'row'
  item.tabIndex = 0
  item.role = 'option'
  item.setAttribute('aria-selected', String(selected))
  item.title = row.commandLine
  item.addEventListener('click', () => {
    selectedId = row.id
    renderList(true)
  })

  const portColumn = document.createElement('div')
  const port = document.createElement('div')
  port.className = 'port'
  port.textContent = String(row.port)
  portColumn.append(port)
  if (row.bindScope !== 'localhost') {
    const scope = document.createElement('div')
    scope.className = 'scope'
    scope.textContent = row.bindScope === 'all' ? '*' : 'lan'
    portColumn.append(scope)
  }

  const title = document.createElement('div')
  title.className = 'title'
  const confidence = document.createElement('span')
  confidence.className = `confidence ${row.confidence}`
  confidence.title = row.confidence
  const label = document.createElement('span')
  label.textContent = row.framework ?? row.runtime ?? row.processName
  title.append(confidence, label)

  const body = document.createElement('div')
  body.append(title)
  if (selected) {
    const detail = metaLine(row)
    const titleText = row.framework ?? row.runtime ?? row.processName
    if (detail && detail !== titleText) {
      const meta = document.createElement('div')
      meta.className = 'meta'
      meta.textContent = detail
      body.append(meta)
    }
    body.append(actionBar(row))
  }
  item.append(portColumn, body)
  return item
}

function actionBar(row: ListenerRow): HTMLElement {
  const bar = document.createElement('div')
  bar.className = 'row-actions'
  bar.append(
    actionButton('Open', () => window.wharf.openListener(row.id)),
    actionButton('Focus', () => window.wharf.focusListener(row.id), !row.hostAppPath),
    actionButton('Copy', () => window.wharf.copyListener(row.id)),
    actionButton('Stop', () => openStopConfirm(row), !row.canStop, row.stopBlockReason),
  )
  return bar
}

function actionButton(
  label: string,
  action: () => void | Promise<ActionResult>,
  disabled = false,
  reason: string | null = null,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.disabled = disabled
  if (reason) button.title = reason
  button.addEventListener('click', (event) => {
    event.stopPropagation()
    const result = action()
    if (result instanceof Promise) void result.then(showResult)
  })
  return button
}

function renderConfirm(): void {
  if (!confirmDialog || !confirmTitle || !confirmBody || !confirmAccept || !confirmForce) return
  confirmDialog.hidden = confirmState === null
  if (!confirmState) return
  if (confirmState.kind === 'bulk') {
    const count = new Set(confirmState.rows.map((row) => row.pid)).size
    confirmTitle.textContent = `Stop ${count}?`
    confirmBody.textContent = ''
    confirmAccept.textContent = 'Stop'
    confirmAccept.className = 'primary'
    confirmForce.hidden = true
    return
  }
  const row = confirmState.row
  const forcing = confirmState.signal === 'SIGKILL'
  confirmTitle.textContent = forcing ? 'Force?' : 'Stop?'
  confirmBody.textContent = `${row.port} · ${row.pid}`
  confirmAccept.textContent = forcing ? 'Force stop' : 'Stop'
  confirmAccept.className = forcing ? 'danger' : 'primary'
  confirmForce.hidden = forcing
}

async function submitConfirm(): Promise<void> {
  if (!confirmState) return
  const pending = confirmState
  closeConfirm()
  if (pending.kind === 'bulk') {
    showResult(await window.wharf.stopVisible(pending.rows.map((row) => row.id)))
    return
  }
  showResult(await window.wharf.stopListener(pending.row.id, pending.signal))
}

function closeConfirm(): void {
  confirmState = null
  renderConfirm()
}

function openStopConfirm(row = selectedRow()): void {
  if (!row || !row.canStop) return
  confirmState = { kind: 'stop', row, signal: 'SIGTERM' }
  renderConfirm()
}

function moveSelection(direction: number): void {
  const rows = visibleListeners(snapshot, query)
  if (rows.length === 0) return
  const currentIndex = rows.findIndex((row) => row.id === selectedId)
  const nextIndex = currentIndex === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, currentIndex + direction))
  selectedId = rows[nextIndex]?.id ?? null
  renderList(true)
  list?.querySelector('.row.selected')?.scrollIntoView({ block: 'nearest' })
}

async function runSelected(action: (row: ListenerRow) => Promise<ActionResult>): Promise<void> {
  const row = selectedRow()
  if (!row) return
  showResult(await action(row))
}

function selectedRow(): ListenerRow | null {
  return visibleListeners(snapshot, query).find((row) => row.id === selectedId) ?? null
}

function showResult(result: ActionResult): void {
  if (status) status.textContent = result.message
}

