import type { EngineInterface, On, RenderElement, SessionMessage } from 'claude-code'

import { drawBashBox } from './bash-box.js'
import type { Call, Kit } from './bash-box.js'

/**
 * The tool calls between two pieces of text, as pi-tidy groups them: a user
 * message or an assistant message with visible text starts a group, and steps
 * that only call tools don't split one. `first` draws the summary line.
 */
type Group = { first: string; calls: { id: string; tool: string; isError: boolean }[] }

/** Groups the person opened, by their first call's id; a reload folds them again. */
const open = new Set<string>()

/** Calls in an open group whose full box the person opened. */
const openCalls = new Set<string>()

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

/** `Bash` → `bash`, `mcp__jira__jira_get_issue` → `jira`. */
const shortName = (tool: string) => (tool.startsWith('mcp__') ? (tool.split('__')[1] ?? 'mcp') : tool.toLowerCase())

function summaryText(group: Group) {
  const counts = new Map<string, number>()
  for (const call of group.calls) counts.set(shortName(call.tool), (counts.get(shortName(call.tool)) ?? 0) + 1)
  const kinds = [...counts].map(([name, n]) => name + '×' + n).join('  ')
  const failed = group.calls.filter(call => call.isError).length
  const n = group.calls.length
  return n + (n === 1 ? ' call' : ' calls') + ' · ' + kinds + (failed > 0 ? ' · ' + failed + ' failed' : '')
}

/** The group's line, a button that opens or folds it. */
function summary($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], group: Group) {
  const { Button } = $.ui.resolve(e)
  const isOpen = open.has(group.first)
  return Button({
    key: 'group:' + group.first,
    plain: true,
    dimColor: true,
    onPress: () => {
      if (open.has(group.first)) open.delete(group.first)
      else open.add(group.first)
      $.ui.invalidate('ui.render')
    },
    children: [(isOpen ? ' ▾ ' : ' ▸ ') + summaryText(group)],
  })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const firstLine = (text: string) => text.split('\n')[0] ?? ''

/** What a call's row names after the tool: the command, the file, the pattern. */
function target(tool: string, input: unknown) {
  if (!isRecord(input)) return ''
  const pick = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : undefined)
  if (tool === 'Bash') return firstLine(pick('command') ?? '')
  if (tool.startsWith('mcp__')) return tool.split('__').slice(2).join('__')
  return pick('file_path') ?? pick('path') ?? pick('pattern') ?? pick('url') ?? pick('description') ?? ''
}

/** What a call produced, said short: `12 lines`, `failed`. */
function note(call: Call) {
  if (call.isRunning) return 'running'
  if (call.isInterrupted) return 'interrupted'
  if (call.isErrored) return 'failed'
  const out = call.output
  const text = typeof out === 'string' ? out : isRecord(out) && typeof out.stdout === 'string' ? out.stdout : undefined
  if (text === undefined) return ''
  const n = text.replace(/\s+$/, '') === '' ? 0 : text.replace(/\s+$/, '').split('\n').length
  return n === 0 ? 'no output' : n === 1 ? '1 line' : n + ' lines'
}

/**
 * One call of an open group: `│ ✓ bash git status  4 lines`, a button that
 * opens the call's box under it, and folds it again.
 */
function callRow($: EngineInterface, kit: Kit, tool: string, call: Call): RenderElement[] {
  const { Box, Text, Button } = kit
  const id = call.tool_use_id ?? ''
  const isOpen = openCalls.has(id)
  const mark = call.isRunning ? '◐' : call.isErrored || call.isInterrupted ? '✗' : '✓'
  const row = Box({
    flexDirection: 'row',
    children: [
      Text({ dimColor: true, children: [' │ '] }),
      Button({
        key: 'call:' + id,
        plain: true,
        onPress: () => {
          if (openCalls.has(id)) openCalls.delete(id)
          else openCalls.add(id)
          $.ui.invalidate('ui.render')
        },
        children: [
          Text({ color: mark === '✓' ? 'success' : mark === '✗' ? 'error' : 'inactive', children: [mark + ' '] }),
          Text({ children: [shortName(tool) + ' '] }),
          Text({ dimColor: true, children: [target(tool, call.input) + '  ' + note(call)] }),
        ],
      }),
    ],
  })
  return isOpen ? [row, Box({ marginLeft: 3, children: [callBox(kit, tool, call)] })] : [row]
}

/** An opened call's box: Bash's own, or the call's output in a plain one. */
function callBox(kit: Kit, tool: string, call: Call): RenderElement {
  if (tool === 'Bash') return drawBashBox(kit, call, true, () => {})
  const { Box, Text } = kit
  const out = call.output
  const text = typeof out === 'string' ? out : JSON.stringify(out, null, 2) ?? ''
  const lines = text.split('\n')
  return Box({
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: call.isErrored ? 'error' : 'success',
    children: [
      Text({ children: [' ' + shortName(tool) + ' ' + target(tool, call.input)] }),
      Text({ dimColor: true, children: [lines.slice(0, 20).map(l => '  ' + l).join('\n') + (lines.length > 20 ? '\n  … ' + (lines.length - 20) + ' more lines' : '')] }),
    ],
  })
}

/**
 * Folds each group of tool calls to one line, `▸ 5 calls · bash×3  read×2`.
 * A click opens the group, one row per call; a click on a row opens that
 * call's box, and a click on the `▾` line folds the group again. Every click
 * lands on a button of ours, so Claude Code never takes it to expand the
 * message (which greys it). The ctrl+o transcript shows all.
 */
export function registerGroups(on: On) {
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.isExpanded === true) return next(e)
    const group = await groupOf($, e.props.tool_use_id)
    if (group === undefined) return next(e)
    const isFirst = group.first === e.props.tool_use_id
    if (open.has(group.first)) {
      const kit = $.ui.resolve(e)
      const rows = callRow($, kit, e.props.tool, e.props)
      return kit.Box({ flexDirection: 'column', children: isFirst ? [summary($, e, group), ...rows] : rows })
    }
    if (isFirst) return summary($, e, group)
    const { Box } = $.ui.resolve(e)
    return Box({})
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.isExpanded === true) return next(e)
    const group = await groupOf($, e.props.tool_use_id)
    if (group === undefined) return next(e)
    // Folded, the group hides it; open, its row (or box) is drawn by the call's ToolUse.
    const { Box } = $.ui.resolve(e)
    return Box({})
  })

  // Claude Code's own fold ("Ran 3 shell commands"): its calls are a group's.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const id = e.props.calls[0]?.tool_use_id
    if (id === undefined) return next(e)
    const group = await groupOf($, id)
    if (group === undefined) return next(e)
    if (open.has(group.first)) {
      const kit = $.ui.resolve(e)
      const rows = e.props.calls.flatMap(call => callRow($, kit, call.tool, call))
      return kit.Box({ flexDirection: 'column', children: group.first === id ? [summary($, e, group), ...rows] : rows })
    }
    if (group.first === id) return summary($, e, group)
    const { Box } = $.ui.resolve(e)
    return Box({})
  })
}
