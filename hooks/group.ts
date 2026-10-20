import type { EngineInterface, On, RenderElement, SessionMessage } from 'claude-code'

import { drawCallBox, shortName } from './callbox.js'
import type { Call } from './callbox.js'
import type { Kit } from './textbox.js'

/**
 * The tool calls between two pieces of text, as pi-tidy groups them: a user
 * message or an assistant message with visible text starts a group, and steps
 * that only call tools don't split one. `first` draws the summary line.
 */
type Group = { first: string; calls: { id: string; tool: string; isError: boolean }[] }

/** Groups the person opened, by their first call's id; a reload folds them again. */
const open = new Set<string>()

/** Calls whose box shows all it produced. */
const fullCalls = new Set<string>()

const flip = ($: EngineInterface, set: Set<string>, id: string) => () => {
  if (set.has(id)) set.delete(id)
  else set.add(id)
  $.ui.invalidate('ui.render')
}

/** tool_use_id → its group, from the transcript as last read. */
let byCall = new Map<string, Group>()
let readAt = 0
let reading: Promise<void> | undefined

/** How stale the grouping may be, in ms, before a draw reads the transcript again. */
const FRESH = 500

function groupsOf(messages: SessionMessage[]) {
  const map = new Map<string, Group>()
  let current: Group | undefined
  for (const message of messages) {
    if (message.text.trim() !== '') current = undefined
    for (const use of message.role === 'assistant' ? message.toolUses : []) {
      if (current === undefined) {
        current = { first: use.tool_use_id, calls: [] }
      }
      current.calls.push({ id: use.tool_use_id, tool: use.tool, isError: use.isError === true })
      map.set(use.tool_use_id, current)
    }
  }
  return map
}

async function groupOf($: EngineInterface, id: string) {
  if (Date.now() - readAt > FRESH || !byCall.has(id)) {
    reading ??= $.session.messages().then(messages => {
      byCall = groupsOf(messages)
      readAt = Date.now()
      reading = undefined
    })
    await reading
  }
  return byCall.get(id)
}

function summaryText(group: Group) {
  const counts = new Map<string, number>()
  for (const call of group.calls) counts.set(shortName(call.tool), (counts.get(shortName(call.tool)) ?? 0) + 1)
  const kinds = [...counts].map(([name, n]) => name + '×' + n).join('  ')
  const failed = group.calls.filter(call => call.isError).length
  const n = group.calls.length
  return n + (n === 1 ? ' call' : ' calls') + ' · ' + kinds + (failed > 0 ? ' · ' + failed + ' failed' : '')
}

type RenderEvent = Parameters<EngineInterface['ui']['resolve']>[0]

/** The group's line, a button that opens or folds it. */
function summary($: EngineInterface, e: RenderEvent, group: Group) {
  const { Button } = $.ui.resolve(e)
  return Button({
    key: 'group:' + group.first,
    plain: true,
    dimColor: true,
    onPress: flip($, open, group.first),
    children: [(open.has(group.first) ? ' ▾ ' : ' ▸ ') + summaryText(group)],
  })
}

/** Cells the open group's boxes are indented by, under the summary's marker. */
const INDENT = 1

/**
 * One call of an open group: its box, one line until clicked, then all it
 * produced until clicked again. `full` (the message expanded: ctrl+o) draws
 * every box full.
 */
function callBox($: EngineInterface, kit: Kit, columns: number | undefined, call: Call, full: boolean): RenderElement {
  const id = call.tool_use_id ?? ''
  // One cell short of the edge: a row exactly as wide as the screen wraps.
  const width = (columns ?? 100) - INDENT - 1
  return kit.Box({ marginLeft: INDENT, children: [drawCallBox(kit, call, width, full || fullCalls.has(id), flip($, fullCalls, id))] })
}

/**
 * Folds each group of tool calls to one line, `▸ 5 calls · bash×3  read×2`.
 * A click opens the group, one box a call; a click on a box shows all it
 * produced, and another folds it. Every cell of a box is a button of ours,
 * so Claude Code never takes a click to expand the message (which greys it).
 */
export function registerGroups(on: On) {
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const group = await groupOf($, e.props.tool_use_id)
    if (group === undefined) return next(e)
    const isFirst = group.first === e.props.tool_use_id
    // Expanded (ctrl+o): the group open and every box full, not Claude Code's drawing.
    const full = e.props.isExpanded === true
    const kit = $.ui.resolve(e)
    if (full || open.has(group.first)) {
      const box = callBox($, kit, e.viewport?.columns, e.props, full)
      return kit.Box({ flexDirection: 'column', children: isFirst ? [summary($, e, group), box] : [box] })
    }
    return isFirst ? summary($, e, group) : kit.Box({})
  })

  // The call's box holds its result.
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
    const kit = $.ui.resolve(e)
    const isFirst = group.first === id
    if (e.props.isExpanded || open.has(group.first)) {
      const boxes = e.props.calls.map(call => callBox($, kit, e.viewport?.columns, call, e.props.isExpanded))
      return kit.Box({ flexDirection: 'column', children: isFirst ? [summary($, e, group), ...boxes] : boxes })
    }
    return isFirst ? summary($, e, group) : kit.Box({})
  })
}
