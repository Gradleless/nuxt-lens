<script lang="ts">
  import { onMount, setContext } from 'svelte'
  import { createExtractor } from 'nuxt-data-parser'
  import TreeNode from '../../lib/TreeNode.svelte'
  import ExportPanel from '../../lib/ExportPanel.svelte'
  import TableView from '../../lib/TableView.svelte'
  import { t } from '../../lib/i18n'

  type Tab = 'explorer' | 'export' | 'stores' | 'tags' | 'endpoints'
  type ExplorerView = 'tree' | 'table' | 'raw'
  type EndpointKind = 'api' | 'image' | 'document' | 'external' | 'page' | 'other'

  interface Endpoint {
    url: string
    kind: EndpointKind
  }

  const KIND_LABEL: Record<EndpointKind, string> = {
    api: t('kind_api'),
    image: t('kind_image'),
    document: t('kind_document'),
    external: t('kind_external'),
    page: t('kind_page'),
    other: t('kind_other'),
  }

  const KIND_ORDER: EndpointKind[] = ['api', 'page', 'external', 'image', 'document', 'other']

  function categorize(url: string): EndpointKind {
    const lower = url.toLowerCase().split('?')[0]
    if (/\.(webp|png|jpg|jpeg|gif|svg|ico|avif|bmp|tiff)$/.test(lower)) return 'image'
    if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|csv|zip|tar|gz)$/.test(lower)) return 'document'
    if (url.startsWith('http')) return 'external'
    if (/^\/api\/|^\/api$/.test(lower) || lower.includes('/api/')) return 'api'
    if (url.startsWith('/') && !lower.split('/').pop()?.includes('.')) return 'page'
    return 'other'
  }

  let loading = $state(true)
  let detected = $state(false)
  let activeTab = $state<Tab>('explorer')
  let explorerView = $state<ExplorerView>('tree')
  let copied = $state(false)
  let copiedKey = $state('')

  function copyEndpoint(key: string, text: string) {
    navigator.clipboard.writeText(text)
    copiedKey = key
    setTimeout(() => (copiedKey = ''), 1500)
  }

  const INTERNAL_TAGS = new Set([
    'ShallowReactive', 'Reactive', 'Ref', 'EmptyRef',
    'Date', 'Set', 'Map', 'payload-urls',
    'NuxtError', 'AsyncData', 'NavigationFailure',
    'RegExp', 'BigInt', 'URL', 'URLSearchParams',
    'ArrayBuffer', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
    'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
    'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  ])

  let raw = $state<unknown[]>([])
  let resolved = $state<unknown[]>([])
  let tags = $state<string[]>([])
  let tagValues = $state<Record<string, unknown[]>>({})
  let stores = $state<Record<string, Record<string, unknown>>>({})
  let endpointsByKind = $state<Partial<Record<EndpointKind, Endpoint[]>>>({})
  let pageUrl = $state('')

  let searchQuery = $state('')
  let showSearch = $state(false)

  interface LeafNode {
    path: string
    value: string
    type: string
  }

  function flattenLeaves(val: unknown, path: string, depth: number, results: LeafNode[]) {
    if (depth > 8 || results.length > 500) return
    if (
      val === null ||
      val === undefined ||
      typeof val === 'string' ||
      typeof val === 'number' ||
      typeof val === 'boolean' ||
      val instanceof Date
    ) {
      results.push({ path: path || '$', value: String(val), type: typeof val })
      return
    }
    if (Array.isArray(val)) {
      val.forEach((v, i) => flattenLeaves(v, `${path}[${i}]`, depth + 1, results))
    } else if (val instanceof Set) {
      ;[...(val as Set<unknown>)].forEach((v, i) =>
        flattenLeaves(v, `${path}[${i}]`, depth + 1, results),
      )
    } else if (val instanceof Map) {
      for (const [k, v] of (val as Map<unknown, unknown>).entries()) {
        flattenLeaves(v, `${path}.${k}`, depth + 1, results)
      }
    } else if (typeof val === 'object') {
      for (const [k, v] of Object.entries(val as object)) {
        flattenLeaves(v, path ? `${path}.${k}` : k, depth + 1, results)
      }
    }
  }

  const flatLeaves = $derived.by(() => {
    const results: LeafNode[] = []
    if (resolved[0]) flattenLeaves(resolved[0], '', 0, results)
    return results
  })

  const searchResults = $derived.by(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.toLowerCase()
    return flatLeaves.filter((r) => r.path.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)).slice(0, 100)
  })

  let selectedPath = $state('')
  // Passes callback down to all nested TreeNode instances without prop-drilling
  setContext('onLeafClick', (path: string) => {
    selectedPath = path
  })

  let storeSnapshot = $state<string | null>(null)
  let snapshotSaved = $state(false)
  // storage.session is unreliable in WXT dev mode, so local storage is used instead
  const SNAPSHOT_KEY = 'nuxt_scraper_store_snapshot'

  type StoreStatus = 'same' | 'changed' | 'new'

  interface KeyDiff {
    key: string
    status: 'added' | 'removed' | 'changed'
    oldStr: string
    newStr: string
  }

  function diffStore(
    prev: Record<string, unknown>,
    curr: Record<string, unknown>,
  ): KeyDiff[] {
    const diffs: KeyDiff[] = []
    const keys = new Set([...Object.keys(prev), ...Object.keys(curr)])
    for (const key of keys) {
      const oldStr = key in prev ? JSON.stringify(prev[key]) : ''
      const newStr = key in curr ? JSON.stringify(curr[key]) : ''
      if (!(key in prev)) diffs.push({ key, status: 'added', oldStr: '', newStr })
      else if (!(key in curr)) diffs.push({ key, status: 'removed', oldStr, newStr: '' })
      else if (oldStr !== newStr) diffs.push({ key, status: 'changed', oldStr, newStr })
    }
    return diffs
  }

  const storeEntries = $derived(Object.entries(stores))

  const storeStatuses = $derived.by<StoreStatus[]>(() => {
    if (!storeSnapshot) return storeEntries.map(() => 'same')
    let prev: Record<string, Record<string, unknown>>
    try { prev = JSON.parse(storeSnapshot) } catch { return storeEntries.map(() => 'same') }
    return storeEntries.map(([id, store]) => {
      if (!(id in prev)) return 'new'
      return JSON.stringify(store) !== JSON.stringify(prev[id]) ? 'changed' : 'same'
    })
  })

  const diffsByStore = $derived.by<(KeyDiff[] | null)[]>(() => {
    if (!storeSnapshot) return storeEntries.map(() => null)
    let prev: Record<string, Record<string, unknown>>
    try { prev = JSON.parse(storeSnapshot) } catch { return storeEntries.map(() => null) }
    return storeEntries.map(([id, store], i) => {
      if (!(id in prev) || storeStatuses[i] !== 'changed') return null
      const diffs = diffStore(prev[id], store)
      return diffs.length > 0 ? diffs : null
    })
  })

  async function saveSnapshot() {
    const data = JSON.stringify(stores)
    await browser.storage.local.set({ [SNAPSHOT_KEY]: data }).catch(() => {})
    storeSnapshot = data
    snapshotSaved = true
    setTimeout(() => (snapshotSaved = false), 1500)
  }

  async function clearSnapshot() {
    await browser.storage.local.remove(SNAPSHOT_KEY).catch(() => {})
    storeSnapshot = null
  }

  async function fetchData(tabId: number) {
    const ssrData: { raw: unknown[]; url: string } | null = await browser.tabs
      .sendMessage(tabId, { type: 'GET_NUXT_DATA' })
      .catch(() => null)

    const hasSSR = ssrData && Array.isArray(ssrData.raw) && ssrData.raw.length > 0

    if (!hasSSR) {
      loading = false
      return
    }

    detected = true

    raw = ssrData!.raw
    pageUrl = ssrData!.url
    const extractor = createExtractor(raw)
    resolved = extractor.resolveAll()
    const inspected = extractor.inspect()
    tags = inspected.tags
    tagValues = Object.fromEntries(inspected.tags.map(t => [t, extractor.findAllByType(t)]))
    stores = extractor.getPiniaStores()

    // Nuxt stores prefetched API keys under root.data — collect them first so they
    // are always categorized as API regardless of what categorize() would infer
    const root = resolved[0]
    const nuxtDataKeys = new Set<string>()
    if (root && typeof root === 'object' && !Array.isArray(root)) {
      const rootData = (root as Record<string, unknown>).data
      if (rootData && typeof rootData === 'object' && !Array.isArray(rootData)) {
        for (const key of Object.keys(rootData as object)) {
          if (key.startsWith('/') || key.startsWith('http')) nuxtDataKeys.add(key.trim())
        }
      }
    }

    const found = new Set<string>(nuxtDataKeys)
    function scanUrls(val: unknown, depth = 0) {
      if (depth > 8) return
      if (typeof val === 'string') {
        if ((val.startsWith('/') && val.length > 1 && !val.includes(' ')) || val.startsWith('http'))
          found.add(val.trim())
      } else if (Array.isArray(val)) {
        val.forEach((v) => scanUrls(v, depth + 1))
      } else if (
        val &&
        typeof val === 'object' &&
        !(val instanceof Date) &&
        !(val instanceof Set) &&
        !(val instanceof Map)
      ) {
        Object.values(val as object).forEach((v) => scanUrls(v, depth + 1))
      }
    }
    scanUrls(resolved)

    const grouped: Partial<Record<EndpointKind, Endpoint[]>> = {}
    for (const url of found) {
      // Keys from root.data are always API even if their path pattern looks like a page route
      const kind = nuxtDataKeys.has(url) ? 'api' : categorize(url)
      ;(grouped[kind] ??= []).push({ url, kind })
    }
    endpointsByKind = grouped

    const snap = await browser.storage.local.get(SNAPSHOT_KEY).catch(() => ({}))
    storeSnapshot = (snap as Record<string, string>)[SNAPSHOT_KEY] ?? null

    loading = false
  }

  onMount(() => {
    let activeTabId: number | undefined

    function resetState() {
      loading = true
      detected = false
      selectedPath = ''
      raw = []
      resolved = []
      tags = []
      tagValues = {}
      stores = {}
      endpointsByKind = {}
      pageUrl = ''
    }

    browser.tabs.query({ active: true, currentWindow: true }).then(async (tabs) => {
      const tab = tabs[0]
      activeTabId = tab?.id
      if (!activeTabId) { loading = false; return }
      await fetchData(activeTabId)
    })

    function onTabUpdated(tabId: number, info: { status?: string }) {
      if (tabId !== activeTabId) return
      if (info.status === 'loading') resetState()
      // Fallback for pages that never emit NUXT_DATA_READY (no __NUXT_DATA__ element):
      // wait for the content script to have injected before giving up
      if (info.status === 'complete') {
        setTimeout(() => { if (loading && activeTabId) fetchData(activeTabId) }, 600)
      }
    }

    function onMessage(msg: { type?: string; tabId?: number }) {
      if (msg.tabId !== activeTabId) return
      if (msg.type === 'NUXT_DATA_READY') {
        if (activeTabId) fetchData(activeTabId)
      } else if (msg.type === 'NUXT_PAGE_NAV') {
        resetState()
      }
    }

    browser.tabs.onUpdated.addListener(onTabUpdated)
    browser.runtime.onMessage.addListener(onMessage)

    return () => {
      browser.tabs.onUpdated.removeListener(onTabUpdated)
      browser.runtime.onMessage.removeListener(onMessage)
    }
  })

  function copyJSON() {
    const seen = new WeakSet()
    const json = JSON.stringify(
      resolved,
      (_, v) => {
        if (v instanceof Set) return { __type: 'Set', values: [...v] }
        if (v instanceof Map) return { __type: 'Map', entries: [...v.entries()] }
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]'
          seen.add(v)
        }
        return v
      },
      2,
    )
    navigator.clipboard.writeText(json)
    copied = true
    setTimeout(() => (copied = false), 1500)
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'explorer', label: t('tab_explorer') },
    { id: 'export', label: t('tab_export') },
    { id: 'stores', label: t('tab_stores') },
    { id: 'tags', label: t('tab_tags') },
    { id: 'endpoints', label: t('tab_endpoints') },
  ]

  let showInternalTags = $state(false)
  let expandedTags = $state<Set<string>>(new Set())

  const visibleTags = $derived(
    showInternalTags ? tags : tags.filter(t => !INTERNAL_TAGS.has(t))
  )

  function toggleTag(tag: string) {
    const next = new Set(expandedTags)
    if (next.has(tag)) next.delete(tag)
    else next.add(tag)
    expandedTags = next
  }
