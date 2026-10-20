import { PI } from './palette.js'
import { splitRows } from './split-rows.js'
import type { Cell } from './split-rows.js'
import { clean, fit, textWidth } from './textbox.js'
import type { Span } from './textbox.js'

/** Below this many cells inside a box, two panes are too narrow to read. */
export const SPLIT_MIN_WIDTH = 72

const SEPARATOR = ' │ '

type Rgb = [number, number, number]
const rgb = (hex: string): Rgb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const hex = (c: Rgb) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

/** pi's box background, the base pi-tidy mixes a diff colour into. */
const BASE = rgb('#28293a')

/**
 * pi-tidy's tint: the diff colour at `hue` over the box background at 0.35.
 * Low hue keeps a removed row from reading as a plum band.
 */
const tint = (color: string, hue: number) => {
  const c = rgb(color)
  return hex([c[0] * hue + BASE[0] * 0.35, c[1] * hue + BASE[1] * 0.35, c[2] * hue + BASE[2] * 0.35])
}

const TINT = {
  removed: { bar: PI.error, row: tint(PI.error, 0.16), word: tint(PI.error, 0.32) },
  added: { bar: PI.success, row: tint(PI.success, 0.16), word: tint(PI.success, 0.32) },
}

/** Longest common prefix and suffix, in code units (pi-tidy's commonEdges). */
function commonEdges(left: string, right: string) {
  const max = Math.min(left.length, right.length)
  let prefix = 0
  while (prefix < max && left[prefix] === right[prefix]) prefix++
  let suffix = 0
  while (suffix < max - prefix && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) suffix++
  return { prefix, suffix }
}

/**
 * One pane's cell, exactly `width` cells: a bar on a changed line, the line's
 * number, then its text, tinted when changed and the changed words deeper.
 */
function cell(line: Cell | null, kind: 'removed' | 'added', changed: boolean, numberWidth: number, width: number, emphasis?: [number, number]): Span[] {
  if (line === null) return [{ text: ' '.repeat(width) }]
  const look = changed ? TINT[kind] : undefined
  const text = clean(line.text)
  const body: Span[] =
    look !== undefined && emphasis !== undefined && emphasis[1] > emphasis[0]
      ? [
          { text: text.slice(0, emphasis[0]), color: PI.toolOutput, bg: look.row },
          { text: text.slice(emphasis[0], emphasis[1]), color: PI.toolOutput, bg: look.word },
          { text: text.slice(emphasis[1]), color: PI.toolOutput, bg: look.row },
        ]
      : [{ text, color: changed ? PI.toolOutput : PI.diffContext, ...(look === undefined ? {} : { bg: look.row }) }]
  const textWidthLeft = Math.max(1, width - 2 - numberWidth)
  return [
    { text: changed ? '▌' : ' ', color: look?.bar ?? PI.muted },
    { text: String(line.no).padStart(numberWidth) + ' ', color: changed ? (look?.bar ?? PI.muted) : PI.muted, ...(look === undefined ? {} : { bg: look.row }) },
    ...fit(body, textWidthLeft, look === undefined ? {} : { bg: look.row }),
  ]
}

/**
 * A structured patch as the rows of two panes, `old │ new`, `inner` cells
 * wide; null when it has no hunks or `inner` is too narrow for two panes.
 * A removed line sits next to the line that replaced it, with the words that
 * changed between them emphasised.
 */
export function splitDiffRows(patch: unknown, inner: number): Span[][] | null {
  if (inner < SPLIT_MIN_WIDTH) return null
  const diff = splitRows(patch)
  if (diff === null) return null
  const pane = Math.floor((inner - textWidth(SEPARATOR)) / 2)
  const rule: Span = { text: SEPARATOR, color: PI.muted }
  return diff.rows.map(row => {
    if (row.kind === 'gap') {
      const label = fit([{ text: '  ⋯ ' + row.hidden + ' unchanged lines', color: PI.muted }], pane)
      return [...label, rule, ...label]
    }
    const pair = row.changed && row.left !== null && row.right !== null
    const edges = pair ? commonEdges(row.left!.text, row.right!.text) : undefined
    const left = cell(row.left, 'removed', row.changed, diff.numberWidth, pane, edges && [edges.prefix, row.left!.text.length - edges.suffix])
    const right = cell(row.right, 'added', row.changed, diff.numberWidth, pane, edges && [edges.prefix, row.right!.text.length - edges.suffix])
    return [...left, rule, ...right]
  })
}
