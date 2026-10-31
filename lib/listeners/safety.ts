export interface StopAssessment {
  canStop: boolean
  reason: string | null
  isSystem: boolean
}

export interface StopAssessmentInput {
  pid: number
  uid: number
  commandLine: string
  currentUid: number
  ownPids: ReadonlySet<number>
  ownExecutablePath: string
}

const protectedCommandPatterns: RegExp[] = [
  /\/loginwindow\.app\//i,
  /\/MacOS\/loginwindow$/i,
  /(^|\/)launchd$/i,
  /\/WindowServer$/i,
  /\/ControlCenter\.app\//i,
  /(^|\/)rapportd$/i,
  /\brapportd\b/i,
  /\/Finder\.app\//i,
  /\/Dock\.app\//i,
  /\/SystemUIServer\.app\//i,
  /\/Cursor\.app\//i,
  /Cursor Helper/i,
  /\/Visual Studio Code\.app\//i,
  /Code Helper/i,
  /\/Terminal\.app\//i,
  /\/iTerm2?\.app\//i,
  /\/Warp\.app\//i,
  /\/Ghostty\.app\//i,
  /\/kitty\.app\//i,
  /\/Alacritty\.app\//i,
  /\/MacOS\/(zsh|bash|fish|sh|dash)$/i,
  /^(zsh|bash|fish|sh|dash)(\s|$)/i,
]

const systemProcessNames = new Set([
  'rapportd',
  'controlcenter',
  'sharingd',
  'identityservicesd',
  'launchd',
  'loginwindow',
  'usereventagent',
  'distnoted',
  'cfprefsd',
  'syspolicyd',
  'trustd',
  'runningboardd',
  'coreaudiod',
  'bluetoothd',
  'airportd',
  'symptomsd',
  'nsurlsessiond',
  'parsecd',
  'cloudd',
  'bird',
  'accountsd',
  'secd',
  'securityd',
  'amfid',
  'notifyd',
  'syslogd',
  'logd',
  'opendirectoryd',
  'mds',
  'finder',
  'dock',
  'systemuiserver',
  'windowserver',
  'kernel_task',
  'lsd',
  'installd',
  'softwareupdated',
  'filecoordinationd',
  'sandboxd',
  'authd',
  'locationd',
  'tccd',
  'containermanagerd',
  'powerd',
  'configd',
  'apsd',
])

export function assessStop(input: StopAssessmentInput): StopAssessment {
  const isSystem = isSystemCommand(input.commandLine)
  if (!Number.isInteger(input.pid) || input.pid <= 1) {
    return blocked('That process is protected.', isSystem)
  }
  if (input.uid !== input.currentUid) {
    return blocked('Owned by another user.', isSystem)
  }
  if (input.ownPids.has(input.pid) || commandContainsOwnExecutable(input.commandLine, input.ownExecutablePath)) {
    return blocked('This is Yasmeen.', true)
  }
  if (isSystem) return blocked('System process.', true)
  if (protectedCommandPatterns.some((pattern) => pattern.test(input.commandLine))) {
    return blocked('This is the editor, terminal, or host app.', false)
  }
  return { canStop: true, reason: null, isSystem: false }
}

export function isSystemCommand(commandLine: string): boolean {
  const executable = commandLine.trim().split(/\s+/)[0] ?? ''
  if (
    executable.startsWith('/System/') ||
    executable.startsWith('/usr/libexec/') ||
    executable.startsWith('/usr/sbin/') ||
    executable.startsWith('/usr/lib/') ||
    executable.includes('/System/Library/')
  ) {
    return true
  }
  const baseName = executable.split('/').pop()?.toLowerCase() ?? ''
  return systemProcessNames.has(baseName)
}

function blocked(reason: string, isSystem: boolean): StopAssessment {
  return { canStop: false, reason, isSystem }
}

function commandContainsOwnExecutable(commandLine: string, ownExecutablePath: string): boolean {
  if (!ownExecutablePath) return false
  return commandLine.includes(ownExecutablePath)
}
