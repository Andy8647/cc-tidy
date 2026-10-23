import type { RenderElement } from 'claude-code'

import { bashSpans } from './bash-spans.js'
import { PI } from './palette.js'
import { highlightLines, languageOf, languageOfCommand } from './highlight.js'
import { splitDiffRows } from './split.js'
import { durationOf, formatDuration } from './timing.js'
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

export const iconOf = (tool: string) => ICONS[tool.startsWith('mcp__') ? 'mcp' : tool] ?? '\u{f0ad}'

/**
 * The call's own words, pi-tidy's: a shell command's first line and how many
 * lines follow it; else the file, the pattern, the MCP tool, or the first
 * string argument.
 */
export function argParts(call: Call): { text: string; more: number } {
  const command = pick(call.input, 'command')
  if (command !== undefined) {
    const [first = '', ...rest] = command.split('\n')
    return { text: clean(first.trim()), more: rest.length }
  }
  if (call.tool.startsWith('mcp__')) return { text: call.tool.split('__').slice(2).join('__'), more: 0 }
  for (const key of ['file_path', 'path', 'pattern', 'url', 'query', 'description']) {
    const value = pick(call.input, key)
    if (value !== undefined && value !== '') return { text: clean(tildePath(value)), more: 0 }
  }
  const first = isRecord(call.input) ? Object.values(call.input).find(value => typeof value === 'string' && value !== '') : undefined
  return { text: typeof first === 'string' ? clean(first.split('\n')[0] ?? '') : '', more: 0 }
}

/** The call's own words, the command highlighted: the head of a box. */
function subject(call: Call): { spans: Span[]; more: number } {
  const { text, more } = argParts(call)
  return { spans: call.tool === 'Bash' ? bashSpans(text) : [{ text, color: PI.toolOutput }], more }
}

/** A patch's lines, one pane: the `+`/`-` mark in green or red, the code highlighted. */
function unifiedRows(patch: unknown[], language: string | undefined): Span[][] {
  return patch.flatMap((hunk: unknown) =>
    isRecord(hunk) && Array.isArray(hunk.lines)
      ? hunk.lines
          .filter((line): line is string => typeof line === 'string')
          .map(line => {
            const mark = line.charAt(0)
            const code = highlightLines(clean(line.slice(1)), language, mark === ' ' ? PI.diffContext : PI.toolOutput)[0] ?? []
            return [{ text: mark, color: mark === '+' ? PI.success : mark === '-' ? PI.error : PI.diffContext }, ...code]
          })
      : [],
  )
}

/** A patch as two panes when `inner` has room for them, else as one. */
const diffRows = (patch: unknown[], inner: number, language: string | undefined) =>
  splitDiffRows(patch, inner, language) ?? unifiedRows(patch, language)

/** `/Users/andy/x` → `~/x`. */
export const tildePath = (path: string) => path.replace(/^\/Users\/[^/]+(?=\/|$)/, '~')

/** The files a shell command changed (`bashEditDiff`): a header each, then its diff. */
function bashEditRows(diff: unknown, inner: number): Span[][] {
  if (!isRecord(diff) || diff.skipped === true || diff.unavailable === true || !Array.isArray(diff.files)) return []
  const rows = diff.files.flatMap((file: unknown): Span[][] => {
    if (!isRecord(file) || typeof file.filePath !== 'string' || !Array.isArray(file.hunks)) return []
    const all = file.hunks.flatMap((h: unknown) => (isRecord(h) && Array.isArray(h.lines) ? h.lines : []))
    const added = all.filter(l => typeof l === 'string' && l.startsWith('+')).length
    const removed = all.filter(l => typeof l === 'string' && l.startsWith('-')).length
    const verb = file.created === true ? 'Created ' : file.deleted === true ? 'Deleted ' : 'Updated '
    const header: Span[] = [
      { text: verb, color: PI.muted },
      { text: tildePath(file.filePath), color: PI.toolTitle },
      { text: ' (+' + added + ' -' + removed + ')', color: PI.muted },
    ]
    // A new or removed file has one empty side: one pane says the same.
    const language = languageOf(file.filePath)
    const body = file.created === true || file.deleted === true ? unifiedRows(file.hunks, language) : diffRows(file.hunks, inner, language)
    return [[{ text: '' }], header, ...body]
  })
  const more = typeof diff.moreFiles === 'number' ? diff.moreFiles : 0
  return more > 0 ? [...rows, [{ text: '… ' + more + ' more files changed', color: PI.muted }]] : rows
}

