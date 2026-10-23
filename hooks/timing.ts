import type { EngineInterface, On } from 'claude-code'

import { markStale } from './group.js'
import { noteStarted, taskIdOf } from './jobs.js'
import { startTicker } from './live.js'

/** How long each call ran, in ms, by tool_use_id. */
const durations = new Map<string, number>()

/** When each running call started. */
const started = new Map<string, number>()

let storeKey: string | undefined

/** How long a call ran (or has run so far), or undefined when nobody timed it. */
export function durationOf(id: string): number | undefined {
  const done = durations.get(id)
  if (done !== undefined) return done
  const start = started.get(id)
  return start === undefined ? undefined : Date.now() - start
}

/** Whether the call is running now, as timed here. */
export const isTimedRunning = (id: string) => started.has(id)

export const anyTimedRunning = () => started.size > 0

/** `0.4s`, `12.3s`, `3m05s`, as pi-tidy says it. */
export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 60_000) return (Math.round(ms / 100) / 10).toFixed(1) + 's'
  const s = Math.round(ms / 1000)
  return Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's'
}

async function load($: EngineInterface) {
  storeKey = 'durations:' + (await $.session.id())
  const saved = await $.store.get(storeKey)
  if (saved !== null && typeof saved === 'object') {
    for (const [id, ms] of Object.entries(saved)) if (typeof ms === 'number' && !durations.has(id)) durations.set(id, ms)
  }
}

/**
 * Times every tool call: the transcript keeps no timestamps, so a call's
 * duration is measured here, around the call, and kept per session in the
 * plugin's store so a resumed session still has it. Calls made before the
 * mod was loaded have none.
 */
export function registerTiming(on: On) {
  on('session.start', async ($, e, next) => {
    await load($)
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    started.set(e.tool_use_id, Date.now())
    markStale()
    startTicker($)
    try {
      const answer = await next(e)
      // A call that started a background job ends at once; the job runs on.
      const taskId = taskIdOf(answer.result)
      if (taskId !== undefined) noteStarted(e.tool_use_id, taskId)
      return answer
    } finally {
      durations.set(e.tool_use_id, Date.now() - (started.get(e.tool_use_id) ?? Date.now()))
      started.delete(e.tool_use_id)
      markStale()
      if (storeKey !== undefined) void $.store.set(storeKey, Object.fromEntries(durations))
      $.ui.invalidate('ui.render')
    }
  })
}