</script>

<div class="flex h-[640px] w-[520px] flex-col overflow-hidden bg-[#0f0f0f] text-zinc-100">
  <div class="flex shrink-0 items-center gap-2.5 border-b border-zinc-800/80 px-4 py-3">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L2 20h20L12 2z" fill="#00DC82" fill-opacity="0.15" stroke="#00DC82" stroke-width="1.5" stroke-linejoin="round"/>
      <path d="M9 17l3-6 3 6" stroke="#00DC82" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span class="text-sm font-semibold tracking-tight text-zinc-100">{t('extensionName')}</span>

    {#if !loading}
      {#if detected}
        <span class="ml-auto rounded-full border border-[#00DC82]/25 bg-[#00DC82]/10 px-2 py-0.5 text-[11px] font-medium text-[#00DC82]">
          {t('status_detected')}
        </span>
      {:else}
        <span class="ml-auto rounded-full border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-[11px] text-zinc-500">
          {t('status_not_detected')}
        </span>
      {/if}
    {/if}
  </div>

  {#if loading}
    <div class="flex flex-1 items-center justify-center">
      <div class="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-[#00DC82]"></div>
    </div>

  {:else if !detected}
    <div class="flex flex-1 flex-col items-center justify-center gap-3 text-zinc-600">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.5"/>
        <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M11 8v3m0 3h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <p class="text-sm">{t('no_data_found')}</p>
    </div>

  {:else}
    <div class="flex shrink-0 items-center border-b border-zinc-800/80">
      {#each TABS as tab}
        <button
          class="relative px-3 py-2.5 text-xs font-medium transition-colors
            {activeTab === tab.id ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}"
          onclick={() => { activeTab = tab.id; selectedPath = '' }}
        >
          {tab.label}
          {#if activeTab === tab.id}
            <span class="absolute inset-x-0 bottom-0 h-px bg-[#00DC82]"></span>
          {/if}
        </button>
      {/each}

      <div class="ml-auto flex items-center gap-1 pr-2">
        <button
          class="rounded px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:text-[#00DC82]"
          onclick={copyJSON}
        >
          {copied ? '✓' : t('action_copy_json')}
        </button>
      </div>
    </div>

    {#if activeTab === 'explorer'}
      <div class="flex shrink-0 items-center gap-2 border-b border-zinc-800/50 px-3 py-1.5">
        <div class="flex overflow-hidden rounded border border-zinc-800/60 text-[10px]">
          {#each (['tree', 'table', 'raw'] as ExplorerView[]) as view}
            <button
              class="px-2.5 py-1 transition-colors
                {explorerView === view ? 'bg-zinc-800 text-zinc-300' : 'text-zinc-600 hover:text-zinc-400'}"
              onclick={() => { explorerView = view; showSearch = false; searchQuery = '' }}
            >{view}</button>
          {/each}
        </div>
        {#if showSearch}
          <div class="flex flex-1 items-center gap-1.5">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="shrink-0 text-zinc-600">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35" stroke-linecap="round"/>
            </svg>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              type="text"
              placeholder={t('search_placeholder')}
              class="flex-1 bg-transparent text-[11px] text-zinc-300 outline-none placeholder:text-zinc-700"
              bind:value={searchQuery}
              autofocus
            />
            {#if searchQuery}
              <span class="shrink-0 text-[10px] text-zinc-700">{searchResults.length}</span>
              <button class="shrink-0 text-zinc-600 hover:text-zinc-400 text-[10px]" onclick={() => (searchQuery = '')}>✕</button>
            {/if}
          </div>
        {:else}
          <button
            class="ml-auto rounded p-1 transition-colors text-zinc-600 hover:text-zinc-300"
            onclick={() => { showSearch = true }}
            title="Search keys & values"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <path d="M21 21l-4.35-4.35" stroke-linecap="round"/>
            </svg>
          </button>
        {/if}
        {#if showSearch && !searchQuery}
          <button class="text-[10px] text-zinc-700 hover:text-zinc-500" onclick={() => { showSearch = false }}>✕</button>
        {/if}
      </div>
    {/if}


    <div class="flex-1 overflow-x-hidden overflow-y-auto p-3">

      {#if activeTab === 'explorer'}
        {#if showSearch && searchQuery.trim()}
          {#if searchResults.length === 0}
            <p class="py-8 text-center text-xs text-zinc-600">{t('search_no_results', searchQuery)}</p>
          {:else}
            <div class="flex flex-col gap-1">
              {#each searchResults as result}
                <div class="group flex items-start gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/30 px-3 py-1.5">
                  <div class="min-w-0 flex-1">
                    <p class="mb-0.5 truncate font-mono text-[10px] text-zinc-600">{result.path}</p>
                    <p class="break-all font-mono text-[11px]
                      {result.type === 'string' ? 'text-emerald-400' : result.type === 'number' ? 'text-orange-400' : result.type === 'boolean' ? 'text-purple-400' : 'text-zinc-400'}">
                      {result.value}
                    </p>
                  </div>
                  <button
                    class="mt-0.5 shrink-0 text-[10px] text-zinc-700 opacity-0 transition-opacity hover:text-zinc-400 group-hover:opacity-100"
                    onclick={() => navigator.clipboard.writeText(result.path)}
                  >{t('action_copy_path')}</button>
                </div>
              {/each}
            </div>
          {/if}
        {:else if explorerView === 'tree'}
          <div class="overflow-x-hidden">
            <TreeNode value={resolved[0]} depth={0} pathArr={[]} />
          </div>
        {:else if explorerView === 'table'}
          <TableView {resolved} />
        {:else}
          <pre class="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-zinc-400">{JSON.stringify(raw, null, 2)}</pre>
        {/if}

      {:else if activeTab === 'export'}
        <ExportPanel {resolved} {tags} {pageUrl} />

      {:else if activeTab === 'stores'}
        {#if storeEntries.length === 0}
          <p class="py-8 text-center text-xs text-zinc-600">{t('stores_empty')}</p>
        {:else}
          <div class="mb-3 flex items-center gap-2">
            <p class="text-[11px] text-zinc-600">
              {storeEntries.length === 1 ? t('stores_detected_one') : t('stores_detected_other', String(storeEntries.length))}
            </p>
            <div class="ml-auto flex gap-1">
              {#if storeSnapshot}
                <button
                  class="rounded px-2 py-1 text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
                  onclick={clearSnapshot}
                >{t('action_clear')}</button>
              {/if}
              <button
                class="rounded border border-zinc-800 px-2 py-1 text-[10px] text-zinc-400 transition-colors hover:border-[#00DC82]/30 hover:text-[#00DC82]"
                onclick={saveSnapshot}
              >
                {snapshotSaved ? t('action_saved') : t('action_save_snapshot')}
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            {#each storeEntries as [storeId, store], i}
              <div class="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50">
                <div class="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
                  <span class="text-[11px] font-medium text-zinc-400">Store #{i + 1}</span>
                  <span class="rounded bg-[#00DC82]/10 px-1.5 py-0.5 text-[10px] text-[#00DC82]">{storeId}</span>
                  {#if storeSnapshot}
                    {#if storeStatuses[i] === 'changed'}
                      <span class="ml-auto rounded bg-yellow-500/15 px-1.5 py-0.5 text-[10px] text-yellow-400">{t('store_status_changed')}</span>
                    {:else if storeStatuses[i] === 'new'}
                      <span class="ml-auto rounded bg-[#00DC82]/15 px-1.5 py-0.5 text-[10px] text-[#00DC82]">{t('store_status_new')}</span>
                    {:else}
                      <span class="ml-auto rounded bg-zinc-800/60 px-1.5 py-0.5 text-[10px] text-zinc-600">{t('store_status_unchanged')}</span>
                    {/if}
                  {/if}
                </div>
                <div class="overflow-x-hidden p-3">
                  <TreeNode value={store} depth={0} startCollapsed={true} pathArr={[storeId]} />
                </div>

                {#if diffsByStore[i]?.length}
                  <div class="border-t border-zinc-800/60 px-3 py-2">
                    <p class="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                      {diffsByStore[i]!.length === 1 ? t('store_changes_one') : t('store_changes_other', String(diffsByStore[i]!.length))}
                    </p>
                    <div class="flex flex-col gap-1">
                      {#each diffsByStore[i]! as d}
                        <div class="grid grid-cols-[auto_1fr] items-start gap-x-2 font-mono text-[10px]">
                          <span class="shrink-0 text-zinc-500">{d.key}</span>
                          {#if d.status === 'added'}
                            <span class="truncate text-[#00DC82]">+ {d.newStr}</span>
                          {:else if d.status === 'removed'}
                            <span class="truncate text-red-400 line-through">{d.oldStr}</span>
                          {:else}
                            <span class="truncate">
                              <span class="text-red-400/70 line-through">{d.oldStr.slice(0, 40)}</span>
                              <span class="mx-1 text-zinc-700">→</span>
                              <span class="text-yellow-400">{d.newStr.slice(0, 40)}</span>
                            </span>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

      {:else if activeTab === 'tags'}
        <div class="mb-3 flex items-center gap-2">
          <p class="text-[11px] text-zinc-600">
            {visibleTags.length === 1 ? t('tags_count_one') : t('tags_count_other', String(visibleTags.length))}
            {#if !showInternalTags && tags.length !== visibleTags.length}
              <span class="text-zinc-700">{t('tags_hidden', String(tags.length - visibleTags.length))}</span>
            {/if}
          </p>
          <button
            class="ml-auto rounded border border-zinc-800 px-2 py-1 text-[10px] transition-colors
              {showInternalTags ? 'border-[#00DC82]/30 text-[#00DC82]' : 'text-zinc-500 hover:text-zinc-300'}"
            onclick={() => (showInternalTags = !showInternalTags)}
          >
            {showInternalTags ? t('tags_hide_internal') : t('tags_show_internal')}
          </button>
        </div>

        {#if visibleTags.length === 0}
          <p class="py-8 text-center text-xs text-zinc-600">{t('tags_empty')}</p>
        {:else}
          <div class="flex flex-col gap-2">
            {#each visibleTags as tag}
              {@const items = tagValues[tag] ?? []}
              {@const isInternal = INTERNAL_TAGS.has(tag)}
              {@const isOpen = expandedTags.has(tag)}
              <div class="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/50">
                <button
                  class="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-800/40"
                  onclick={() => toggleTag(tag)}
                >
                  <svg
                    width="10" height="10" viewBox="0 0 10 10" fill="none"
                    class="shrink-0 text-zinc-600 transition-transform {isOpen ? 'rotate-90' : ''}"
                  >
                    <path d="M3 2l4 3-4 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  <span class="flex-1 font-mono text-[11px] font-medium {isInternal ? 'text-zinc-600' : 'text-zinc-200'}">{tag}</span>
                  <span class="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{items.length}</span>
                  {#if isInternal}
                    <span class="shrink-0 text-[9px] text-zinc-700 uppercase tracking-wider">{t('tag_internal_label')}</span>
                  {/if}
                </button>

                {#if isOpen}
                  <div class="border-t border-zinc-800/60 p-3">
                    {#if items.length === 0}
                      <p class="text-[11px] text-zinc-600">{t('tag_no_values')}</p>
                    {:else if items.length === 1}
                      <TreeNode value={items[0]} depth={0} startCollapsed={false} pathArr={[tag]} />
                    {:else}
                      <div class="flex flex-col gap-2">
                        {#each items as item, i}
                          <div class="rounded border border-zinc-800/60 bg-zinc-950/40 p-2">
                            <p class="mb-1 text-[9px] uppercase tracking-wider text-zinc-700">#{i + 1}</p>
                            <TreeNode value={item} depth={0} startCollapsed={true} pathArr={[tag, String(i)]} />
                          </div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

      {:else if activeTab === 'endpoints'}
        {#if Object.keys(endpointsByKind).length === 0}
          <p class="py-8 text-center text-xs text-zinc-600">{t('endpoints_empty')}</p>
        {:else}
          <div class="flex flex-col gap-4">
            {#each KIND_ORDER as kind}
              {#if endpointsByKind[kind]?.length}
                <div>
                  <p class="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
                    {KIND_LABEL[kind]}
                    <span class="ml-1 text-zinc-700">({endpointsByKind[kind]!.length})</span>
                  </p>
                  <div class="flex flex-col gap-1">
                    {#each endpointsByKind[kind]! as ep}
                      <div class="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-3 py-2">
                        <span class="min-w-0 flex-1 break-all font-mono text-[11px] text-zinc-300">{ep.url}</span>
                        <div class="flex shrink-0 gap-1">
                          <button
                            class="rounded px-2 py-0.5 text-[10px] transition-colors hover:bg-zinc-800
                              {copiedKey === `url:${ep.url}` ? 'text-[#00DC82]' : 'text-zinc-600 hover:text-zinc-300'}"
                            onclick={() => copyEndpoint(`url:${ep.url}`, ep.url)}
                          >{copiedKey === `url:${ep.url}` ? '✓' : t('action_copy')}</button>
                          <button
                            class="rounded px-2 py-0.5 text-[10px] transition-colors hover:bg-zinc-800
                              {copiedKey === `curl:${ep.url}` ? 'text-[#00DC82]' : 'text-zinc-600 hover:text-zinc-300'}"
                            onclick={() => copyEndpoint(`curl:${ep.url}`, `curl -s '${ep.url}'`)}
                            title="Copy as cURL"
                          >{copiedKey === `curl:${ep.url}` ? '✓' : 'curl'}</button>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      {/if}

    </div>

    <div class="shrink-0 border-t border-zinc-800/80 px-4 py-2">
      {#if selectedPath && activeTab === 'explorer'}
        <div class="flex items-center gap-2">
          <span class="flex-1 truncate font-mono text-[10px] text-zinc-400" title={selectedPath}>{selectedPath}</span>
          <button
            class="shrink-0 text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
            onclick={() => navigator.clipboard.writeText(selectedPath)}
          >{t('action_copy')}</button>
          <button
            class="shrink-0 text-[10px] text-zinc-700 hover:text-zinc-500"
            onclick={() => (selectedPath = '')}
          >✕</button>
        </div>
      {:else}
        <p class="truncate text-[10px] text-zinc-700" title={pageUrl}>{pageUrl}</p>
      {/if}
    </div>
  {/if}
</div>
