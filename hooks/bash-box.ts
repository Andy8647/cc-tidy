import type { On } from 'claude-code'

/** The calls whose box the person opened, by tool_use_id; a reload folds them again. */
const open = new Set<string>()

/** Output lines a folded box keeps, and the most an open one draws. */
const FOLDED_LINES = 1
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
 * the box already holds what it would. The ctrl+o transcript keeps Claude
 * Code's own drawing.
 */
export function registerBashBox(on: On) {
  on('ui.render', { component: 'ToolUse', props: { tool: 'Bash' } }, async ($, e, next) => {
    if (e.props.isExpanded === true || !isRecord(e.props.input)) return next(e)
    const { tool_use_id: id, isRunning, isErrored, isInterrupted, output } = e.props
    const command = typeof e.props.input.command === 'string' ? e.props.input.command : ''
    const { Box, Text, Code, Button } = $.ui.resolve(e)

    const [first = '', ...rest] = command.split('\n')
    const call = Box({
      flexDirection: 'row',
      children: [
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
    const isOpen = open.has(id)
    const toggle = () => {
      if (open.has(id)) open.delete(id)
      else open.add(id)
      $.ui.invalidate('ui.render')
    }

    let result = null
    if (isRunning) result = Text({ dimColor: true, children: ['  running…'] })
    else if (isInterrupted) result = Text({ color: 'error', children: ['  Interrupted'] })
    else if (body.length === 0) result = Text({ dimColor: true, children: ['  (no output)'] })
    else {
      const shown = body.slice(0, isOpen ? OPEN_LINES : FOLDED_LINES)
      const hidden = body.length - shown.length
      const tail = isOpen ? (hidden > 0 ? '  … ' + plural(hidden, 'more line') : '  ▾ fold') : hidden > 0 ? '  ▸ +' + plural(hidden, 'line') : ''
      result = Button({
        key: id,
        plain: true,
        onPress: toggle,
        children: [
          Text({ color: isErrored ? 'error' : undefined, dimColor: !isErrored, children: [shown.map(line => '  ' + line).join('\n')] }),
          Text({ dimColor: true, children: [tail] }),
        ],
      })
    }

    return Box({
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: isRunning ? 'inactive' : isErrored || isInterrupted ? 'error' : 'success',
      children: [call, result],
    })
  })

  // The box above already holds the result.
  on('ui.render', { component: 'ToolResult', props: { tool: 'Bash' } }, async ($, e, next) => {
    if (e.props.isExpanded === true) return next(e)
    const { Box } = $.ui.resolve(e)
    return Box({})
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
