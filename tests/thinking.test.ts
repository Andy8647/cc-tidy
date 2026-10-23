import { expect, test } from 'claude-code/testing'

import { previewText, summarySpans, THOUGHT_ICON, thoughtBodyLines, thoughtRowSpans } from '../hooks/rows.js'
import { endRun, isThinkingLive, liveText, noteThinking, noteTurn, thoughtsOf } from '../hooks/thinking.js'
import { spansWidth, textWidth, wrapText } from '../hooks/textbox.js'
import type { Span } from '../hooks/textbox.js'

const text = (spans: Span[]) => spans.map(span => span.text).join('')

test('a run belongs to the call after it; one before text is the text’s', async () => {
  const map = thoughtsOf([
    { role: 'user', content: [{ type: 'text', text: 'go' }] },
    {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'First the listing.' },
        { type: 'thinking', thinking: 'Then the rest.' },
        { type: 'tool_use', id: 'a', name: 'Bash', input: {} },
      ],
    },
    { role: 'assistant', content: [{ type: 'thinking', thinking: 'Say so.' }, { type: 'text', text: 'Done.' }, { type: 'tool_use', id: 'b', name: 'Bash', input: {} }] },
    // Summaries off: the blocks come back empty, signed.
    { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'tool_use', id: 'c', name: 'Bash', input: {} }] },
  ])
  expect(map.get('a')).toBe('First the listing.\n\nThen the rest.')
  expect(map.has('b')).toBe(false)
  expect(map.has('c')).toBe(false)
})

test('a run is live only while its turn is open and its text keeps growing', async () => {
  noteTurn(true)
  noteThinking('Checking the ', true)
  noteThinking('test output', false)
  expect(isThinkingLive()).toBe(true)
  expect(liveText()).toBe('Checking the test output')
  expect(isThinkingLive(Date.now() + 2000)).toBe(false)
  endRun()
  expect(isThinkingLive()).toBe(false)
  noteThinking('again', true)
  noteTurn(false)
  expect(isThinkingLive()).toBe(false)
})

test('a settled preview is a 56-cell glance; a live one is the newest words, cut on a word', async () => {
  const long = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma'
  expect(textWidth(previewText(long, 120))).toBe(56)
  const live = previewText(long, 30, true)
  expect(live.startsWith('…')).toBe(true)
  expect(live.endsWith('sigma')).toBe(true)
  expect(textWidth(live)).toBeLessThanOrEqual(30)
  expect(previewText('short one', 120, true)).toBe('short one')
})

test('a thinking row is the brain, the word, and the run, italic and the row’s width', async () => {
  const row = thoughtRowSpans('先确认一下这个目录里有什么', 80, false)
  expect(spansWidth(row)).toBe(80)
  expect(text(row).startsWith(' │ ' + THOUGHT_ICON + ' thinking  先确认')).toBe(true)
  expect(row.filter(span => span.text.trim() !== '' && span.text !== '│').every(span => span.italic)).toBe(true)
  expect(text(thoughtRowSpans('x', 80, true)).startsWith(' ├─ ')).toBe(true)
})

test('an opened run wraps under its row, CJK included', async () => {
  expect(wrapText('one two three four', 9)).toEqual(['one two', 'three', 'four'])
  expect(wrapText('一二三四五', 4)).toEqual(['一二', '三四', '五'])
  for (const line of thoughtBodyLines('a '.repeat(80), 40)) expect(spansWidth(line)).toBe(40)
})

test('the summary counts thoughts, or says a run is arriving', async () => {
  const calls = [{ tool: 'Bash', isError: true, isRunning: false, ms: 100 }]
  const jobs = { running: 0, spinner: '◐' }
  expect(text(summarySpans(calls, false, jobs, { count: 2, live: false, spinner: '◐' }))).toBe(
    ' ▸ 1 call · \u{f120} bash×1 · ' + THOUGHT_ICON + ' 2 thoughts · 1 failed · 0.1s',
  )
  expect(text(summarySpans(calls, false, jobs, { count: 2, live: true, spinner: '◓' }))).toContain('· ◓ thinking ·')
})
