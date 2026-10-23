import type { ElementTable, RenderElement } from 'claude-code'

export type Kit = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button'>

/** A run of text in one colour (a theme key or a hex), or plain. */
export type Span = { text: string; color?: string; bg?: string; dim?: boolean; bold?: boolean; italic?: boolean }

/** A line of a box: `left` is cut to the room `right` (kept whole) leaves it. */
export type Row = { left: Span[]; right?: Span[] }

/**
 * A character's width in terminal cells: two for East Asian wide and emoji,
 * none for combining marks, one otherwise (Nerd Font glyphs included).
 */
function charWidth(code: number) {
  if (code >= 0x300 && code <= 0x36f) return 0
  if (code === 0x200d || (code >= 0xfe00 && code <= 0xfe0f)) return 0
  if (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1faff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  )
    return 2
  return 1
}

export const textWidth = (text: string) => {
  let width = 0
  for (const char of text) width += charWidth(char.codePointAt(0) ?? 0)
  return width
}

/** Tabs as spaces, every other control character dropped: one line, drawable. */
export const clean = (text: string) => text.replace(/\t/g, '    ').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '')

/**
 * Text wrapped to `width` cells a line: at a space where the line has one,
 * anywhere in a run without (CJK has none). Blank lines are kept.
 */
export function wrapText(text: string, width: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    let line = ''
    let lineWidth = 0
    for (const char of clean(paragraph)) {
      const w = charWidth(char.codePointAt(0) ?? 0)
      if (lineWidth + w > width) {
        const space = line.lastIndexOf(' ')
        if (space > 0 && char !== ' ') {
          out.push(line.slice(0, space))
          line = line.slice(space + 1)
        } else {
          out.push(line.replace(/ +$/, ''))
          line = ''
        }
        lineWidth = textWidth(line)
        if (char === ' ' && line === '') continue
      }
      line += char
      lineWidth += w
    }
    out.push(line)
  }
  return out
}

/** Text cut to `width` cells, an ellipsis where it was cut; never padded. */
export function truncate(text: string, width: number) {
  if (textWidth(text) <= width) return text
  let out = ''
  let left = width - 1
  for (const char of text) {
    const w = charWidth(char.codePointAt(0) ?? 0)
    if (w > left) break
    out += char
    left -= w
  }
  return width > 0 ? out + '…' : ''
}

/**
 * Spans cut to `width` cells, an ellipsis where they were cut, padded to
 * exactly `width`; the padding takes `pad`'s background (a tinted diff row).
 */
export function fit(spans: Span[], width: number, pad: Omit<Span, 'text'> = {}): Span[] {
  const total = spans.reduce((n, span) => n + textWidth(span.text), 0)
  if (total <= width) return [...spans, { ...pad, text: ' '.repeat(width - total) }]
  const out: Span[] = []
  let left = width - 1
  for (const span of spans) {
    let text = ''
    for (const char of span.text) {
      const w = charWidth(char.codePointAt(0) ?? 0)
      if (w > left) break
      text += char
      left -= w
    }
    out.push({ ...span, text })
    if (text.length < span.text.length) break
  }
  return [...out, { ...pad, text: '…', dim: true }, { ...pad, text: ' '.repeat(left) }]
}

export const spansWidth = (spans: Span[]) => spans.reduce((n, span) => n + textWidth(span.text), 0)

const toText = (kit: Kit, span: Span) =>
  kit.Text({
    ...(span.color === undefined ? {} : { color: span.color }),
    ...(span.bg === undefined ? {} : { backgroundColor: span.bg }),
    ...(span.dim === true ? { dimColor: true } : {}),
    ...(span.bold === true ? { bold: true } : {}),
    ...(span.italic === true ? { italic: true } : {}),
    children: [span.text],
  })

/**
 * One line of ours, a single button: a click anywhere on it runs `onPress`,
 * and Claude Code never gets the click (which it would take to expand the
 * message and grey it). The spans should fill the row, so every cell is the
 * button's.
 *
 * A plain Button inverts under the pointer; its hover overrides come after
 * that, so `inverse: false` keeps the line still, and `band` lays pi's
 * `selectedBg` under the whole line instead. A hover needs a keyed Box above
 * it in the same answer: the caller's, which `key` must be unique within.
 */
export function drawLine(kit: Kit, key: string, spans: Span[], onPress: () => void, band?: string): RenderElement {
  return kit.Button({
    key,
    plain: true,
    onPress,
    hover: band === undefined ? { inverse: false } : { inverse: false, backgroundColor: band },
    children: spans.map(span => toText(kit, span)),
  })
}

/**
 * A rounded box drawn as text, one button per row, border included: a click
 * anywhere on the box runs `onPress`. Nothing lights under the pointer.
 *
 * @param key unique per box; it keys the Box the rows' hover needs, and each row's button
 * @param width the box's outer width in cells
 * @param border the border's colour
 * @param rows the lines inside, each cut or padded to fit
 */
export function drawTextBox(kit: Kit, key: string, width: number, border: string, rows: Row[], onPress: () => void): RenderElement {
  const inner = Math.max(4, width - 4)
  const edge = (id: string, left: string, right: string) =>
    drawLine(kit, key + ':' + id, [{ text: left + '─'.repeat(inner + 2) + right, color: border }], onPress)
  return kit.Box({
    key,
    flexDirection: 'column',
    children: [
      edge('top', '╭', '╮'),
      ...rows.map((row, i) => {
        const right = row.right ?? []
        const room = Math.max(1, inner - spansWidth(right))
        const spans = [{ text: '│ ', color: border }, ...fit(row.left, room), ...right, { text: ' │', color: border }]
        return drawLine(kit, key + ':' + i, spans, onPress)
      }),
      edge('bottom', '╰', '╯'),
    ],
  })
}
