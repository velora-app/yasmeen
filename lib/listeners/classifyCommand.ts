import type { Confidence } from '../../types'

export interface Classification {
  runtime: string | null
  framework: string | null
  confidence: Confidence
}

interface FrameworkRule {
  framework: string
  runtime: string
  patterns: RegExp[]
}

const frameworkRules: FrameworkRule[] = [
  { framework: 'Next.js', runtime: 'Node', patterns: [/next-server/i, /next\s+(dev|start)/i, /node_modules\/next\//i] },
  { framework: 'Nuxt', runtime: 'Node', patterns: [/\bnuxt\b/i, /nuxi/i] },
  { framework: 'Vite', runtime: 'Node', patterns: [/\bvite\b/i] },
  { framework: 'Remix', runtime: 'Node', patterns: [/\bremix\b/i] },
  { framework: 'Astro', runtime: 'Node', patterns: [/\bastro\b/i] },
  { framework: 'Angular', runtime: 'Node', patterns: [/ng\s+serve/i, /@angular[\\/]/i] },
  { framework: 'Nest', runtime: 'Node', patterns: [/@nestjs[\\/]/i, /\bnest\s+start\b/i] },
  { framework: 'Expo', runtime: 'Node', patterns: [/\bexpo\b/i, /@expo[\\/]/i] },
  { framework: 'Webpack', runtime: 'Node', patterns: [/webpack(-dev-server)?/i] },
  { framework: 'Django', runtime: 'Python', patterns: [/manage\.py\s+runserver/i, /\bdjango\b/i] },
  { framework: 'FastAPI', runtime: 'Python', patterns: [/\bfastapi\b/i, /\buvicorn\b/i] },
  { framework: 'Flask', runtime: 'Python', patterns: [/\bflask\b/i] },
  { framework: 'Python http.server', runtime: 'Python', patterns: [/http\.server/i] },
  { framework: 'Rails', runtime: 'Ruby', patterns: [/\brails\s+server\b/i, /\brails\s+s\b/i] },
  { framework: 'Puma', runtime: 'Ruby', patterns: [/\bpuma\b/i] },
  { framework: 'Spring Boot', runtime: 'Java', patterns: [/spring-boot/i] },
  { framework: 'Phoenix', runtime: 'Elixir', patterns: [/phx\.server/i, /\bphoenix\b/i] },
  { framework: 'Laravel', runtime: 'PHP', patterns: [/artisan\s+serve/i] },
]

export function classifyCommand(commandLine: string): Classification {
  const executable = executableName(commandLine)
  const runtimeFromExecutable = runtimeForExecutable(executable)
  const frameworkRule = frameworkRules.find((rule) => rule.patterns.some((pattern) => pattern.test(commandLine)))
  const embeddedRuntime = runtimeFromExecutable ? null : embeddedRuntimeHint(commandLine)
  const runtime = runtimeFromExecutable ?? frameworkRule?.runtime ?? embeddedRuntime
  const framework = frameworkRule?.framework ?? null

  return {
    runtime,
    framework,
    confidence: framework ? 'high' : runtime ? 'medium' : 'low',
  }
}

export function executableName(commandLine: string): string {
  const token = commandLine.trim().split(/\s+/)[0] ?? ''
  const baseName = token.split('/').pop() ?? token
  return baseName
}

function runtimeForExecutable(executable: string): string | null {
  const name = executable.toLowerCase()
  if (name === 'node' || name === 'nodejs') return 'Node'
  if (name === 'bun') return 'Bun'
  if (name === 'deno') return 'Deno'
  if (name === 'python' || name.startsWith('python')) return 'Python'
  if (name === 'ruby') return 'Ruby'
  if (name === 'java') return 'Java'
  if (name === 'php') return 'PHP'
  if (name === 'perl') return 'Perl'
  if (name === 'elixir' || name === 'iex') return 'Elixir'
  if (name === 'erl' || name === 'beam.smp') return 'Erlang'
  if (name === 'go') return 'Go'
  if (name === 'cargo') return 'Rust'
  return null
}

function embeddedRuntimeHint(commandLine: string): string | null {
  if (/\/target\/(debug|release)\//.test(commandLine)) return 'Rust'
  if (/go-build|\/go\/bin\//.test(commandLine)) return 'Go'
  return null
}