/** What the call printed or returned, line by line; a diff as two panes. */
export function outputRows(call: Call, inner: number): Span[][] {
  const out = call.output
  if (typeof out === 'string') return lines(out).map(plain)
  if (!isRecord(out)) return []
  const path = pick(call.input, 'file_path') ?? (typeof out.filePath === 'string' ? out.filePath : undefined)
  const language = languageOf(path)
  // A new file: its content, highlighted (its patch is the whole file as +).
  if (call.tool === 'Write' && out.type === 'create' && typeof out.content === 'string') return highlighted(out.content, language)
  if (Array.isArray(out.structuredPatch) && out.structuredPatch.length > 0) return diffRows(out.structuredPatch, inner, language)
  if (typeof out.stdout === 'string' || typeof out.stderr === 'string') {
    const text = [out.stdout, out.stderr].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join('\n')
    // The output's language, when the command printed files of one. No guessing from the
    // text: highlight.js scores a short `ls -la` as CSS as high as real Python.
    const printed = languageOfCommand(pick(call.input, 'command') ?? '')
    const rows = printed === undefined ? lines(text).map(plain) : highlighted(text, printed)
    return [...rows, ...bashEditRows(out.bashEditDiff, inner)]
  }
  if (isRecord(out.file) && typeof out.file.content === 'string') return highlighted(out.file.content, language)
  if (typeof out.content === 'string') return highlighted(out.content, language)
  return lines(JSON.stringify(out, null, 2) ?? '').map(plain)
}

/** An output line in the text colour; a `$ command` line highlighted as bash. */
const plain = (text: string): Span[] =>
  /^\$ \S/.test(text) ? [{ text: '$ ', color: PI.muted }, ...bashSpans(text.slice(2))] : [{ text, color: PI.toolOutput }]

/** A file's text, highlighted as its language, trailing blank lines dropped. */
const highlighted = (text: string, language: string | undefined) =>
  highlightLines(text.replace(/\s+$/, '').replace(/\t/g, '    '), language, PI.toolOutput).map(row => row.map(span => ({ ...span, text: clean(span.text) })))

function lines(text: string) {
  const trimmed = text.replace(/\s+$/, '')
  return trimmed === '' ? [] : trimmed.split('\n').map(clean)
}

const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many)

/**
 * A failed Bash call's first line: `Exit code N` as the model reads it,
 * `Error: Exit code N` as the transcript stores it.
 */
const EXIT = /^(?:Error: )?Exit code (\d+)\n?/

/**
 * A failure with nothing to read: the call exited non-zero and said nothing
 * (`test`, a probe, `sed` on a path that moved). pi-tidy keeps its red `✗`
 * and dims the rest, so it doesn't compete with the reply.
 */
export function isSilentFailure(call: Call) {
  if (!call.isErrored || call.isRunning || call.isInterrupted) return false
  return typeof call.output !== 'string' || call.output.replace(EXIT, '').trim() === ''
}

/**
 * What the call came to, said short, as pi-tidy says it: `12 lines`, `+4 -1`,
 * `3 lines · 2 files`, `exit 1`. Built-in tools only: anything else gets
 * none rather than a wrong one, and so does a call still running.
 */
