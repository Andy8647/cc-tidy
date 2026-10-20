import type { On } from 'claude-code'

/**
 * The results the person opened, by tool_use_id. A module variable rather than
 * `$.state`: a reload folds everything again, which is fine for a view toggle.
 */
const open = new Set<string>()

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const MARK = '  ⎿  '

/**
 * Folds the diff of an Edit or a Write to one summary line. A click on the
 * summary shows that one result's diff as Claude Code draws it, and a click on
 * `▾ hide diff` folds it again. The ctrl+o transcript always shows everything.
 */
export function registerCollapse(on: On) {
  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const { tool, output, isErrored, isExpanded, tool_use_id: id } = e.props
    if (isErrored || isExpanded === true || !isRecord(output)) return next(e)
    if (tool !== 'Edit' && tool !== 'Write') return next(e)
    const lines = summary(tool, output)
    if (lines === null) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    const toggle = () => {
      if (open.has(id)) open.delete(id)
      else open.add(id)
      $.ui.invalidate('ui.render')
    }

    if (open.has(id)) {
      // A tall diff pushes the top one off screen, so it folds from its foot too.
      const hide = (key: string) => Button({ key, plain: true, dimColor: true, onPress: toggle, children: [MARK + '▾ hide diff'] })
      return Box({ flexDirection: 'column', children: [hide(id), await next(e), hide(id + ':foot')] })
    }

    const fold = Button({
      key: id,
      plain: true,
      dimColor: true,
      onPress: toggle,
      children: [Text({ children: [lines.map((line, i) => MARK + line + (i === lines.length - 1 ? ' ▸' : '')).join('\n')] })],
    })
    return Box({ flexDirection: 'column', children: [fold] })
  })
}

type Hunk = { lines: string[] }

const hunksOf = (patch: unknown): Hunk[] =>
  (Array.isArray(patch) ? patch : []).flatMap((hunk: unknown) =>
    isRecord(hunk) && Array.isArray(hunk.lines)
      ? [{ lines: hunk.lines.filter((line): line is string => typeof line === 'string') }]
      : [],
  )

const counts = (hunks: Hunk[]) => {
  const lines = hunks.flatMap(hunk => hunk.lines)
  return { added: lines.filter(l => l.startsWith('+')).length, removed: lines.filter(l => l.startsWith('-')).length }
}

const plural = (n: number, noun: string) => n + ' ' + noun + (n === 1 ? '' : 's')

/**
 * The folded lines for a result, or null to leave Claude Code's drawing alone:
 * an edit held for review, or a write that changed nothing.
 */
function summary(tool: string, output: Record<string, unknown>): string[] | null {
  if (output.staged === true) return null
  if (tool === 'Write' && output.type === 'create' && typeof output.content === 'string') {
    const n = output.content.split('\n').length - (output.content.endsWith('\n') ? 1 : 0)
    return ['Wrote ' + plural(n, 'line')]
  }
  const hunks = hunksOf(output.structuredPatch)
  if (hunks.length === 0) return null
  const { added, removed } = counts(hunks)
  return ['Added ' + plural(added, 'line') + ', removed ' + plural(removed, 'line')]
}
