/** How often something live (a running call or job) is redrawn: a count a second. */
export type Tick = number

declare module 'claude-code' {
  interface PluginState {
    'cc-tidy': { tick: Tick; thinkTick: Tick }
  }
}
