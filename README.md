# cc-tidy

[pi-tidy](https://github.com/Andy8647/pi-tidy)'s tool-call folding for
[Claude Code](https://code.claude.com)'s fullscreen terminal, as a Claude Code mod.

A reply's tool calls fold into one line, and you click it open:

```
 ▸ 7 calls ·  bash×5   read×2 · 󰧑 3 thoughts · 1 failed · 7.7s
```

Click the summary and each call becomes a row on a rail, with the model's thinking
before it. Click a row to see what the call produced hanging under it, and click that
to fold it back.

```
 ▾ 3 calls ·  bash×3 · 󰧑 1 thought · 1 failed · 1.4s
 │ ✓  bash ls                                               4 lines · 0.0s
 │ 󰧑 thinking  The test probably fails on the missing fixture…
 ├─ ✗  bash pnpm test                                       exit 1 · 1.3s
 │    FAIL src/a.test.ts
 │    …
 │ ✓  bash git log --oneline | head -3                      3 lines · 0.1s
```

> **Status: experimental.** Claude Code's mod API is early access, so a Claude Code
> update can break it. Scrolling costs more than without the mod (see
> [Known issues](#known-issues)).

## Features

- **Grouped tool calls.** Every tool call between two pieces of text (a user message, or an
  assistant message with visible text) folds into one summary line, as pi-tidy's does: a
  count, each tool with its icon (most frequent first), the thinking runs, failures in red,
  background jobs still running, and the total time (`running bash` while a call runs).
  Claude Code's own folds ("Ran 3 shell commands", "Called Jira") go away; their calls
  belong to the group.
- **One row per call.** An open group is a rail of rows: the status mark, icon, the command
  or file, and the metrics (`12 lines`, `+4 -1`, `exit 1`, the duration) in columns that end
  on the same cell. The command gets the row's width; the metrics give way first on a narrow
  screen. A failure with nothing to read (`test -f x`, `false`) keeps its red `✗` and dims.
- **Opened calls hang under their row.** No box inside a group: the rail takes a tick
  (`├─`) and the output hangs five cells in. A click anywhere on it folds it back.
- **Running calls show up.** A call that has run for a second gets its row even in a folded
  group, its time going up. One that finishes inside the second never appears.
- **Background jobs.** A `run_in_background` command's row tracks the job: a spinner and
  `running 12s`, then `exited 0 · 20s`, `exit 1`, `killed`. The summary adds `◐ 1 running`.
  The job's "Background command … completed" notification isn't drawn; the row says so.
- **Thinking rows.** Each run of thinking before a call is a row above it,
  `󰧑 thinking  <its first words>`. Click it for the whole run. While a run is arriving the
  summary says `◐ thinking`, and an open group shows its newest words under the newest call.
  This needs `"showThinkingSummaries": true` in `~/.claude/settings.json`: without it Claude
  Code asks the API for no thinking text, and there are no rows.
- **Hover band.** The row under the pointer gets pi's `selectedBg` band, the whole width.
- **Click anywhere.** Every cell of a row is the mod's own button, so a click never reaches
  Claude Code, which would otherwise expand the message and grey it.
- **Two-pane diffs.** Edit, Write, and Bash commands that changed files draw their diff as
  `old │ new`: line numbers, a bar on changed lines, a tinted row, and the changed words in
  a deeper tint (pi-tidy's tint formula). Below 72 columns they fall back to one pane.
- **Syntax highlighting.** Read output, new files, and every diff line are highlighted as
  the file's language with a vendored [highlight.js](https://highlightjs.org) (44
  languages). Bash commands in a box use pi-tidy's tokenizer. Bash output is highlighted
  when the command printed files of one language (`cat x.py`, `sed -n 1,80p a.ts`, `git diff`).
- **pi's colours.** Everything is drawn in pi's catppuccin mocha palette, the colours
  pi-tidy uses.
- `ctrl+o` draws every group open and every call and thinking run opened.

## Requirements

- Claude Code with mods (tested on **2.1.309**), in **fullscreen** mode (`"tui":
  "fullscreen"`). Clicks need the fullscreen terminal's mouse reporting.
- A [Nerd Font](https://www.nerdfonts.com) for the icons.
- Built for [Ghostty](https://ghostty.org). Other terminals should work. The icons look
  larger in Ghostty, because it widens a Nerd Font glyph into the space after it.

## Install

```bash
claude plugin marketplace add Andy8647/cc-tidy
claude plugin install cc-tidy@andy8647
```

Or inside Claude Code: `/plugin marketplace add Andy8647/cc-tidy`, then
`/plugin install cc-tidy@andy8647`. Run `/reload-plugins` (or start a new session) to load it.

To update: `claude plugin marketplace update andy8647`, then
`claude plugin update cc-tidy@andy8647`. To turn it off:
`claude plugin disable cc-tidy@andy8647`.

To work on it, clone the repo and load your clone for one session:

```bash
git clone https://github.com/Andy8647/cc-tidy.git
claude --plugin-dir ./cc-tidy
```

## Known issues

- **Scrolling costs more than without the mod.** In fullscreen, Claude Code re-runs a mod's
  render hook for each message whose edge a scroll step moves (the viewport position is
  part of the re-run key, with no opt-out). On a session full of tool calls, measured in a
  pty, scrolling took about twice the CPU it takes with no mod, a few ms a step. A mod that
  hooks the same rows and only hands back Claude Code's own drawing, or one line of text,
  costs the same, so the cost is in hooking those rows at all, not in what cc-tidy draws.
- **No `▶` or `›` on hover.** pi-tidy turns the folded `▸` into `▶` and adds a `›` to a
  hovered row. A Button's hover can only restyle
  text, and a revealed overlay would be a cell that isn't a Button, which a click would
  pass to Claude Code. So there is the band alone.
- **No durations for old calls.** Each call is timed around its execution, because the
  transcript keeps no timestamps. Calls made before the mod was loaded show no time, and a
  resumed session's background jobs have no times either (`exited 0`, no `· 20s`).
- **Thinking from before the setting has no rows.** A session's thinking is stored as the
  API sent it, so turns taken while `showThinkingSummaries` was off stay empty. Claude Code
  still draws its own `Thought for 4s` line above text.
- **Highlighting needs a known language.** Inside a row's output, only highlight.js can
  colour code. Claude Code's own highlighter only comes as a `Code` element, and a `Code`
  element can't sit inside a Button. Files are recognised by extension or name. Bash output
  is coloured only when the command clearly printed files of one language.
- **Colours are fixed** to catppuccin mocha (pi's palette). They don't follow your Claude
  Code `/theme`.
- **Long output is cut** at 200 rows in an opened call. A Bash command that changed several
  files shows them all under one row, and single files can't be folded.
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
