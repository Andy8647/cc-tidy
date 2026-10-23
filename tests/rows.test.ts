import { expect, test } from 'claude-code/testing'

import { bodyLines, callRowSpans, summarySpans } from '../hooks/rows.js'
import { note } from '../hooks/callbox.js'
import { PI } from '../hooks/palette.js'
import { spansWidth } from '../hooks/textbox.js'
import type { Call } from '../hooks/callbox.js'
import type { Span } from '../hooks/textbox.js'

const text = (spans: Span[]) => spans.map(span => span.text).join('')

const bash = (command: string, output: unknown, extra: Partial<Call> = {}): Call => ({
  tool_use_id: 'id-' + command,
  tool: 'Bash',
  input: { command },
  output,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  ...extra,
})

const ok = (stdout: string) => ({ stdout, stderr: '', interrupted: false })

test('the summary counts tools most frequent first, failures red only while folded', async () => {
  const calls = [
    { tool: 'Read', isError: false, isRunning: false, ms: 100 },
    { tool: 'Bash', isError: true, isRunning: false, ms: 1000 },
    { tool: 'Bash', isError: false, isRunning: false, ms: 300 },
  ]
  const folded = summarySpans(calls, false)
  expect(text(folded)).toBe(' ▸ 3 calls · \u{f120} bash×2  \u{f06e} read×1 · 1 failed · 1.4s')
  expect(folded.find(span => span.text === '1 failed')?.color).toBe(PI.error)
  const opened = summarySpans(calls, true)
  expect(text(opened).startsWith(' ▾ 3 calls')).toBe(true)
  expect(opened.find(span => span.text === '1 failed')?.color).toBe(PI.muted)
})

test('a running call takes the duration’s place in the summary', async () => {
  const spans = summarySpans([{ tool: 'Bash', isError: false, isRunning: true, ms: 5000 }], false)
  expect(text(spans)).toBe(' ▸ 1 call · \u{f120} bash×1 · running bash')
  expect(spans.at(-1)?.color).toBe(PI.warning)
})

test('rows fill the width and end their metrics on the same cell', async () => {
  const columns = { note: 8, duration: 4 }
  const a = callRowSpans(bash('ls', ok('a\nb\nc\nd')), 100, 80, columns, false)
  const b = callRowSpans(bash('git log --oneline', ok(Array(12).fill('x').join('\n'))), 1200, 80, columns, false)
  expect(spansWidth(a)).toBe(80)
  expect(spansWidth(b)).toBe(80)
  expect(text(a).startsWith(' │ ✓ \u{f120} bash ls')).toBe(true)
  expect(text(a).endsWith(' 4 lines · 0.1s')).toBe(true)
  expect(text(b).endsWith('12 lines · 1.2s')).toBe(true)
})

test('an opened row takes the tick; a narrow row drops its metrics before its command', async () => {
  const call = bash('pnpm test --filter web', ok('x'))
  expect(text(callRowSpans(call, 100, 80, { note: 6, duration: 4 }, true)).startsWith(' ├─ ✓ ')).toBe(true)
  const narrow = text(callRowSpans(call, 100, 30, { note: 6, duration: 4 }, false))
  expect(narrow).not.toContain('1 line')
  expect(narrow).toContain('pnpm test')
})

test('a multi-line command says how many lines follow, until the room runs out', async () => {
  const call = bash('cd /tmp\nls\npwd', ok(''))
  expect(text(callRowSpans(call, undefined, 80, { note: 0, duration: 0 }, false))).toContain('cd /tmp (+2 lines)')
  expect(text(callRowSpans(call, undefined, 22, { note: 0, duration: 0 }, false))).not.toContain('(+2')
})

test('a silent failure keeps its red mark and dims the rest; one with output stays bright', async () => {
  const silent = callRowSpans(bash('test -f x', 'Exit code 1', { isErrored: true }), 100, 80, { note: 6, duration: 4 }, false)
  expect(silent.find(span => span.text === '✗ ')?.color).toBe(PI.error)
  expect(silent.find(span => span.text.includes('bash'))?.color).toBe(PI.dim)
  expect(text(silent)).toContain('exit 1')
  const loud = callRowSpans(bash('pnpm test', 'Exit code 1\nFAIL src/a.test.ts', { isErrored: true }), 100, 80, { note: 6, duration: 4 }, false)
  expect(loud.find(span => span.text.includes('bash'))?.color).toBe(PI.toolTitle)
})

test('notes say what a call produced, as pi-tidy does', async () => {
  expect(note(bash('ls', ok('a\nb')))).toBe('2 lines')
  expect(note(bash('true', ok('')))).toBe('')
  expect(note(bash('false', 'Exit code 2\n', { isErrored: true }))).toBe('exit 2')
  // As the transcript stores it.
  expect(note(bash('false', 'Error: Exit code 1', { isErrored: true }))).toBe('exit 1')
  expect(note(bash('sleep 9', undefined, { isRunning: true }))).toBe('')
  const read: Call = { tool: 'Read', input: { file_path: '/x' }, output: { type: 'text', file: { content: 'a', numLines: 40 } }, isRunning: false, isErrored: false, isInterrupted: false }
  expect(note(read)).toBe('40 lines')
  expect(note({ ...read, tool: 'mcp__jira__get', output: 'whatever' })).toBe('')
})

test('an opened body hangs five cells in, under the rail, the rest of the command first', async () => {
  const lines = bodyLines(bash('cd /tmp\nls', ok('one\ntwo')), 60)
  expect(lines.map(text)).toHaveLength(3)
  for (const line of lines) expect(spansWidth(line)).toBe(60)
  expect(text(lines[0] ?? []).startsWith(' │   ls')).toBe(true)
  expect(text(lines[2] ?? []).startsWith(' │   two')).toBe(true)
})
