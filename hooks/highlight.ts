import hljs from './vendor/hljs/core.min.js'
import lang_bash from './vendor/hljs/languages/bash.min.js'
import lang_shell from './vendor/hljs/languages/shell.min.js'
import lang_python from './vendor/hljs/languages/python.min.js'
import lang_javascript from './vendor/hljs/languages/javascript.min.js'
import lang_typescript from './vendor/hljs/languages/typescript.min.js'
import lang_json from './vendor/hljs/languages/json.min.js'
import lang_yaml from './vendor/hljs/languages/yaml.min.js'
import lang_markdown from './vendor/hljs/languages/markdown.min.js'
import lang_css from './vendor/hljs/languages/css.min.js'
import lang_scss from './vendor/hljs/languages/scss.min.js'
import lang_less from './vendor/hljs/languages/less.min.js'
import lang_xml from './vendor/hljs/languages/xml.min.js'
import lang_sql from './vendor/hljs/languages/sql.min.js'
import lang_go from './vendor/hljs/languages/go.min.js'
import lang_rust from './vendor/hljs/languages/rust.min.js'
import lang_java from './vendor/hljs/languages/java.min.js'
import lang_kotlin from './vendor/hljs/languages/kotlin.min.js'
import lang_scala from './vendor/hljs/languages/scala.min.js'
import lang_c from './vendor/hljs/languages/c.min.js'
import lang_cpp from './vendor/hljs/languages/cpp.min.js'
import lang_csharp from './vendor/hljs/languages/csharp.min.js'
import lang_objectivec from './vendor/hljs/languages/objectivec.min.js'
import lang_swift from './vendor/hljs/languages/swift.min.js'
import lang_ruby from './vendor/hljs/languages/ruby.min.js'
import lang_php from './vendor/hljs/languages/php.min.js'
import lang_lua from './vendor/hljs/languages/lua.min.js'
import lang_perl from './vendor/hljs/languages/perl.min.js'
import lang_r from './vendor/hljs/languages/r.min.js'
import lang_dockerfile from './vendor/hljs/languages/dockerfile.min.js'
import lang_makefile from './vendor/hljs/languages/makefile.min.js'
import lang_ini from './vendor/hljs/languages/ini.min.js'
import lang_diff from './vendor/hljs/languages/diff.min.js'
import lang_plaintext from './vendor/hljs/languages/plaintext.min.js'
import lang_graphql from './vendor/hljs/languages/graphql.min.js'
import lang_protobuf from './vendor/hljs/languages/protobuf.min.js'
import lang_nginx from './vendor/hljs/languages/nginx.min.js'
import lang_powershell from './vendor/hljs/languages/powershell.min.js'
import lang_haskell from './vendor/hljs/languages/haskell.min.js'
import lang_elixir from './vendor/hljs/languages/elixir.min.js'
import lang_dart from './vendor/hljs/languages/dart.min.js'
import lang_cmake from './vendor/hljs/languages/cmake.min.js'
import lang_groovy from './vendor/hljs/languages/groovy.min.js'
import lang_vim from './vendor/hljs/languages/vim.min.js'
import lang_latex from './vendor/hljs/languages/latex.min.js'

import type { Span } from './textbox.js'

