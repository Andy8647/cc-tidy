import type { EngineInterface, On, RenderElement, SessionMessage } from 'claude-code'

import { isNotification, jobOf, noteEnded, parseNotification, readJobs } from './jobs.js'
import { spinnerFrame, startThinkTicker, watchThinking, watchTick } from './live.js'
import { bodyLines, callRowSpans, durationText, jobRowSpans, metrics, summarySpans, thoughtBodyLines, thoughtRowSpans } from './rows.js'
import { endRun, isThinkingLive, liveText, noteThinking, noteTurn, thoughtsOf } from './thinking.js'
import { PI } from './palette.js'
import { durationOf, isTimedRunning } from './timing.js'
import { drawLine, fit, textWidth } from './textbox.js'
import type { Call } from './callbox.js'
import type { Columns, Tally } from './rows.js'
import type { Kit } from './textbox.js'

/** A call as the transcript holds it. */
type Member = { id: string; tool: string; input: unknown; output: unknown; isError: boolean }

/**
 * The tool calls between two pieces of text, as pi-tidy groups them: a user
 * message or an assistant message with visible text starts a group, and steps
 * that only call tools don't split one. `first` draws the summary line.
 */
type Group = { first: string; calls: Member[] }

/** Groups the person opened, by their first call's id; a reload folds them again. */
const open = new Set<string>()

/** Calls opened to show what they produced, under their row. */
const opened = new Set<string>()

/** Thinking runs opened, by the call they came before. */
const openedThoughts = new Set<string>()

/** The thinking before each call, from the transcript as last read. */
let thoughts = new Map<string, string>()

/** The newest call the model made: a run arriving now joins its group, unless text comes first. */
let lastCallId: string | undefined

/** tool_use_id → its group, from the transcript as last read. */
let byCall = new Map<string, Group>()
let readAt = 0
let reading: Promise<void> | undefined

/**
 * Set when the transcript changed (a call started or ended, a prompt or a
 * turn went by): the next draw reads it again. Otherwise draws reuse the
 * grouping, which matters because every scroll step redraws.
 */
let stale = true

/** How often, at most, a draw that finds a call outside every group reads the transcript again. */
const RETRY = 500

export function markStale() {
  stale = true
}

function groupsOf(messages: SessionMessage[]) {
  const map = new Map<string, Group>()
  let current: Group | undefined
  for (const message of messages) {
    // A background job's notification is its row's news, not a piece of text.
    if (message.text.trim() !== '' && !(message.role === 'user' && isNotification(message.text))) current = undefined
    for (const use of message.role === 'assistant' ? message.toolUses : []) {
      if (current === undefined) {
        current = { first: use.tool_use_id, calls: [] }
      }
      const output = use.result ?? use.text
      current.calls.push({ id: use.tool_use_id, tool: use.tool, input: use.input, output, isError: use.isError === true })
      map.set(use.tool_use_id, current)
    }
  }
  return map
}

async function groupOf($: EngineInterface, id: string) {
  if (stale || (!byCall.has(id) && Date.now() - readAt > RETRY)) {
    stale = false
    reading ??= Promise.all([$.session.messages(), $.session.messages({ as: 'api' })]).then(([messages, api]) => {
      byCall = groupsOf(messages)
      readJobs(messages)
      thoughts = thoughtsOf(api)
      readAt = Date.now()
      reading = undefined
    })
    await reading
  }
  return byCall.get(id)
}

/** A transcript call as a row draws it; whether it runs is timed here. */
const callOf = (member: Member): Call => ({
  tool_use_id: member.id,
  tool: member.tool,
  input: member.input,
  output: member.output,
  isRunning: isTimedRunning(member.id),
  isErrored: member.isError,
  isInterrupted: false,
})

/** The widest note of each group, kept while its transcript read stands: notes walk whole outputs. */
const noteWidths = new WeakMap<Group, number>()

/**
 * The group's metrics columns, so every row ends on the same cell. `own` are
 * the calls this site draws, from its props, which can be newer than the
 * transcript as last read.
 */
function columnsOf(group: Group, own: Call[]): Columns {
  let note = noteWidths.get(group)
  if (note === undefined) {
    note = Math.max(0, ...group.calls.map(member => textWidth(metrics(callOf(member), undefined).note)))
    noteWidths.set(group, note)
  }
  const ids = [...group.calls.map(member => member.id), ...own.map(call => call.tool_use_id ?? '')]
  return {
    note: Math.max(note, ...own.map(call => textWidth(metrics(call, undefined).note))),
    duration: Math.max(0, ...ids.map(id => textWidth(durationText(durationOf(id))))),
  }
}

type RenderEvent = Parameters<EngineInterface['ui']['resolve']>[0]

/**
 * The group's summary line, one button the width of the row: it opens the
 * group, or folds it and every call opened in it.
 */