export function note(call: Call) {
  if (call.isRunning) return ''
  if (call.isInterrupted) return 'interrupted'
  const out = call.output
  if (call.isErrored) {
    const code = typeof out === 'string' ? EXIT.exec(out)?.[1] : undefined
    return code === undefined ? '' : 'exit ' + code
  }
  if (!isRecord(out)) return ''
  if (Array.isArray(out.structuredPatch) && out.structuredPatch.length > 0) {
    const all = out.structuredPatch.flatMap((h: unknown) => (isRecord(h) && Array.isArray(h.lines) ? h.lines : []))
    return '+' + all.filter(l => typeof l === 'string' && l.startsWith('+')).length + ' -' + all.filter(l => typeof l === 'string' && l.startsWith('-')).length
  }
  if (call.tool === 'Write' && typeof out.content === 'string') return plural(lines(out.content).length, 'line')
  if (typeof out.stdout === 'string') {
    const n = lines([out.stdout, typeof out.stderr === 'string' ? out.stderr : ''].join('\n')).length
    const diff = out.bashEditDiff
    const files = isRecord(diff) && Array.isArray(diff.files) ? diff.files.length + (typeof diff.moreFiles === 'number' ? diff.moreFiles : 0) : 0
    const printed = n > 0 ? plural(n, 'line') : ''
    return files > 0 ? [printed, plural(files, 'file')].filter(Boolean).join(' · ') : printed
  }
  if (call.tool === 'Read' && isRecord(out.file)) {
    const n = typeof out.file.numLines === 'number' ? out.file.numLines : typeof out.file.content === 'string' ? lines(out.file.content).length : undefined
    return n === undefined ? '' : plural(n, 'line')
  }
  if (call.tool === 'Glob' && typeof out.numFiles === 'number') return out.numFiles === 0 ? 'no files' : plural(out.numFiles, 'file')
  if (call.tool === 'Grep') {
    const n = out.mode === 'content' ? out.numLines : out.numFiles
    if (typeof n === 'number') return n === 0 ? 'no matches' : out.mode === 'content' ? plural(n, 'line') : plural(n, 'file')
  }
  return ''
}

/** The call's state: its border, and the mark before it (pi-tidy's `⋯ ✗ ✓`). */
export function statusOf(call: Call) {
  if (call.isRunning) return { color: PI.running, mark: '⋯' }
  if (call.isErrored || call.isInterrupted) return { color: PI.error, mark: '✗' }
  return { color: PI.success, mark: '✓' }
}

/**
 * A call as one rounded box: folded, the one line `✓ >_bash git status
 * 4 lines · 0.1s`; full, that line and everything the call produced. A
 * click anywhere on the box runs `toggle`.
 */
export function drawCallBox(kit: Kit, call: Call, width: number, isFull: boolean, toggle: () => void): RenderElement {
  const status = statusOf(call)
  const { spans, more } = subject(call)
  // Folded, nothing below the header is drawn: don't build (or highlight) it.
  const body = isFull ? outputRows(call, width - 4) : []
  const ms = durationOf(call.tool_use_id ?? '')
  const tail = [note(call), ms === undefined ? '' : formatDuration(ms)].filter(Boolean).join(' · ')
  const right: Span[] = [
    ...(more > 0 ? [{ text: '  (+' + more + (more === 1 ? ' line)' : ' lines)'), color: PI.muted }] : []),
    ...(tail === '' ? [] : [{ text: '  ' + tail, color: call.isErrored || call.isInterrupted ? PI.error : PI.muted }]),
    { text: isFull ? '  ▾' : '  ▸', color: PI.muted },
  ]
  const header: Row = {
    left: [
      { text: status.mark + ' ', color: status.color },
      // The space lets Ghostty draw the icon two cells wide, as pi-tidy's are.
      { text: iconOf(call.tool) + ' ' + shortName(call.tool) + ' ', color: PI.toolTitle },
      ...spans,
    ],
    right,
  }
  const shown = isFull ? body.slice(0, OPEN_LINES) : []
  const hidden = isFull ? body.length - shown.length : 0
  const rows: Row[] = [
    header,
    ...shown.map(left => ({ left })),
    ...(hidden > 0 ? [{ left: [{ text: '… ' + hidden + ' more lines', color: PI.muted }] }] : []),
  ]
  return drawTextBox(kit, 'box:' + (call.tool_use_id ?? ''), width, status.color, rows, toggle)
}
