import { argParts, iconOf, isSilentFailure, note, outputRows, shortName, statusOf } from './callbox.js'
import { bashSpans } from './bash-spans.js'
import { PI } from './palette.js'
import { formatDuration } from './timing.js'
import { clean, fit, spansWidth, textWidth, truncate, wrapText } from './textbox.js'
import { spinnerFrame } from './live.js'
import type { Call } from './callbox.js'
import type { Job } from './jobs.js'
import type { Span } from './textbox.js'

/**
 * pi-tidy's open group, as text: the rail ` │` down the left, one row per call,
 * and an opened call's body hanging under its row, which takes a tick (` ├─`).
 *
 *    ▾ 3 calls ·  bash×2  read×1 · 1.4s
 *    │ ✓  bash git status --short        4 lines · 0.1s
 *    ├─ ✓  read ~/x/notes.md            12 lines · 0.0s
 *    │    <what it produced>
 */

/** What a summary line counts: one entry a call. */
export type Tally = { tool: string; isError: boolean; isRunning: boolean; ms: number | undefined }

/** Cells a row keeps for the command before the metrics give way (pi-tidy's). */
const MIN_ARG_CELLS = 12

/** Cells an opened call's body is pushed in by: the rail and three. */
export const BODY_INDENT = 5

const rail = (glyph: string): Span[] => [{ text: ' ' }, { text: glyph, color: PI.borderMuted }]

const SEP: Span = { text: ' · ', color: PI.muted }

const plural = (n: number, one: string) => n + ' ' + (n === 1 ? one : one + 's')

/**
 * `nf-md-brain`. Not the emoji 🧠: no monospace Nerd Font has it, and its
 * two-cell colour fallback breaks the row's alignment.
 */
export const THOUGHT_ICON = '\u{f09d1}'

/** A settled run's preview is a glance, not a paragraph (pi-tidy's 56 cells). */
const THOUGHT_PREVIEW_CELLS = 56

/**
 * A run squeezed onto one row, in cells. Settled, its head, capped at 56
 * cells; live (`tail`), a window over its newest words that takes the whole
 * row, cut on a word break so the line doesn't shave half a word off.
 */
export function previewText(text: string, maxWidth: number, tail = false) {
  const flat = text.replace(/\s+/g, ' ').trim()
  const budget = tail ? maxWidth : Math.min(maxWidth, THOUGHT_PREVIEW_CELLS)
  if (budget <= 1) return ''
  if (!tail) return truncate(flat, budget)
  let out = flat
  while (textWidth(out) > budget - 1) out = out.slice(Math.max(1, Math.ceil(out.length / 8)))
  if (out.length >= flat.length) return flat
  const breakAt = out.indexOf(' ')
  if (breakAt > 0 && breakAt < out.length - 1) out = out.slice(breakAt + 1)
  return '…' + truncate(out, budget - 1)
}

/**
 * A thinking run's row: `󰧑 thinking  <its text>`, the label in the thinking
 * colour and the text in pi's `thinkingText`, all italic. Opened, the rail
 * takes the tick and the run hangs below.
 */
export function thoughtRowSpans(text: string, width: number, isOpened: boolean, isLive = false): Span[] {
  const head: Span[] = [...leadOf(isOpened), { text: THOUGHT_ICON + ' thinking  ', color: PI.warning, italic: true }]
  const room = width - spansWidth(head)
  return fit([...head, { text: previewText(text, room, isLive), color: PI.muted, italic: true }], width)
}

/** An opened run: its text wrapped under the row, five cells in. */
export function thoughtBodyLines(text: string, width: number): Span[][] {
  const inner = Math.max(4, width - BODY_INDENT)
  const lead = [...rail('│'), { text: '   ' }]
  return wrapText(text.trim(), inner).map(line => [...lead, ...fit([{ text: line, color: PI.muted, italic: true }], inner)])
}

/**
 * The summary line, pi-tidy's: `▸ 7 calls ·  bash×5  read×2 · 1 failed ·
 * 7.7s`, most frequent tool first. While a call runs, `running <tool>` takes
 * the duration's place. Folded, the failures are the only sign of them and
 * go red; open, the rows carry their own `✗` and the count goes quiet.
 */
