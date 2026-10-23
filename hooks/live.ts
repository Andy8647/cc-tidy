import { atom, read, update } from 'claude-code'
import type { EngineInterface, Timer } from 'claude-code'

import { anyJobRunning } from './jobs.js'
import { isThinkingLive } from './thinking.js'
import { anyTimedRunning } from './timing.js'

/**
 * A count that goes up once a second while anything is live (a call or a
 * background job running). A drawing that shows something live reads it, and
 * `$.state` redraws exactly those readers on each tick: not every site, as
 * `$.ui.invalidate` would.
 */
const tick = atom({ plugin: 'cc-tidy', key: 'tick' } as const, 0)

let ticker: Timer | undefined

const isLive = () => anyTimedRunning() || anyJobRunning()

/** Starts the tick if it isn't going; it stops itself once nothing is live. */
export function startTicker($: EngineInterface) {
  if (ticker !== undefined) return
  ticker = $.clock.every(1000, () => {
    if (!isLive()) {
      ticker?.cancel()
      ticker = undefined
      return
    }
    void update($, tick, n => (n ?? 0) + 1)
  })
}

/** Subscribes the drawing to the tick, starting it where it isn't going. */
export async function watchTick($: EngineInterface) {
  startTicker($)
  await read($, tick)
}

/**
 * A faster count, every 300 ms while a thinking run is arriving: the live
 * preview moves at most this often (per frame, it would slide a cell a token
 * and read as flicker). Its last step comes once the run goes quiet, so the
 * marker leaves on time even with nothing else drawing.
 */
const thinkTick = atom({ plugin: 'cc-tidy', key: 'thinkTick' } as const, 0)

let thinkTicker: Timer | undefined

export function startThinkTicker($: EngineInterface) {
  if (thinkTicker !== undefined) return
  thinkTicker = $.clock.every(300, () => {
    if (!isThinkingLive()) {
      thinkTicker?.cancel()
      thinkTicker = undefined
    }
    void update($, thinkTick, n => (n ?? 0) + 1)
  })
}

/** Subscribes the drawing to the thinking tick. */
export async function watchThinking($: EngineInterface) {
  await read($, thinkTick)
}

/** pi-tidy's spinner, `◐ ◓ ◑ ◒` a step a second, still (`●`) after five minutes. */
export function spinnerFrame(startedAt: number | undefined, now = Date.now()) {
  if (startedAt !== undefined && now - startedAt > 5 * 60_000) return '●'
  return '◐◓◑◒'.charAt(Math.floor(now / 1000) % 4)
}
