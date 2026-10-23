import type { ApiMessage } from 'claude-code'

/**
 * The model's thinking, as pi-tidy shows it inside a group: one row per run
 * of thinking that came before a call with no text between them. A run
 * before text (a boundary's) is Claude Code's to draw ("Thought for 4s"), and
 * isn't counted.
 *
 * Claude Code sends thinking back as the API gave it: with the
 * `showThinkingSummaries` setting on, a summary of it; off, nothing (the
 * blocks are empty, signed), and then there are no rows.
 */

/** The thinking before each call, by tool_use_id: consecutive blocks joined. */
export function thoughtsOf(messages: ApiMessage[]) {
  const map = new Map<string, string>()
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    let run: string[] = []
    for (const block of message.content) {
      if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.trim() !== '') run.push(block.thinking.trim())
      else if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') run = []
      else if (block.type === 'tool_use' && typeof block.id === 'string') {
        if (run.length > 0) map.set(block.id, run.join('\n\n'))
        run = []
      }
    }
  }
  return map
}

/**
 * A run is live while it is actually arriving, which takes three things: a
 * main-thread turn open, its step still streaming thinking, and the text grown
 * within the last 1.5 s. Growth is the signal that can't lie: when tokens stop,
 * the row goes quiet on its own, and a restored session never looks live.
 */
export const LIVE_WINDOW_MS = 1500

const live = { isTurnOpen: false, text: '', grewAt: 0 }

export function noteTurn(isOpen: boolean) {
  live.isTurnOpen = isOpen
  if (!isOpen) endRun()
}

/** A piece of thinking arrived; `fresh` starts a new run (a new step or block). */
export function noteThinking(text: string, fresh: boolean) {
  if (fresh) live.text = ''
  live.text += text
  if (text !== '') live.grewAt = Date.now()
}

/** The run ended: a call or text came after it, or its step did. */
export function endRun() {
  live.grewAt = 0
  live.text = ''
}

export const isThinkingLive = (now = Date.now()) => live.isTurnOpen && live.grewAt > 0 && now - live.grewAt < LIVE_WINDOW_MS

/** When the live window lapses, if it is open: a redraw then takes the marker off. */
export const liveUntil = () => (isThinkingLive() ? live.grewAt + LIVE_WINDOW_MS : undefined)

export const liveText = () => live.text
