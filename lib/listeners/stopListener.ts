import type { ActionResult, ListenerRow, StopSignal } from '../../types'
import { readProcess } from './scanListeners'
import { assessStop, type StopAssessmentInput } from './safety'

export interface StopGate {
  currentUid: number
  ownPids: ReadonlySet<number>
  ownExecutablePath: string
}

export async function stopListener(row: ListenerRow, signal: StopSignal, gate: StopGate): Promise<ActionResult> {
  const fresh = await readProcess(row.pid)
  if (!fresh) return { ok: false, message: 'That process already exited.' }
  if (fresh.commandLine !== row.commandLine) {
    return { ok: false, message: 'That process changed before it could be stopped. Nothing was signaled.' }
  }

  const assessment = assessStop(stopInput(row.pid, fresh.uid, fresh.commandLine, gate))
  if (!assessment.canStop) {
    return { ok: false, message: assessment.reason ?? 'Yasmeen will not stop this process.' }
  }

  try {
    process.kill(row.pid, signal)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not signal that process.'
    return { ok: false, message }
  }

  return {
    ok: true,
    message: signal === 'SIGTERM' ? `Stop sent to ${row.processName}.` : `Force stop sent to ${row.processName}.`,
  }
}

function stopInput(pid: number, uid: number, commandLine: string, gate: StopGate): StopAssessmentInput {
  return {
    pid,
    uid,
    commandLine,
    currentUid: gate.currentUid,
    ownPids: gate.ownPids,
    ownExecutablePath: gate.ownExecutablePath,
  }
}
