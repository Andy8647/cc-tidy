import type { ElementTable, On, RenderElement } from 'claude-code'

/** The calls whose box the person opened, by tool_use_id; a reload folds them again. */
const open = new Set<string>()

/** Output lines a folded box keeps, and the most an open one draws. */
const FOLDED_LINES = 3
const OPEN_LINES = 200

/** fa-terminal, pi-tidy's bash icon (a Nerd Font glyph). */
const ICON = '\u{f120}'

const plural = (n: number, noun: string) => n + ' ' + noun + (n === 1 ? '' : 's')

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const lines = (text: string) => {
  const all = text.replace(/\s+$/, '').split('\n')
  return all.length === 1 && all[0] === '' ? [] : all
}

/**
 * A Bash call drawn as one rounded box, as pi-tidy draws it: the command,
 * highlighted, on the first row, then a line of its output. A click on the
 * output opens the whole of it, and another folds it. The box's border says
 * how the call went: grey while it runs, red when it failed, green otherwise.
 *
 * The box is the call's `ToolUse` row; its `ToolResult` draws nothing, as
 * the box already holds what it would. Expanded, it shows all its output.
 */
export function registerBashBox(on: On) {
  on('ui.render', { component: 'ToolUse', props: { tool: 'Bash' } }, async ($, e, next) => {
    if (!isRecord(e.props.input)) return next(e)
    const { tool_use_id: id } = e.props
    // Expanded (ctrl+o, or a click Claude Code took): the box with all its output.
    return drawBashBox($.ui.resolve(e), e.props, e.props.isExpanded === true || open.has(id), () => {
      if (open.has(id)) open.delete(id)
      else open.add(id)
      $.ui.invalidate('ui.render')
    })
  })

  // The box above already holds the result.
  on('ui.render', { component: 'ToolResult', props: { tool: 'Bash' } }, async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return Box({})
  })
}

/** What a box is drawn from: a `ToolUse` row's props, or a call of a `ToolGroup`. */
export type Call = {
  tool_use_id?: string
  input: unknown
  output?: unknown
  isRunning: boolean
  isErrored: boolean
  isInterrupted: boolean
}

export type Kit = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Code' | 'Button'>

/**
 * A Bash call's box. `isOpen` draws all of its output; `toggle` is what a
 * click on the output's tail runs. Given `fold`, a `▾` before the command
 * runs it: in an open group, that folds the box back to the call's row.
 */
export function drawBashBox(kit: Kit, call: Call, isOpen: boolean, toggle: () => void, fold?: () => void): RenderElement {
  const { Box, Text, Code, Button } = kit
  const { isRunning, isErrored, isInterrupted, output } = call
  const id = call.tool_use_id ?? ''
  const command = isRecord(call.input) && typeof call.input.command === 'string' ? call.input.command : ''

  const [first = '', ...rest] = command.split('\n')
  const row = Box({
    flexDirection: 'row',
    children: [
      fold === undefined
        ? null
        : Button({ key: 'fold:' + id, plain: true, dimColor: true, onPress: fold, children: [' ▾'] }),
      Text({ color: 'success', children: [' ' + ICON + ' '] }),
      Box({ flexShrink: 1, children: [Code({ source: first, language: 'bash', wrap: 'truncate-end' })] }),
      // Kept whole: the command is what gives way to the width.
      rest.length > 0
        ? Box({ flexShrink: 0, children: [Text({ dimColor: true, children: [' (+' + plural(rest.length, 'line') + ')'] })] })
        : null,
    ],
  })

  const text = outputText(output, isErrored)
  const body = text === null ? [] : lines(text)

  let result = null
  if (isRunning) result = Text({ dimColor: true, children: ['  running…'] })
  else if (isInterrupted) result = Text({ color: 'error', children: ['  Interrupted'] })
  else if (body.length === 0) result = Text({ dimColor: true, children: ['  (no output)'] })
  else {
    const shown = body.slice(0, isOpen ? OPEN_LINES : FOLDED_LINES)
    const hidden = body.length - shown.length
    const tail = isOpen ? (hidden > 0 ? '  … ' + plural(hidden, 'more line') : '  ▾ fold') : hidden > 0 ? '  ▸ +' + plural(hidden, 'line') : ''
    // Only the tail is the button: a Button inverts under the pointer, which
    // over a whole output reads as a grey block.
    result = Box({
      // Folded, the tail sits after the one line; open, under the lot.
      flexDirection: isOpen ? 'column' : 'row',
      children: [
        Text({ color: isErrored ? 'error' : undefined, dimColor: !isErrored, children: [shown.map(line => '  ' + line).join('\n')] }),
        tail === '' ? null : Button({ key: 'bash:' + id, plain: true, dimColor: true, onPress: toggle, children: [tail] }),
      ],
    })
  }

  return Box({
    flexDirection: 'column',
    borderStyle: 'round',
    borderColor: isRunning ? 'inactive' : isErrored || isInterrupted ? 'error' : 'success',
    children: [row, result],
  })
}

/** What the call printed, stdout then stderr, or the error the model read. */
function outputText(output: unknown, isErrored: boolean): string | null {
  if (typeof output === 'string') return output
  if (!isRecord(output)) return null
  const stdout = typeof output.stdout === 'string' ? output.stdout : ''
  const stderr = typeof output.stderr === 'string' ? output.stderr : ''
  if (isErrored && stdout === '' && stderr === '') return null
  return [stdout, stderr].filter(part => part.trim() !== '').join('\n')
}
