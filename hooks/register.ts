import type { On } from 'claude-code'

import { registerBashBox } from './bash-box.js'
import { registerCollapse } from './collapse.js'

/** pi-tidy's look for Claude Code's terminal transcript. */
export function register(on: On) {
  registerBashBox(on)
  registerCollapse(on)
}
