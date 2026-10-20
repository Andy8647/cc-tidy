# cc-tidy

[pi-tidy](https://github.com/Andy8647/pi-tidy)'s tool-call folding for
[Claude Code](https://code.claude.com)'s fullscreen terminal, as a Claude Code mod.

A reply's tool calls fold into one line, and you click it open:

```
 ▸ 7 calls ·  bash×5   read×2 · 1 failed · 7.7s
```

Click the summary and each call becomes a one-line box. Click a box to see everything the
call produced, then click anywhere on it to fold it back.

```
 ▾ 3 calls ·  bash×3 · 1.4s
 ╭──────────────────────────────────────────────────────────╮
 │ ✓  bash ls                              4 lines · 0.0s ▸ │
 ╰──────────────────────────────────────────────────────────╯
 ╭──────────────────────────────────────────────────────────╮
 │ ✓  bash git log --oneline | head -3    3 lines · 1.0s ▾ │
 │ 5f4b504 wip: Make fullscreen scrolling over split diffs  │
 │ …                                                        │
```

> **Status: experimental.** It works, but scrolling is noticeably laggy in real sessions
> (see [Known issues](#known-issues)). Claude Code's mod API is early access, so a Claude
> Code update can break it.

## Features

- **Grouped tool calls.** Every tool call between two pieces of text (a user message, or an
  assistant message with visible text) folds into one summary line: a count, each tool with
  its icon, failures in red, and the total time. Claude Code's own folds ("Ran 3 shell
  commands", "Called Jira") go away; their calls belong to the group.
- **One box per call.** It is a rounded box with the call's status mark, icon, highlighted
  command or file, and a short note (`12 lines`, `+4 -1`, `3 lines · 2 files`, `failed`)
  with its duration. Running calls have a grey border, failed calls red, and the rest green.
- **Click anywhere.** Every cell of a box is the mod's own button, borders included, so a
  click never reaches Claude Code. Claude Code would otherwise expand the message and grey
  it. The border doesn't light up under the pointer.
- **Two-pane diffs.** Edit, Write, and Bash commands that changed files draw their diff as
  `old │ new`: line numbers, a bar on changed lines, a tinted row, and the changed words in
  a deeper tint (pi-tidy's tint formula). Below 72 columns they fall back to one pane.
- **Syntax highlighting.** Read output, new files, and every diff line are highlighted as
  the file's language with a vendored [highlight.js](https://highlightjs.org) (44
  languages). Bash commands use pi-tidy's tokenizer. Bash output is highlighted when the
  command printed files of one language (`cat x.py`, `sed -n 1,80p a.ts`, `git diff`).
- **pi's colours.** Everything is drawn in pi's catppuccin mocha palette, the colours
  pi-tidy uses.
- `ctrl+o` draws every group open and every box full.

## Requirements

- Claude Code with mods (tested on **2.1.304**), in **fullscreen** mode (`"tui":
  "fullscreen"`). Clicks need the fullscreen terminal's mouse reporting.
- A [Nerd Font](https://www.nerdfonts.com) for the icons.
- Built for [Ghostty](https://ghostty.org). Other terminals should work. The icons look
  larger in Ghostty, because it widens a Nerd Font glyph into the space after it.

## Install

```bash
git clone https://github.com/Andy8647/cc-tidy.git
claude plugin marketplace add ./cc-tidy
claude plugin install cc-tidy@andy-local
```

A directory marketplace loads the plugin in place, so edits to the clone apply at the next
session or after `/reload-plugins`. To try it for one session without installing:

```bash
claude --plugin-dir ./cc-tidy
```

To turn it off: `claude plugin disable cc-tidy@andy-local`.

## Known issues

- **Scrolling is laggy**, most of all past open boxes. In fullscreen, Claude Code re-runs a
  mod's render hook on every scroll step that moves a message's edge, and re-renders the
  whole answer (the viewport position is part of the re-run key, and answers aren't
  memoised). A box is drawn as one Button per border cell and per content row, so an open
  40-line box is about 120 Buttons, and all of them re-render on each step. With every group
  folded, a scroll step measured 1–2 ms in a test harness. Real sessions still feel slow,
  and that hasn't been profiled yet.
- **A content row inverts under the pointer.** Claude Code's plugin Buttons always invert
  while hovered. Only the border is kept from inverting, through a hover override.
- **No durations for old calls.** Each call is timed around its execution, because the
  transcript keeps no timestamps. Calls made before the mod was loaded show no time.
- **Highlighting needs a known language.** Inside a box, only highlight.js can colour code.
  Claude Code's own highlighter only comes as a `Code` element, and a `Code` element can't
  sit inside a Button. Files are recognised by extension or name. Bash output is coloured
  only when the command clearly printed files of one language. There is no guessing from
  the text, because highlight.js's auto-detection rates a short `ls -la` as CSS as highly as
  real Python. When a command printed a file and then ran other commands, all of its output
  takes that file's language.
- **Colours are fixed** to catppuccin mocha (pi's palette). They don't follow your Claude
  Code `/theme`.
- **Long output is cut** at 200 rows in an open box. A Bash command that changed several
  files shows them all in one box, and single files can't be folded.
- **Main screen mode is not supported.** Outside fullscreen there are no clicks, so groups
  can't be opened (`ctrl+o` still shows everything).
- **The mod API can break.** Claude Code calls it early access and says it may change
  between releases. If the transcript suddenly looks like stock Claude Code again, run
  `claude plugin validate ./cc-tidy` and check `claude --debug`.

## Credits

- [pi-tidy](https://github.com/Andy8647/pi-tidy): the design, colours, tint formula and the
  bash tokenizer (`hooks/bash-spans.ts`).
- [cc-split-diff-view](https://github.com/neteye-platform/cc-split-diff-view): the split-row
  pairing (`hooks/split-rows.ts`), MIT, see `licenses/cc-split-diff-view-MIT`.
- [highlight.js](https://highlightjs.org) 11.11.1: vendored in `hooks/vendor/hljs`,
  BSD-3-Clause, see its `LICENSE`.

## License

MIT, see [LICENSE](LICENSE). The vendored and borrowed code keeps its own license, as listed
under Credits.