hljs.registerLanguage('bash', lang_bash)
hljs.registerLanguage('shell', lang_shell)
hljs.registerLanguage('python', lang_python)
hljs.registerLanguage('javascript', lang_javascript)
hljs.registerLanguage('typescript', lang_typescript)
hljs.registerLanguage('json', lang_json)
hljs.registerLanguage('yaml', lang_yaml)
hljs.registerLanguage('markdown', lang_markdown)
hljs.registerLanguage('css', lang_css)
hljs.registerLanguage('scss', lang_scss)
hljs.registerLanguage('less', lang_less)
hljs.registerLanguage('xml', lang_xml)
hljs.registerLanguage('sql', lang_sql)
hljs.registerLanguage('go', lang_go)
hljs.registerLanguage('rust', lang_rust)
hljs.registerLanguage('java', lang_java)
hljs.registerLanguage('kotlin', lang_kotlin)
hljs.registerLanguage('scala', lang_scala)
hljs.registerLanguage('c', lang_c)
hljs.registerLanguage('cpp', lang_cpp)
hljs.registerLanguage('csharp', lang_csharp)
hljs.registerLanguage('objectivec', lang_objectivec)
hljs.registerLanguage('swift', lang_swift)
hljs.registerLanguage('ruby', lang_ruby)
hljs.registerLanguage('php', lang_php)
hljs.registerLanguage('lua', lang_lua)
hljs.registerLanguage('perl', lang_perl)
hljs.registerLanguage('r', lang_r)
hljs.registerLanguage('dockerfile', lang_dockerfile)
hljs.registerLanguage('makefile', lang_makefile)
hljs.registerLanguage('ini', lang_ini)
hljs.registerLanguage('diff', lang_diff)
hljs.registerLanguage('plaintext', lang_plaintext)
hljs.registerLanguage('graphql', lang_graphql)
hljs.registerLanguage('protobuf', lang_protobuf)
hljs.registerLanguage('nginx', lang_nginx)
hljs.registerLanguage('powershell', lang_powershell)
hljs.registerLanguage('haskell', lang_haskell)
hljs.registerLanguage('elixir', lang_elixir)
hljs.registerLanguage('dart', lang_dart)
hljs.registerLanguage('cmake', lang_cmake)
hljs.registerLanguage('groovy', lang_groovy)
hljs.registerLanguage('vim', lang_vim)
hljs.registerLanguage('latex', lang_latex)

/** File extension (or name) → highlight.js language. */
const BY_EXTENSION: Record<string, string> = {
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  py: 'python', pyi: 'python',
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'typescript',
  json: 'json', jsonc: 'json', jsonl: 'json',
  yml: 'yaml', yaml: 'yaml',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  css: 'css', scss: 'scss', less: 'less',
  html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', plist: 'xml',
  sql: 'sql', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala',
  c: 'c', h: 'c', cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', cs: 'csharp',
  m: 'objectivec', mm: 'objectivec', swift: 'swift', rb: 'ruby', php: 'php', lua: 'lua',
  pl: 'perl', pm: 'perl', r: 'r', ini: 'ini', toml: 'ini', cfg: 'ini', conf: 'ini',
  diff: 'diff', patch: 'diff', graphql: 'graphql', gql: 'graphql', proto: 'protobuf',
  ps1: 'powershell', psm1: 'powershell', hs: 'haskell', ex: 'elixir', exs: 'elixir',
  dart: 'dart', cmake: 'cmake', groovy: 'groovy', gradle: 'groovy', vim: 'vim', tex: 'latex',
}

const BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile', makefile: 'makefile', gnumakefile: 'makefile', 'cmakelists.txt': 'cmake',
  '.bashrc': 'bash', '.zshrc': 'bash', '.profile': 'bash', 'nginx.conf': 'nginx', '.vimrc': 'vim',
}

/** The language a file is highlighted as, or undefined to leave it plain. */
export function languageOf(path: string | undefined): string | undefined {
  if (path === undefined) return undefined
  const name = (path.split('/').pop() ?? '').toLowerCase()
  const byName = BY_NAME[name] ?? (name.startsWith('dockerfile') ? 'dockerfile' : undefined)
  if (byName !== undefined) return byName
  const dot = name.lastIndexOf('.')
  return dot < 0 ? undefined : BY_EXTENSION[name.slice(dot + 1)]
}

/** highlight.js scopes in pi's catppuccin mocha syntax colours. */
const SCOPES: Record<string, string> = {
  keyword: '#cba6f7', 'selector-tag': '#cba6f7', doctag: '#cba6f7', tag: '#cba6f7',
  built_in: '#89b4fa', title: '#89b4fa', 'title.function': '#89b4fa', section: '#89b4fa', name: '#89b4fa', function: '#89b4fa',
  'title.class': '#f9e2af', type: '#f9e2af', class: '#f9e2af', attr: '#f9e2af', attribute: '#f9e2af', 'selector-class': '#f9e2af',
  string: '#a6e3a1', char: '#a6e3a1', symbol: '#a6e3a1', 'template-tag': '#a6e3a1', addition: '#a6e3a1',
  regexp: '#f5c2e7', meta: '#f5c2e7', 'meta keyword': '#f5c2e7', link: '#f5c2e7',
  number: '#fab387', literal: '#fab387', 'selector-id': '#fab387',
  comment: '#7f849c', quote: '#7f849c',
  variable: '#94e2d5', 'template-variable': '#94e2d5', params: '#94e2d5', property: '#94e2d5', 'selector-attr': '#94e2d5',
  operator: '#89dceb', punctuation: '#9399b2',
  deletion: '#f38ba8', emphasis: '#f2cdcd', strong: '#f2cdcd', bullet: '#fab387',
}

