export interface TabNuxtData {
  raw: unknown[]
  url: string
  timestamp: number
}

export type BgMessage =
  | { type: 'NUXT_DATA_DETECTED'; url: string }
  | { type: 'NUXT_PAGE_NAV'; url: string }
  | { type: 'GET_NUXT_DATA' }

export interface NuxtDataReadyMsg {
  type: 'NUXT_DATA_READY'
  tabId: number
}

export interface NuxtPageNavMsg {
  type: 'NUXT_PAGE_NAV'
  tabId: number
}
