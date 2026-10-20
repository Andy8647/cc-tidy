import type { ElementTable, RenderElement } from 'claude-code'

export type Kit = Pick<ElementTable<'terminal'>, 'Box' | 'Text' | 'Button'>

/** A run of text in one colour (a theme key or a hex), or plain. */
export type Span = { text: string; color?: string; bg?: string; dim?: boolean; bold?: boolean }

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

/** The hover group every border button is in: it lights nothing, it only turns inversion off. */
const BORDER_SCOPE = 'cc-tidy-border'

const toText = (kit: Kit, span: Span) =>
  kit.Text({
    ...(span.color === undefined ? {} : { color: span.color }),
    ...(span.bg === undefined ? {} : { backgroundColor: span.bg }),
    ...(span.dim === true ? { dimColor: true } : {}),
    ...(span.bold === true ? { bold: true } : {}),
    children: [span.text],
  })

/**
 * A rounded box drawn as text, every row of it a button: a click anywhere on
 * the box (border included) runs `onPress`, and Claude Code never gets the
 * click (which it would take to expand the message and grey it).
 *
 * @param key unique per box; each row's button key derives from it
 * @param width the box's outer width in cells
 * @param border the border's colour
 * @param rows the lines inside, each cut or padded to fit
 */
export function drawTextBox(kit: Kit, key: string, width: number, border: string, rows: Row[], onPress: () => void): RenderElement {
  const inner = Math.max(4, width - 4)
  const button = (id: string, spans: Span[], lights: boolean) =>
    kit.Button({
      key: key + ':' + id,
      plain: true,
      onPress,
      // A plain Button inverts under the pointer; its hover overrides come
      // after that, so `inverse: false` keeps the border from lighting up.
      ...(lights ? {} : { hover: { scope: BORDER_SCOPE, inverse: false } }),
      children: spans.map(span => toText(kit, span)),
    })
  const edge = (id: string, left: string, right: string) =>
    button(id, [{ text: left + '─'.repeat(inner + 2) + right, color: border }], false)
  return kit.Box({
    flexDirection: 'column',
    children: [
      edge('top', '╭', '╮'),
      ...rows.map((row, i) => {
        const right = row.right ?? []
        const room = Math.max(1, inner - right.reduce((n, span) => n + textWidth(span.text), 0))
        return kit.Box({
          flexDirection: 'row',
          children: [
            button(i + ':l', [{ text: '│ ', color: border }], false),
            button(i + ':c', [...fit(row.left, room), ...right], true),
            button(i + ':r', [{ text: ' │', color: border }], false),
          ],
        })
      }),
      edge('bottom', '╰', '╯'),
    ],
  })
}