export function summarySpans(
  calls: Tally[],
  isOpen: boolean,
  jobs: { running: number; spinner: string } = { running: 0, spinner: '◐' },
  thoughts: { count: number; live: boolean; spinner: string } = { count: 0, live: false, spinner: '◐' },
): Span[] {
  const counts = new Map<string, number>()
  for (const call of calls) counts.set(call.tool, (counts.get(call.tool) ?? 0) + 1)
  const kinds = [...counts]
    .sort(([a, m], [b, n]) => n - m || shortName(a).localeCompare(shortName(b)))
    .map(([tool, n]) => iconOf(tool) + ' ' + shortName(tool) + '×' + n)
    .join('  ')
  const failed = calls.filter(call => call.isError).length
  const running = calls.find(call => call.isRunning)
  const ms = calls.reduce((sum, call) => sum + (call.isRunning ? 0 : (call.ms ?? 0)), 0)
  const n = calls.length
  const parts: Span[][] = [
    [
      { text: isOpen ? '▾ ' : '▸ ', color: PI.accent },
      { text: n + (n === 1 ? ' call' : ' calls'), color: PI.toolTitle },
    ],
    [{ text: kinds, color: PI.muted }],
    // Folded, the only sign the reply thought at all. While a run is arriving
    // it says so, the spinner in place of the brain, and the count comes back
    // once it stops.
    ...(thoughts.live
      ? [[{ text: thoughts.spinner + ' thinking', color: PI.warning }]]
      : thoughts.count > 0
        ? [[{ text: THOUGHT_ICON + ' ' + plural(thoughts.count, 'thought'), color: PI.warning }]]
        : []),
    ...(failed > 0 ? [[{ text: failed + ' failed', color: isOpen ? PI.muted : PI.error }]] : []),
    ...(jobs.running > 0 ? [[{ text: jobs.spinner + ' ' + jobs.running + ' running', color: PI.accent }]] : []),
    ...(running !== undefined
      ? [[{ text: 'running ' + shortName(running.tool), color: PI.warning }]]
      : ms > 0
        ? [[{ text: formatDuration(ms), color: PI.muted }]]
        : []),
  ]
  return [{ text: ' ' }, ...parts.flatMap((part, i) => (i === 0 ? part : [SEP, ...part]))]
}

/** A group's metrics columns: the widest note and the widest duration. */
export type Columns = { note: number; duration: number }

/** A call's time as its column says it; none when nobody timed it. */
export const durationText = (ms: number | undefined) => (ms === undefined || ms <= 0 ? '' : formatDuration(ms))

/** What a call's metrics say: its note, and its time (live while it runs). */
export function metrics(call: Call, ms: number | undefined) {
  return { note: note(call), duration: durationText(ms) }
}

/** The tail of a row: the note and the duration, each padded to its column. */
function tailText(m: { note: string; duration: string }, columns: Columns) {
  const noteCol = columns.note > 0 ? m.note.padStart(columns.note) : ''
  const durCol = columns.duration > 0 ? m.duration.padStart(columns.duration) : ''
  const sep = noteCol !== '' && durCol !== '' ? (m.note !== '' && m.duration !== '' ? ' · ' : '   ') : ''
  const text = noteCol + sep + durCol
  return text.trim() === '' ? '' : '  ' + text
}

/**
 * A row's layout, exactly `width` cells: `head` (the rail, the mark, the
 * tool), the call's words, and `tail` at the right edge. The words get what
 * the rest leaves; when that would be under 12 cells the tail goes first,
 * then the `(+N lines)` marker.
 */
function layoutRow(head: Span[], call: Call, tail: Span | undefined, width: number, dim: string | undefined): Span[] {
  const { text, more } = argParts(call)
  const suffix = more > 0 ? ' (+' + more + (more === 1 ? ' line)' : ' lines)') : ''
  // One cell for the space before the words.
  const fixed = spansWidth(head) + 1
  const tailWidth = tail === undefined ? 0 : textWidth(tail.text)
  const keepTail = tail !== undefined && width - fixed - tailWidth >= MIN_ARG_CELLS
  const budget = width - fixed - (keepTail ? tailWidth : 0)
  // `(+12 lines)` is a nicety; the command is not.
  const shownSuffix = budget - textWidth(suffix) < MIN_ARG_CELLS ? '' : suffix
  const shown = truncate(text, budget - textWidth(shownSuffix))
  const left: Span[] = [
    ...head,
    ...(shown === '' ? [] : [{ text: ' ' + shown, color: dim ?? PI.toolOutput }]),
    ...(shownSuffix === '' ? [] : [{ text: shownSuffix, color: dim ?? PI.muted }]),
  ]
  return keepTail && tail !== undefined ? [...fit(left, width - tailWidth), tail] : fit(left, width)
}

