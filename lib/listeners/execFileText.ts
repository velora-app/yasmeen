import { execFile } from 'node:child_process'
import { processCommandTimeoutMs } from '../constants'

export function execFileText(file: string, args: string[], timeoutMs = processCommandTimeoutMs): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 12 * 1024 * 1024, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout)
          return
        }
        const status = (error as { status?: number }).status
        if (status === 1) {
          resolve(stdout)
          return
        }
        const detail = stderr.trim()
        reject(new Error(detail || error.message))
      },
    )
  })
}
