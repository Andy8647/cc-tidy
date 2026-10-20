/**
 * Bash command syntax highlighting, ported from pi-tidy's bash-highlight.ts
 * (a custom tokenizer: commands, flags, strings, variables, operators). The
 * spans carry catppuccin mocha colours, as Claude Code's theme has no syntax
 * colours of its own.
 */

import type { Span } from "./textbox.js";

/** pi's syntax tokens in catppuccin mocha. */
const COLORS: Record<string, string> = {
  syntaxFunction: "#89b4fa",
  syntaxKeyword: "#cba6f7",
  syntaxString: "#a6e3a1",
  syntaxVariable: "#f38ba8",
  syntaxType: "#f9e2af",
  syntaxOperator: "#89dceb",
  syntaxNumber: "#fab387",
  syntaxComment: "#6c7086",
};

// Shell grammar keywords (flow control) → syntaxKeyword
const SHELL_KEYWORDS = new Set([
  "if", "then", "else", "elif", "fi", "for", "while", "until", "do", "done",
  "case", "esac", "in", "function", "select", "time", "coproc", "{", "}", "!",
]);

// NOTE: '#' is deliberately NOT a word break. A '#' only starts a comment at
// word start (handled above), so a mid-word '#' (fill:#242f60, a#b, url#frag)
// must stay inside the word. Treating it as a break used to leave the scanner
// unable to advance — see the progress guard in highlightBashCommand.
const WORD_BREAK = /[\s'"`$|&;<>()]/;

/**
 * Tokenize a shell command into coloured spans.
 * Anything unrecognized passes through uncolored.
 */
export function bashSpans(command: string): Span[] {
  const out: Span[] = [];
  const push = (text: string, token: string | null) => {
    if (text !== "") out.push(token === null ? { text } : { text, color: COLORS[token] });
  };

  let i = 0;
  const n = command.length;
  let expectCmd = true; // next word sits in command position

  while (i < n) {
    const c = command[i] ?? "";

    // whitespace / newlines
    if (c === " " || c === "\t") { push(c, null); i++; continue; }
    if (c === "\n") { push(c, null); expectCmd = true; i++; continue; }

    // comment (only at word start)
    if (c === "#" && (i === 0 || command[i - 1] === " " || command[i - 1] === "\t" || command[i - 1] === "\n")) {
      const nl = command.indexOf("\n", i);
      const end = nl === -1 ? n : nl;
      push(command.slice(i, end), "syntaxComment");
      i = end;
      continue;
    }

    // operators (longest first)
    // fd redirects like 2>&1 (4 chars): target is not a command word
    const four = command.slice(i, i + 4);
    if (four === "2>&1" || four === "1>&2") {
      push(four, "syntaxOperator"); i += 4; continue;
    }
    const three = command.slice(i, i + 3);
    if (three === "&>>") {
      push(three, "syntaxOperator"); i += 3; continue;
    }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      push(two, "syntaxOperator"); i += 2; expectCmd = true; continue;
    }
    // other redirects: the next word is a file target, not a command
    if (two === ">>" || two === "2>" || two === ">&" || two === "<&" || two === "&>" || two === "<<") {
      push(two, "syntaxOperator"); i += 2; continue;
    }
    if (c === "|" || c === ";") {
      push(c, "syntaxOperator"); i++; expectCmd = true; continue;
    }
    if (c === ">" || c === "<") {
      push(c, "syntaxOperator"); i++; continue;
    }
    if (c === "&") { push(c, "syntaxOperator"); i++; expectCmd = true; continue; }
    if (c === "(") { push(c, "syntaxOperator"); i++; expectCmd = true; continue; }
    if (c === ")") { push(c, "syntaxOperator"); i++; expectCmd = false; continue; }

    // single-quoted string
    if (c === "'") {
      const q = command.indexOf("'", i + 1);
      const end = q === -1 ? n : q + 1;
      push(command.slice(i, end), "syntaxString");
      i = end;
      continue;
    }

    // double-quoted string (escape-aware)
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (command[j] === "\\") { j += 2; continue; }
        if (command[j] === '"') { j++; break; }
        j++;
      }
      push(command.slice(i, j), "syntaxString");
      i = j;
      continue;
    }

    // backtick substitution
    if (c === "`") {
      const q = command.indexOf("`", i + 1);
      const end = q === -1 ? n : q + 1;
      push(command.slice(i, end), "syntaxString");
      i = end;
      continue;
    }

    // variable: $VAR ${VAR} $1 $@ $? $(...)
    if (c === "$") {
      const m = /^\$(\([^)]*\)|\{[^}]*\}|[A-Za-z_][A-Za-z0-9_]*|[0-9@#?$!*_-])/.exec(command.slice(i));
      if (m) {
        push(m[0], "syntaxVariable");
        i += m[0].length;
        continue;
      }
      push(c, null); i++; continue;
    }

    // word
    let j = i;
    while (j < n && !WORD_BREAK.test(command[j] ?? "")) j++;
    // Progress guard: every branch above either advanced `i` or is reached only
    // when `command[i]` is not a word break. If some future/unhandled break
    // character lands here, `j === i` and a bare `continue` would spin forever
    // pushing empty strings (this froze the whole TUI on `echo a#b`). Emit the
    // character plainly and move on — the tokenizer must always terminate.
    if (j === i) {
      push(c, null);
      i++;
      continue;
    }
    const word = command.slice(i, j);
    i = j;

    // assignment prefix in command position: VAR=value
    if (expectCmd && /^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) {
      const eq = word.indexOf("=");
      push(word.slice(0, eq), "syntaxVariable");
      push("=", "syntaxOperator");
      push(word.slice(eq + 1), null);
      continue; // still expecting the command word
    }

    if (expectCmd) {
      if (SHELL_KEYWORDS.has(word)) push(word, "syntaxKeyword");
      else push(word, "syntaxFunction"); // builtins + external commands
      expectCmd = false;
      continue;
    }

    // flags: -x -abc --long --key=value
    if (/^--?[A-Za-z0-9][\w.-]*(=.*)?$/.test(word) && word !== "-") {
      const eq = word.indexOf("=");
      if (eq !== -1) {
        push(word.slice(0, eq), "syntaxType");
        push("=", "syntaxOperator");
        push(word.slice(eq + 1), null);
      } else {
        push(word, "syntaxType");
      }
      continue;
    }

    // numbers
    if (/^\d+(\.\d+)?$/.test(word)) { push(word, "syntaxNumber"); continue; }

    push(word, null);
  }

  return out;
}