const leadOf = (isOpened: boolean): Span[] => [...rail(isOpened ? '├─' : '│'), { text: ' ' }]

// The space after the icon lets Ghostty draw it two cells wide, as pi-tidy's are.
const toolName = (call: Call, color: string): Span => ({ text: iconOf(call.tool) + ' ' + shortName(call.tool), color })

/**
 * A call's row: the rail (or the tick, once opened), `✓  bash <command>`, and
 * the metrics in the group's columns at the right edge. A silent failure
 * keeps its red `✗` and dims the rest.
 */
export function callRowSpans(call: Call, ms: number | undefined, width: number, columns: Columns, isOpened: boolean): Span[] {
  const status = statusOf(call)
  const dim = isSilentFailure(call) ? PI.dim : undefined
  const head: Span[] = [...leadOf(isOpened), { text: status.mark + ' ', color: status.color }, toolName(call, dim ?? PI.toolTitle)]
  const tail = tailText(metrics(call, ms), columns)
  return layoutRow(head, call, tail === '' ? undefined : { text: tail, color: dim ?? PI.muted }, width, dim)
}

/** Whole seconds, then minutes: `12s`, `3m05s`, `1h02m` (pi-tidy's). */
export function formatElapsed(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return s + 's'
  if (s < 3600) return Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's'
  return Math.floor(s / 3600) + 'h' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + 'm'
}

/** `running 12s`, `exited 0 · 20s`, `exit 1 · 3s`, `killed · 3s`, `not running`. */
export function describeJob(job: Job, now = Date.now()) {
  if (job.status === 'gone') return 'not running'
  const end = job.status === 'running' ? now : job.endedAt
  const took = job.startedAt !== undefined && end !== undefined ? formatElapsed(end - job.startedAt) : ''
  if (job.status === 'running') return took === '' ? 'running' : 'running ' + took
  const said = job.status === 'done' ? 'exited ' + (job.exitCode ?? 0) : job.status === 'failed' ? (job.exitCode === undefined ? 'failed' : 'exit ' + job.exitCode) : 'killed'
  return took === '' ? said : said + ' · ' + took
}

const JOB_MARK: Record<Job['status'], { mark?: string; color: string }> = {
  running: { color: PI.accent },
  done: { mark: '✓', color: PI.success },
  failed: { mark: '✗', color: PI.error },
  killed: { mark: '⊘', color: PI.muted },
  gone: { mark: '⊘', color: PI.muted },
}

/**
 * A call that started a background job: the row tracks the job, not the call.
 * `◐ bash <command>  running 12s`, the spinner turning a step a second.
 */
export function jobRowSpans(call: Call, job: Job, width: number, isOpened: boolean, now = Date.now()): Span[] {
  const look = JOB_MARK[job.status]
  const mark = look.mark ?? spinnerFrame(job.startedAt, now)
  const head: Span[] = [...leadOf(isOpened), { text: mark + ' ', color: look.color }, toolName(call, PI.toolTitle)]
  const color = job.status === 'failed' ? PI.error : job.status === 'running' ? PI.warning : PI.muted
  return layoutRow(head, call, { text: '  ' + describeJob(job, now), color }, width, undefined)
}

/** The most lines an opened call draws. */
const OPEN_LINES = 200

/**
 * An opened call's body, each line exactly `width` cells: the rail and three
 * cells, then what the call produced. The row above already has the command's
 * first line, so only the rest of a multi-line command comes first.
 */
export function bodyLines(call: Call, width: number): Span[][] {
  const inner = Math.max(4, width - BODY_INDENT)
  const command = call.tool === 'Bash' && call.input !== null && typeof call.input === 'object' ? (call.input as Record<string, unknown>).command : undefined
  const rest = typeof command === 'string' ? command.split('\n').slice(1).map(line => bashSpans(clean(line))) : []
  const all = [...rest, ...outputRows(call, inner)]
  const shown = all.slice(0, OPEN_LINES)
  const hidden = all.length - shown.length
  const rows = hidden > 0 ? [...shown, [{ text: '… ' + hidden + ' more lines', color: PI.muted }]] : shown
  const lead = [...rail('│'), { text: '   ' }]
  return (rows.length > 0 ? rows : [[{ text: 'no output', color: PI.muted }]]).map(row => [...lead, ...fit(row, inner)])
}