function header($: EngineInterface, kit: Kit, group: Group, isOpen: boolean, width: number) {
  const running = group.calls.map(member => jobOf(member.id)).filter(job => job?.status === 'running')
  const jobs = { running: running.length, spinner: spinnerFrame(running[0]?.startedAt) }
  const thinking = {
    count: group.calls.filter(member => thoughts.has(member.id)).length,
    live: isCurrent(group) && isThinkingLive(),
    spinner: spinnerFrame(undefined),
  }
  const tallies: Tally[] = group.calls.map(member => ({
    tool: member.tool,
    isError: member.isError,
    isRunning: isTimedRunning(member.id),
    ms: durationOf(member.id),
  }))
  const toggle = () => {
    if (open.has(group.first)) {
      open.delete(group.first)
      for (const member of group.calls) {
        opened.delete(member.id)
        openedThoughts.delete(member.id)
      }
    } else open.add(group.first)
    $.ui.invalidate('ui.render')
  }
  const line = drawLine(kit, 'head:' + group.first, fit(summarySpans(tallies, isOpen, jobs, thinking), width), toggle, PI.selectedBg)
  return kit.Box({ key: 'head', children: [line] })
}

/**
 * One call of an open group: its row, and once opened (a click, or ctrl+o:
 * `full`), what it produced hanging below. A click on the row opens or folds
 * it; a click on the body folds it.
 */
function callLines($: EngineInterface, kit: Kit, group: Group, call: Call, columns: Columns, width: number, full: boolean, isOpen: boolean): RenderElement[] {
  const id = call.tool_use_id ?? ''
  const isOpened = full || opened.has(id)
  const toggle = () => {
    open.add(group.first)
    if (opened.has(id)) opened.delete(id)
    else opened.add(id)
    $.ui.invalidate('ui.render')
  }
  const fold = () => {
    opened.delete(id)
    $.ui.invalidate('ui.render')
  }
  const job = jobOf(id)
  const spans = job === undefined ? callRowSpans(call, durationOf(id), width, columns, isOpened) : jobRowSpans(call, job, width, isOpened)
  const row = drawLine(kit, 'row:' + id, spans, toggle, PI.selectedBg)
  // Folded, a running call's row shows alone: its thinking waits for the group to open.
  const lines = [...(isOpen ? thoughtLines($, kit, group, id, width, full) : []), kit.Box({ key: 'row:' + id, children: [row] })]
  if (isOpened) {
    const body = bodyLines(call, width).map((spans, i) => drawLine(kit, 'body:' + id + ':' + i, spans, fold))
    lines.push(kit.Box({ key: 'body:' + id, flexDirection: 'column', children: body }))
  }
  // The run arriving now, under the newest call: a window over its newest words.
  if (isOpen && id === lastCallId && isCurrent(group) && isThinkingLive()) {
    const spans = thoughtRowSpans(liveText(), width, false, true)
    lines.push(kit.Box({ key: 'live', children: [drawLine(kit, 'live:' + id, spans, () => {}, PI.selectedBg)] }))
  }
  return lines
}

/** Whether a run arriving now belongs to this group: the one the newest call is in. */
const isCurrent = (group: Group) => lastCallId !== undefined && byCall.get(lastCallId) === group

/**
 * The thinking run before a call, as a row above it; a click opens the run
 * under it, and a click there folds it.
 */
function thoughtLines($: EngineInterface, kit: Kit, group: Group, id: string, width: number, full: boolean): RenderElement[] {
  const text = thoughts.get(id)
  if (text === undefined) return []
  const isOpened = full || openedThoughts.has(id)
  const toggle = () => {
    open.add(group.first)
    if (openedThoughts.has(id)) openedThoughts.delete(id)
    else openedThoughts.add(id)
    $.ui.invalidate('ui.render')
  }
  const fold = () => {
    openedThoughts.delete(id)
    $.ui.invalidate('ui.render')
  }
  const row = drawLine(kit, 'thought:' + id, thoughtRowSpans(text, width, isOpened), toggle, PI.selectedBg)
  const lines = [kit.Box({ key: 'thought:' + id, children: [row] })]
  if (isOpened) {
    const body = thoughtBodyLines(text, width).map((spans, i) => drawLine(kit, 'thought-body:' + id + ':' + i, spans, fold))
    lines.push(kit.Box({ key: 'thought-body:' + id, flexDirection: 'column', children: body }))
  }
  return lines
}

/** A running call or job shows its row under a folded group once it has run this long. */
const REVEAL_MS = 1000

/**
 * Whether a call of a folded group shows its row: one running for a second or
 * more, so a 30-second command isn't invisible, and a background job's while
 * it runs. A call done within the second never shows (no flicker); a failure
 * doesn't either, the red count is its sign.
 */
function isRevealed(call: Call, now: number) {
  const id = call.tool_use_id ?? ''
  const job = jobOf(id)
  if (job?.status === 'running') return job.startedAt === undefined || now - job.startedAt >= REVEAL_MS
  if (!call.isRunning) return false
  const ms = durationOf(id)
  return ms === undefined || ms >= REVEAL_MS
}

