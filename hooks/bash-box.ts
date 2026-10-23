import type { On } from 'claude-code'

import { drawCallBox } from './callbox.js'
import { watchTick } from './live.js'

/** The calls whose box the person opened, by tool_use_id; a reload folds them again. */
const open = new Set<string>()

/**
 * A Bash call outside any group (the one still running, before the transcript
 * holds it) as the same box an open group draws: one line, a click for all of
 * its output. Its `ToolResult` draws nothing, as the box holds it.
 */
export function registerBashBox(on: On) {
  on('ui.render', { component: 'ToolUse', props: { tool: 'Bash' } }, async ($, e) => {
    const { tool_use_id: id } = e.props
    // Its time goes up while it runs.
    if (e.props.isRunning) await watchTick($)
    const width = (e.viewport?.columns ?? 100) - 1
    return drawCallBox($.ui.resolve(e), e.props, width, e.props.isExpanded === true || open.has(id), () => {
      if (open.has(id)) open.delete(id)
      else open.add(id)
      $.ui.invalidate('ui.render')
    })
  })

  on('ui.render', { component: 'ToolResult', props: { tool: 'Bash' } }, async ($, e) => $.ui.resolve(e).Box({}))
}
