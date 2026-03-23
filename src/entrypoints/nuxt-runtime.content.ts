export default defineContentScript({
  // Must run in MAIN world to access window.fetch and history — the default isolated
  // world cannot intercept page-level APIs.
  world: 'MAIN',
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    function notifyNav() {
      window.postMessage({ source: '__nuxt_scraper__', type: 'NUXT_NAV', url: location.href }, '*')
    }

    const origPush = history.pushState.bind(history)
    history.pushState = function (...args: Parameters<typeof history.pushState>) {
      origPush(...args)
      // Small delay so location.href reflects the new URL before the content script reads it
      setTimeout(notifyNav, 50)
    }

    const origReplace = history.replaceState.bind(history)
    history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
      origReplace(...args)
      setTimeout(notifyNav, 50)
    }

    window.addEventListener('popstate', () => setTimeout(notifyNav, 50))

    const origFetch = window.fetch
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const response = await origFetch.apply(this, args as Parameters<typeof fetch>)
      try {
        const url = args[0] instanceof Request ? args[0].url : String(args[0])
        if (url.includes('_payload.json')) {
          // Clone before reading — the original response body can only be consumed once
          const data = await response.clone().json()
          if (Array.isArray(data)) {
            window.postMessage({ source: '__nuxt_scraper__', type: 'NUXT_PAYLOAD', raw: data, url: location.href }, '*')
          }
        }
      } catch {}
      return response
    }
  },
})
