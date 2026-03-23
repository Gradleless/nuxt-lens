export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    let spaPayload: { raw: unknown[]; url: string } | null = null

    window.addEventListener('message', (event) => {
      if (event.source !== window || event.data?.source !== '__nuxt_scraper__') return

      if (event.data.type === 'NUXT_NAV') {
        browser.runtime.sendMessage({ type: 'NUXT_PAGE_NAV', url: event.data.url as string }).catch(() => {})

      } else if (event.data.type === 'NUXT_PAYLOAD') {
        spaPayload = { raw: event.data.raw as unknown[], url: event.data.url as string }
        browser.runtime.sendMessage({ type: 'NUXT_DATA_DETECTED', url: event.data.url as string }).catch(() => {})
      }
    })

    function notify() {
      browser.runtime.sendMessage({ type: 'NUXT_DATA_DETECTED', url: location.href }).catch(() => {})
    }

    function tryDetect(): boolean {
      const el = document.getElementById('__NUXT_DATA__')
      if (!el?.textContent?.trim()) return false
      let data: unknown[]
      try { data = JSON.parse(el.textContent) } catch { return false }
      if (!Array.isArray(data) || !data.length) return false
      notify()
      return true
    }

    tryDetect()

    // Two separate observers are needed: one watches the element's content if it already
    // exists (SSR may update it after hydration), the other watches document.head for
    // the element being injected late (SPA soft-navigation).
    const existingEl = document.getElementById('__NUXT_DATA__')
    if (existingEl) {
      new MutationObserver(tryDetect).observe(existingEl, { characterData: true, childList: true, subtree: true })
    }

    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof Element && node.id === '__NUXT_DATA__') {
            tryDetect()
            new MutationObserver(tryDetect).observe(node, { characterData: true, childList: true, subtree: true })
          }
        }
      }
    }).observe(document.head ?? document.documentElement, { childList: true })

    browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type !== 'GET_NUXT_DATA') return false

      if (spaPayload?.url === location.href) {
        sendResponse({ raw: spaPayload.raw, url: location.href })
        return false
      }

      const el = document.getElementById('__NUXT_DATA__')
      if (!el?.textContent?.trim()) { sendResponse(null); return false }
      try {
        sendResponse({ raw: JSON.parse(el.textContent), url: location.href })
      } catch {
        sendResponse(null)
      }
      return false
    })
  },
})
