import type { EngineInterface, On, SessionMessage } from 'claude-code'

/**
 * The tool calls between two pieces of text, as pi-tidy groups them: a user
 * message or an assistant message with visible text starts a group, and steps
 * that only call tools don't split one. `first` draws the summary line.
 */
type Group = { first: string; calls: { id: string; tool: string; isError: boolean }[] }

/** Groups the person opened, by their first call's id; a reload folds them again. */
const open = new Set<string>()

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

/**
 * Folds each group of tool calls to one line, `▸ 5 calls · bash×3  read×2`.
 * A click opens the group, its calls drawn as they would be without it, and a
 * click on its `▾` line folds it again. The ctrl+o transcript shows all.
 */
export function registerGroups(on: On) {
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.isExpanded === true) return next(e)
    const group = await groupOf($, e.props.tool_use_id)
    if (group === undefined) return next(e)
    const isFirst = group.first === e.props.tool_use_id
    if (open.has(group.first)) {
      if (!isFirst) return next(e)
      const { Box } = $.ui.resolve(e)
      return Box({ flexDirection: 'column', children: [summary($, e, group), await next(e)] })
    }
    if (isFirst) return summary($, e, group)
    const { Box } = $.ui.resolve(e)
    return Box({})
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.props.isExpanded === true) return next(e)
    const group = await groupOf($, e.props.tool_use_id)
    if (group === undefined || open.has(group.first)) return next(e)
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
    if (open.has(group.first)) return next({ ...e, props: { ...e.props, isExpanded: true } })
    if (group.first === id) return summary($, e, group)
    const { Box } = $.ui.resolve(e)
    return Box({})
  })
}
