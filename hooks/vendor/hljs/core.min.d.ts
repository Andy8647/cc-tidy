// The part of highlight.js 11.11.1's API cc-tidy uses (vendored from @highlightjs/cdn-assets, BSD-3-Clause).
export type LanguageFn = (hljs: HLJSApi) => unknown
export interface HLJSApi {
  registerLanguage(name: string, language: LanguageFn): void
  getLanguage(name: string): unknown
  highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): { value: string }
}
declare const hljs: HLJSApi
export default hljs
