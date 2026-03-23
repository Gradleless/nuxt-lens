import type { BgMessage, NuxtDataReadyMsg, NuxtPageNavMsg } from '../lib/types'

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: BgMessage, sender) => {
    const tabId = sender.tab?.id
    if (tabId == null) return false

    if (msg.type === 'NUXT_DATA_DETECTED') {
      browser.action.setBadgeText({ text: '✓', tabId })
      browser.action.setBadgeBackgroundColor({ color: '#00DC82', tabId })
      const fwd: NuxtDataReadyMsg = { type: 'NUXT_DATA_READY', tabId }
      browser.runtime.sendMessage(fwd).catch(() => {})
    }

    if (msg.type === 'NUXT_PAGE_NAV') {
      browser.action.setBadgeText({ text: '', tabId })
      const fwd: NuxtPageNavMsg = { type: 'NUXT_PAGE_NAV', tabId }
      browser.runtime.sendMessage(fwd).catch(() => {})
    }

    return false
  })

  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      browser.action.setBadgeText({ text: '', tabId })
    }
  })
})
