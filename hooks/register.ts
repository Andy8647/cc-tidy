import type { On } from 'claude-code'

import { registerBashBox } from './bash-box.js'
import { registerCollapse } from './collapse.js'
import { registerGroups } from './group.js'

/** pi-tidy's look for Claude Code's terminal transcript. */
export function register(on: On) {
  registerGroups(on)
  registerBashBox(on)
  registerCollapse(on)
}