/** Whether a site draws something that changes by the second: it then watches the tick. */
function isLiveSite(group: Group, calls: Call[], hasHeader: boolean) {
  const runs = (id: string) => jobOf(id)?.status === 'running'
  return calls.some(call => call.isRunning || runs(call.tool_use_id ?? '')) || (hasHeader && group.calls.some(member => runs(member.id)))
}

/**
 * What one site draws of a group: the summary line where the group's first
 * call is, and a row for each of its own calls while the group is open (or,
 * folded, for a call still running). `full` is the message expanded (ctrl+o):
 * the group open and every call too.
 */
async function drawSite($: EngineInterface, e: RenderEvent, columnsOnScreen: number | undefined, group: Group, calls: Call[], full: boolean): Promise<RenderElement> {
  const kit = $.ui.resolve(e)
  // One cell short of the edge: a row exactly as wide as the screen wraps.
  const width = (columnsOnScreen ?? 100) - 1
  const isOpen = full || open.has(group.first)
  const hasHeader = calls.some(call => call.tool_use_id === group.first)
  if (isLiveSite(group, calls, hasHeader)) await watchTick($)
  // The current group's summary and newest row move with a thinking run.
  if (isCurrent(group) && (hasHeader || calls.some(call => call.tool_use_id === lastCallId))) await watchThinking($)
  const now = Date.now()
  const shown = isOpen ? calls : calls.filter(call => isRevealed(call, now))
  const columns = shown.length > 0 ? columnsOf(group, calls) : { note: 0, duration: 0 }
  const lines = calls.flatMap(call => [
    ...(call.tool_use_id === group.first ? [header($, kit, group, isOpen, width)] : []),
    ...(shown.includes(call) ? callLines($, kit, group, call, columns, width, full, isOpen) : []),
  ])
  return lines.length === 0 ? kit.Box({}) : kit.Box({ flexDirection: 'column', children: lines })
}

/**
 * Folds each group of tool calls to one line, `▸ 5 calls · bash×3  read×2`.
 * A click opens it as pi-tidy's rows, one a call; a click on a row shows what
 * the call produced under it, and a click there folds it again. Every cell is
 * a button of ours, so Claude Code never takes a click to expand the message
 * (which greys it).
 */
export function registerGroups(on: On) {
  // The transcript changed: the next draw reads it again.
  on('prompt.submit', async ($, e, next) => {
    markStale()
    // A background job ended: its row says so from now.
    const note = e.origin.kind === 'task-notification' ? parseNotification(e.text) : undefined
    if (note !== undefined && noteEnded(note.toolUseId, note.status, note.exitCode)) $.ui.invalidate('ui.render')
    return next(e)
  })
  on('turn.start', async ($, e, next) => {
    markStale()
    if (e.agentId === undefined) noteTurn(true)
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    markStale()
    if (e.agentId === undefined) noteTurn(false)
    return next(e)
  })

  // Watches the main thread's response go by: thinking arriving, then the call
  // or text that ends the run. Every chunk is passed on as it came.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    const stream = next(e)
    let inRun = false
    for await (const chunk of stream) {
      if (chunk.kind === 'thinking') {
        const wasLive = isThinkingLive()
        noteThinking(chunk.text, !inRun)
        inRun = true
        // The summary has nothing else to draw it again: say the run started.
        if (!wasLive && isThinkingLive()) {
          startThinkTicker($)
          $.ui.invalidate('ui.render')
        }
      } else if (chunk.kind === 'tool' || (chunk.kind === 'text' && chunk.text.trim() !== '')) {
        if (chunk.kind === 'tool') lastCallId = chunk.id
        inRun = false
        endRun()
      }
      yield chunk
    }
    endRun()
    return await stream.result
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const group = await groupOf($, e.props.tool_use_id)
    if (group === undefined) return next(e)
    return drawSite($, e, e.viewport?.columns, group, [e.props], e.props.isExpanded === true)
  })

  // A job's notification ("Background command … completed"): its row says that already.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'task-notification' } } }, async ($, e, next) => {
    const id = e.props.task?.toolUseId
    if (id === undefined || e.props.isExpanded || jobOf(id) === undefined || (await groupOf($, id)) === undefined) return next(e)
    return $.ui.resolve(e).Box({})
  })

  // The call's row holds its result.
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const group = await groupOf($, e.props.tool_use_id)
    if (group === undefined) return next(e)
    return $.ui.resolve(e).Box({})
  })

  // Claude Code's own fold ("Ran 3 shell commands"): its calls are a group's.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const id = e.props.calls[0]?.tool_use_id
    if (id === undefined) return next(e)
    const group = await groupOf($, id)
    if (group === undefined) return next(e)
    return drawSite($, e, e.viewport?.columns, group, [...e.props.calls], e.props.isExpanded)
  })
}
