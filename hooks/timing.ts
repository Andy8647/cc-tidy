import type { EngineInterface, On } from 'claude-code'

import { markStale } from './group.js'

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

/** `0.4s`, `12s`, `3m 05s`, as pi-tidy says it. */
export function formatDuration(ms: number) {
  if (ms < 10_000) return (ms / 1000).toFixed(1) + 's'
  if (ms < 60_000) return Math.round(ms / 1000) + 's'
  const s = Math.round(ms / 1000)
  return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's'
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
    try {
      return await next(e)
    } finally {
      durations.set(e.tool_use_id, Date.now() - (started.get(e.tool_use_id) ?? Date.now()))
      started.delete(e.tool_use_id)
      markStale()
      if (storeKey !== undefined) void $.store.set(storeKey, Object.fromEntries(durations))
      $.ui.invalidate('ui.render')
    }
  })
}
