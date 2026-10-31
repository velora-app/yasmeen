export type BindScope = 'localhost' | 'lan' | 'all'

export type Confidence = 'high' | 'medium' | 'low'

export type ListenerFilter = 'dev' | 'all' | 'localhost' | 'system'

export type SortKey = 'port' | 'cpu' | 'memory' | 'uptime'

export type StopSignal = 'SIGTERM' | 'SIGKILL'

export interface Settings {
  openAtLogin: boolean
  closeAfterAction: boolean
  sortKey: SortKey
  filter: ListenerFilter
}

export interface ListenerRow {
  id: string
  port: number
  pid: number
  processName: string
  commandLine: string
  cwd: string | null
  projectName: string | null
  addresses: string[]
  bindScope: BindScope
  cpuPercent: number | null
  memoryMb: number | null
  uptimeSeconds: number | null
  runtime: string | null
  framework: string | null
  confidence: Confidence
  hostAppName: string | null
  hostAppPath: string | null
  canStop: boolean
  stopBlockReason: string | null
  isSystem: boolean
  openUrl: string | null
}

export interface Snapshot {
  listeners: ListenerRow[]
  scannedAt: string
  error: string | null
  settings: Settings
  shortcutRegistered: boolean
  homeDirectory: string
  devListenerCount: number
}

export interface ActionResult {
  ok: boolean
  message: string
}

export interface BulkStopResult extends ActionResult {
  stoppedIds: string[]
}

export interface YasmeenBridge {
  refresh(): Promise<Snapshot>
  openListener(id: string): Promise<ActionResult>
  copyListener(id: string): Promise<ActionResult>
  focusListener(id: string): Promise<ActionResult>
  stopListener(id: string, signal: StopSignal): Promise<ActionResult>
  stopVisible(ids: string[]): Promise<BulkStopResult>
  updateSettings(patch: Partial<Settings>): Promise<Snapshot>
  hide(): Promise<void>
  onSnapshot(listener: (snapshot: Snapshot) => void): () => void
}
