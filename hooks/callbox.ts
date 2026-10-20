import type { RenderElement } from 'claude-code'

import { bashSpans } from './bash-spans.js'
import { clean, drawTextBox } from './textbox.js'
import type { Kit, Row, Span } from './textbox.js'

/** What a box is drawn from: a `ToolUse` row's props, or a call of a `ToolGroup`. */
export type Call = {
  tool_use_id?: string
  tool: string
  input: unknown
  output?: unknown
  isRunning: boolean
  isErrored: boolean
  isInterrupted: boolean
}

/** The most output lines an open box draws. */
const OPEN_LINES = 200

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const pick = (input: unknown, key: string) =>
  isRecord(input) && typeof input[key] === 'string' ? (input[key] as string) : undefined

/** Nerd Font icons, as pi-tidy's (fa-terminal, fa-eye, fa-pencil, …). */
const ICONS: Record<string, string> = {
  Bash: '\u{f120}',
  Read: '\u{f06e}',
  Edit: '\u{f044}',
  Write: '\u{f0c7}',
  Grep: '\u{f002}',
  Glob: '\u{f07c}',
  mcp: '\u{f12e}',
}

/** `Bash` → `bash`, `mcp__jira__jira_get_issue` → `jira`. */
export const shortName = (tool: string) => (tool.startsWith('mcp__') ? (tool.split('__')[1] ?? 'mcp') : tool.toLowerCase())

const iconOf = (tool: string) => ICONS[tool.startsWith('mcp__') ? 'mcp' : tool] ?? '\u{f0ad}'

/** The call's own words: the command, highlighted, or the file, the pattern, the MCP tool. */
function subject(call: Call): { spans: Span[]; more: number } {
  if (call.tool === 'Bash') {
    const [first = '', ...rest] = (pick(call.input, 'command') ?? '').split('\n')
    return { spans: bashSpans(clean(first)), more: rest.length }
  }
  const words = call.tool.startsWith('mcp__')
    ? call.tool.split('__').slice(2).join('__')
    : (pick(call.input, 'file_path') ?? pick(call.input, 'path') ?? pick(call.input, 'pattern') ?? pick(call.input, 'url') ?? pick(call.input, 'description') ?? '')
  return { spans: [{ text: clean(words) }], more: 0 }
}

/** What the call printed or returned, line by line, coloured where it is a diff. */
function outputRows(call: Call): Span[][] {
  const out = call.output
  if (typeof out === 'string') return lines(out).map(plain)
  if (!isRecord(out)) return []
  if (Array.isArray(out.structuredPatch) && out.structuredPatch.length > 0) {
    return out.structuredPatch.flatMap((hunk: unknown) =>
      isRecord(hunk) && Array.isArray(hunk.lines)
        ? hunk.lines
            .filter((line): line is string => typeof line === 'string')
            .map(line => [{ text: clean(line), ...(line.startsWith('+') ? { color: 'success' } : line.startsWith('-') ? { color: 'error' } : {}) }])
        : [],
    )
  }
  if (typeof out.stdout === 'string' || typeof out.stderr === 'string') {
    const text = [out.stdout, out.stderr].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join('\n')
    return lines(text).map(plain)
  }
  if (isRecord(out.file) && typeof out.file.content === 'string') return lines(out.file.content).map(plain)
  if (typeof out.content === 'string') return lines(out.content).map(plain)
  return lines(JSON.stringify(out, null, 2) ?? '').map(plain)
}

/** An output line in the text colour; a `$ command` line highlighted as bash. */
const plain = (text: string): Span[] => (/^\$ \S/.test(text) ? [{ text: '$ ', dim: true }, ...bashSpans(text.slice(2))] : [{ text }])

function lines(text: string) {
  const trimmed = text.replace(/\s+$/, '')
  return trimmed === '' ? [] : trimmed.split('\n').map(clean)
}

/** What the call came to, said short: `12 lines`, `failed`, `running`. */
export function note(call: Call, rows: number) {
  if (call.isRunning) return 'running'
  if (call.isInterrupted) return 'interrupted'
  if (call.isErrored) return 'failed'
  return rows === 0 ? 'no output' : rows === 1 ? '1 line' : rows + ' lines'
}

/**
 * A call as one rounded box: folded, the one line `>_ git status   4 lines`;
 * full, that line and everything the call produced. A click anywhere on the
 * box runs `toggle`.
 */
export function drawCallBox(kit: Kit, call: Call, width: number, isFull: boolean, toggle: () => void): RenderElement {
  const status = call.isRunning ? 'inactive' : call.isErrored || call.isInterrupted ? 'error' : 'success'
  const { spans, more } = subject(call)
  const body = outputRows(call)
  const right: Span[] = [
    ...(more > 0 ? [{ text: '  (+' + more + (more === 1 ? ' line)' : ' lines)'), dim: true }] : []),
    { text: '  ' + note(call, body.length) + (isFull ? ' ▾' : ' ▸'), dim: true, ...(status === 'error' ? { color: 'error' } : {}) },
  ]
  const header: Row = { left: [{ text: iconOf(call.tool) + ' ', color: status }, ...spans], right }
  const shown = isFull ? body.slice(0, OPEN_LINES) : []
  const hidden = isFull ? body.length - shown.length : 0
  const rows: Row[] = [
    header,
    ...shown.map(left => ({ left })),
    ...(hidden > 0 ? [{ left: [{ text: '… ' + hidden + ' more lines', dim: true }] }] : []),
  ]
  return drawTextBox(kit, 'box:' + (call.tool_use_id ?? ''), width, status, rows, toggle)
}