/** `hljs-title function_` → the colour of its most specific known scope. */
function colourOf(classes: string): string | undefined {
  const names = classes.split(' ').map(c => c.replace(/^hljs-/, '').replace(/_+$/, ''))
  const scope = names.join('.')
  return SCOPES[scope] ?? names.map(n => SCOPES[n]).find(c => c !== undefined)
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'", '&#39;': "'" }
const unescape = (text: string) => text.replace(/&(amp|lt|gt|quot|#x27|#39);/g, m => ENTITIES[m] ?? m)

/** Highlighted code, cached: a box redraws often, and its text never changes. */
const cache = new Map<string, Span[][]>()
const CACHE_SIZE = 2000

/**
 * `code` highlighted as `language`, one span list per line, in `plain` where
 * no scope colours it. Unknown languages and errors give plain lines.
 */
export function highlightLines(code: string, language: string | undefined, plain: string): Span[][] {
  const lines = code.split('\n')
  if (language === undefined || hljs.getLanguage(language) === undefined) return lines.map(text => [{ text, color: plain }])
  const key = language + '\u0000' + plain + '\u0000' + code
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  let html: string
  try {
    html = hljs.highlight(code, { language, ignoreIllegals: true }).value
  } catch {
    return lines.map(text => [{ text, color: plain }])
  }
  const out: Span[][] = [[]]
  const stack: (string | undefined)[] = []
  const colour = () => stack.findLast(c => c !== undefined) ?? plain
  for (const m of html.matchAll(/<span class="([^"]+)">|<\/span>|[^<]+/g)) {
    if (m[1] !== undefined) stack.push(colourOf(m[1]))
    else if (m[0] === '</span>') stack.pop()
    else {
      const parts = unescape(m[0]).split('\n')
      parts.forEach((part, i) => {
        if (i > 0) out.push([])
        if (part !== '') out[out.length - 1]!.push({ text: part, color: colour() })
      })
    }
  }
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!)
  cache.set(key, out)
  return out
}

/**
 * `spans` with `bg` behind them, and `wordBg` behind the characters from
 * `start` to `end` (code units of the joined text): a tinted diff line with
 * its changed words deeper, its syntax colours kept.
 */
export function paint(spans: Span[], bg: string | undefined, range?: [number, number], wordBg?: string): Span[] {
  if (bg === undefined) return spans
  const out: Span[] = []
  let at = 0
  for (const span of spans) {
    const end = at + span.text.length
    const cuts = range === undefined || wordBg === undefined ? [] : [range[0], range[1]].filter(c => c > at && c < end)
    let from = 0
    for (const cut of [...cuts.map(c => c - at), span.text.length]) {
      const piece = span.text.slice(from, cut)
      if (piece !== '') {
        const mid = at + from
        const inWord = range !== undefined && wordBg !== undefined && mid >= range[0] && mid < range[1]
        out.push({ ...span, text: piece, bg: inWord ? wordBg : bg })
      }
      from = cut
    }
    at = end
  }
  return out
}

/** Commands that print a file as it is, so their output is that file's language. */
const PRINTS_FILE = new Set(['cat', 'bat', 'head', 'tail', 'sed', 'nl', 'less', 'more', 'tac'])

/**
 * The language a shell command's output is in, judged from the command: one
 * that prints files (`cat x.py`, `sed -n 40,140p $P/index.ts`) gives its
 * files' language when they all share one; `git diff`/`git show` gives diff.
 */
export function languageOfCommand(command: string): string | undefined {
  if (/\bgit\s+(diff|show|log\s+-p)\b/.test(command)) return 'diff'
  const found = new Set<string>()
  for (const part of command.split(/;|&&|\|\||\||\n/)) {
    const words = part.trim().split(/\s+/)
    if (!PRINTS_FILE.has(words[0] ?? '')) continue
    for (const word of words.slice(1)) {
      if (word.startsWith('-') || /^[\d,]+p?$/.test(word) || /^['"]/.test(word)) continue
      const language = languageOf(word.replace(/['"]/g, ''))
      if (language !== undefined) found.add(language)
    }
  }
  return found.size === 1 ? [...found][0] : undefined
}
