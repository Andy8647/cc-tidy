import type { On } from 'claude-code'

import { registerBashBox } from './bash-box.js'
import { registerCollapse } from './collapse.js'
import { registerGroups } from './group.js'
import { registerTiming } from './timing.js'

/** pi-tidy's look for Claude Code's terminal transcript. */
export function register(on: On) {
  registerTiming(on)
  registerGroups(on)
  registerBashBox(on)
  registerCollapse(on)
}
