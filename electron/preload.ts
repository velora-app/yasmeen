import { contextBridge, ipcRenderer } from 'electron'
import { channels } from '../lib/constants'
import type { ActionResult, BulkStopResult, Settings, Snapshot, StopSignal, YasmeenBridge } from '../types'

const bridge: YasmeenBridge = {
  refresh: () => ipcRenderer.invoke(channels.refresh) as Promise<Snapshot>,
  openListener: (id) => ipcRenderer.invoke(channels.open, id) as Promise<ActionResult>,
  copyListener: (id) => ipcRenderer.invoke(channels.copy, id) as Promise<ActionResult>,
  focusListener: (id) => ipcRenderer.invoke(channels.focus, id) as Promise<ActionResult>,
  stopListener: (id, signal: StopSignal) => ipcRenderer.invoke(channels.stop, { id, signal }) as Promise<ActionResult>,
  stopVisible: (ids) => ipcRenderer.invoke(channels.stopVisible, ids) as Promise<BulkStopResult>,
  updateSettings: (patch: Partial<Settings>) => ipcRenderer.invoke(channels.updateSettings, patch) as Promise<Snapshot>,
  hide: () => ipcRenderer.invoke(channels.hide) as Promise<void>,
  onSnapshot: (listener) => {
    const wrapped = (_event: unknown, snapshot: Snapshot): void => listener(snapshot)
    ipcRenderer.on(channels.snapshot, wrapped)
    return () => ipcRenderer.removeListener(channels.snapshot, wrapped)
  },
}

contextBridge.exposeInMainWorld('yasmeen', bridge)
