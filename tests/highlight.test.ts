import { expect, test } from 'claude-code/testing'

import { highlightLines, languageOf, paint } from '../hooks/highlight.js'

const PLAIN = '#a6adc8'

test('picks the language from the extension or the file name', async () => {
  expect(languageOf('/repo/app/models.py')).toBe('python')
  expect(languageOf('src/App.tsx')).toBe('typescript')
  expect(languageOf('/repo/Dockerfile')).toBe('dockerfile')
  expect(languageOf('/repo/notes.unknownext')).toBeUndefined()
})

test('colours python by scope, line by line, multi-line strings included', async () => {
  const rows = highlightLines('def greet(name):\n    """Say\n    hi."""\n    return 42', 'python', PLAIN)
  expect(rows).toHaveLength(4)
  expect(rows[0]?.[0]).toEqual({ text: 'def', color: '#cba6f7' })
  expect(rows[0]?.find(span => span.text === 'greet')?.color).toBe('#89b4fa')
  // The docstring (a string to highlight.js) keeps its colour on its second line.
  expect(rows[2]?.find(span => span.text.includes('hi'))?.color).toBe('#a6e3a1')
  expect(rows[3]?.find(span => span.text === '42')?.color).toBe('#fab387')
})

test('unescapes entities and falls back to plain text', async () => {
  const rows = highlightLines('a < b && c', 'javascript', PLAIN)
  expect(rows[0]?.map(span => span.text).join('')).toBe('a < b && c')
  expect(highlightLines('x', undefined, PLAIN)).toEqual([[{ text: 'x', color: PLAIN }]])
})

test('paints a tint behind highlighted spans, the changed words deeper', async () => {
  const spans = [{ text: 'value = ', color: '#a' }, { text: 'compute(x)', color: '#b' }]
  // "value = compute(x)": the word "compute" is 8..15.
  expect(paint(spans, 'ROW', [8, 15], 'WORD')).toEqual([
    { text: 'value = ', color: '#a', bg: 'ROW' },
    { text: 'compute', color: '#b', bg: 'WORD' },
    { text: '(x)', color: '#b', bg: 'ROW' },
  ])
  expect(paint(spans, undefined)).toBe(spans)
})
