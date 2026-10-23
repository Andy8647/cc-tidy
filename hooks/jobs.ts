import type { SessionMessage } from 'claude-code'

/**
 * What a call that started a background job (`run_in_background`, or ctrl+b)
 * shows on its row instead of a result: the job's state, as pi-tidy draws a
 * pi-processes job.
 *
 * - `running` till its notification comes
 * - `done`, `failed` (a non-zero exit), `killed` as the notification says
 * - `gone`: nothing says how it ended (a resumed session's job, whose process
 *   went with the old one)
 */
export type Job = {
  taskId: string
  status: 'running' | 'done' | 'failed' | 'killed' | 'gone'
  exitCode?: number
  /** When it started and ended, as seen here: a resumed session has neither. */
  startedAt?: number
  endedAt?: number
}

/** Jobs by the tool_use_id of the call that started them. */
const jobs = new Map<string, Job>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const jobOf = (toolUseId: string) => jobs.get(toolUseId)

/** The background task id a call's result names, if it started one. */
export function taskIdOf(result: unknown) {
  return isRecord(result) && typeof result.backgroundTaskId === 'string' ? result.backgroundTaskId : undefined
}

/** A call just started a job: it runs from now. */
export function noteStarted(toolUseId: string, taskId: string) {
  jobs.set(toolUseId, { taskId, status: 'running', startedAt: Date.now() })
}

/** A `<task-notification>`'s fields: which call, and how the job ended. */
export function parseNotification(text: string) {
  if (!text.includes('<task-notification>')) return undefined
  const field = (name: string) => new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>').exec(text)?.[1]?.trim()
  const toolUseId = field('tool-use-id')
  if (toolUseId === undefined) return undefined
  const code = /exit code (\d+)/.exec(field('summary') ?? '')?.[1]
  return { toolUseId, status: field('status') ?? '', exitCode: code === undefined ? undefined : Number(code) }
}

export const isNotification = (text: string) => text.trimStart().startsWith('<task-notification>')

/** How a notification's status reads as a job's end. */
function ended(status: string, exitCode: number | undefined): Job['status'] {
  if (status === 'completed') return exitCode !== undefined && exitCode !== 0 ? 'failed' : 'done'
  if (status === 'failed') return 'failed'
  return 'killed'
}

/**
 * A notification says how a job ended. Returns whether that changed what its
 * row shows.
 */
export function noteEnded(toolUseId: string, status: string, exitCode: number | undefined) {
  const job = jobs.get(toolUseId)
  if (job === undefined || job.status !== 'running') return false
  jobs.set(toolUseId, { ...job, status: ended(status, exitCode), exitCode, endedAt: Date.now() })
  return true
}

/**
 * The jobs the transcript tells of: every call whose result names a task, and
 * how each ended where its notification is there. A job started in this
 * process keeps its times; one nothing explains is `gone`.
 */
export function readJobs(messages: SessionMessage[]) {
  const ends = new Map<string, { status: string; exitCode: number | undefined }>()
  for (const message of messages) {
    const note = message.role === 'user' ? parseNotification(message.text) : undefined
    if (note !== undefined) ends.set(note.toolUseId, note)
  }
  for (const message of messages) {
    for (const use of message.role === 'assistant' ? message.toolUses : []) {
      const taskId = taskIdOf(use.result)
      if (taskId === undefined) continue
      const known = jobs.get(use.tool_use_id)
      const end = ends.get(use.tool_use_id)
      if (end !== undefined && (known === undefined || known.status === 'running')) {
        // Seen running here, it ends now; read from a resumed transcript, it has no times.
        const times = known?.startedAt === undefined ? {} : { startedAt: known.startedAt, endedAt: Date.now() }
        jobs.set(use.tool_use_id, { taskId, status: ended(end.status, end.exitCode), exitCode: end.exitCode, ...times })
      } else if (end === undefined && known === undefined) jobs.set(use.tool_use_id, { taskId, status: 'gone' })
    }
  }
}

/** Whether any job started here still runs: the clock keeps ticking for it. */
export const anyJobRunning = () => [...jobs.values()].some(job => job.status === 'running')
