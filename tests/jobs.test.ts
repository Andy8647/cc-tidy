import { expect, test } from 'claude-code/testing'

import { isNotification, jobOf, noteEnded, noteStarted, parseNotification, readJobs } from '../hooks/jobs.js'
import { spinnerFrame } from '../hooks/live.js'
import { describeJob, jobRowSpans, summarySpans } from '../hooks/rows.js'
import { PI } from '../hooks/palette.js'
import { spansWidth } from '../hooks/textbox.js'
import type { Call } from '../hooks/callbox.js'
import type { Span } from '../hooks/textbox.js'

const text = (spans: Span[]) => spans.map(span => span.text).join('')

const NOTE = `<task-notification>
<task-id>bk8tbquqd</task-id>
<tool-use-id>toolu_A</tool-use-id>
<output-file>/tmp/tasks/bk8tbquqd.output</output-file>
<status>completed</status>
<summary>Background command "Train" completed (exit code 3)</summary>
</task-notification>`

test('reads which call a notification is about, and how the job ended', async () => {
  expect(isNotification(NOTE)).toBe(true)
  expect(isNotification('please check <task-notification>')).toBe(false)
  expect(parseNotification(NOTE)).toEqual({ toolUseId: 'toolu_A', status: 'completed', exitCode: 3 })
  expect(parseNotification('hello')).toBeUndefined()
})

test('a job runs from its call till its notification; a non-zero exit is a failure', async () => {
  noteStarted('toolu_B', 'b1')
  expect(jobOf('toolu_B')?.status).toBe('running')
  expect(noteEnded('toolu_B', 'completed', 1)).toBe(true)
  expect(jobOf('toolu_B')?.status).toBe('failed')
  expect(noteEnded('toolu_B', 'completed', 0)).toBe(false)
})

test('a resumed transcript gives each job its end, or says it is gone', async () => {
  const use = (id: string) => ({ tool_use_id: id, tool: 'Bash', input: {}, result: { stdout: '', stderr: '', backgroundTaskId: 't-' + id } })
  readJobs([
    { role: 'assistant', text: '', toolUses: [use('toolu_A'), use('toolu_C')] },
    { role: 'user', text: NOTE, toolUses: [] },
  ])
  expect(jobOf('toolu_A')).toEqual({ taskId: 't-toolu_A', status: 'failed', exitCode: 3 })
  expect(jobOf('toolu_C')?.status).toBe('gone')
})

test('a job row says its state where a result would be', async () => {
  const now = 100_000
  expect(describeJob({ taskId: 'x', status: 'running', startedAt: now - 12_000 }, now)).toBe('running 12s')
  expect(describeJob({ taskId: 'x', status: 'done', exitCode: 0, startedAt: now - 20_000, endedAt: now }, now)).toBe('exited 0 · 20s')
  expect(describeJob({ taskId: 'x', status: 'killed' }, now)).toBe('killed')
  expect(describeJob({ taskId: 'x', status: 'gone' }, now)).toBe('not running')
  const call: Call = { tool_use_id: 'j', tool: 'Bash', input: { command: 'pnpm dev' }, isRunning: false, isErrored: false, isInterrupted: false }
  const row = jobRowSpans(call, { taskId: 'x', status: 'running', startedAt: now - 3000 }, 80, false, now)
  expect(spansWidth(row)).toBe(80)
  expect(text(row).startsWith(' │ ' + spinnerFrame(now - 3000, now) + ' ')).toBe(true)
  expect(text(row).endsWith('  running 3s')).toBe(true)
  expect(row.at(-1)?.color).toBe(PI.warning)
})

test('the spinner turns a step a second, and stops after five minutes', async () => {
  expect(spinnerFrame(0, 1000)).not.toBe(spinnerFrame(0, 2000))
  expect(spinnerFrame(0, 6 * 60_000)).toBe('●')
})

test('the summary counts the jobs still running', async () => {
  const spans = summarySpans([{ tool: 'Bash', isError: false, isRunning: false, ms: 200 }], false, { running: 1, spinner: '◓' })
  expect(text(spans)).toBe(' ▸ 1 call · \u{f120} bash×1 · ◓ 1 running · 0.2s')
})
