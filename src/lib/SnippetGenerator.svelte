<script lang="ts">
  import CodeBlock from './CodeBlock.svelte'

  let {
    pageUrl,
    tags,
    stores: _stores,
  }: { pageUrl: string; tags: string[]; stores: Record<string, unknown>[] } = $props()

  type SnippetId = 'basic' | 'resolveAll' | 'findType' | 'pinia' | 'inspect'
  type Lang = 'ts' | 'js'

  const SNIPPETS: { id: SnippetId; label: string }[] = [
    { id: 'basic', label: 'Basic' },
    { id: 'resolveAll', label: 'Resolve all' },
    { id: 'findType', label: 'Find by type' },
    { id: 'pinia', label: 'Pinia store' },
    { id: 'inspect', label: 'Inspect' },
  ]

  let snippetId = $state<SnippetId>('basic')
  let lang = $state<Lang>('ts')
  let selectedTag = $state('')
  let copied = $state(false)

  $effect(() => {
    if (!selectedTag && tags.length > 0) selectedTag = tags[0]
  })

  const imp = $derived(
    lang === 'ts'
      ? `import { extractFromUrl } from 'nuxt-data-parser'`
      : `const { extractFromUrl } = require('nuxt-data-parser')`,
  )

  const generated = $derived.by(() => {
    const url = pageUrl || 'https://example.com'

    if (snippetId === 'basic') {
      return `${imp}

const extractor = await extractFromUrl('${url}')
const root = extractor.resolveAll()[0]
console.log(root)`
    }

    if (snippetId === 'resolveAll') {
      return `${imp}

const extractor = await extractFromUrl('${url}')
const all = extractor.resolveAll()

// all[0] is the root object — explore from there
console.log(JSON.stringify(all[0], null, 2))`
    }

    if (snippetId === 'findType') {
      const tag = selectedTag || 'MyType'
      return `${imp}

const extractor = await extractFromUrl('${url}')

// First occurrence, typed
const item = extractor.findByType${lang === 'ts' ? `<${tag}>` : ''}('${tag}')

// All occurrences
const items = extractor.findAllByType${lang === 'ts' ? `<${tag}>` : ''}('${tag}')
console.log(items)`
    }

    if (snippetId === 'pinia') {
      return `${imp}

const extractor = await extractFromUrl('${url}')
const { stores } = extractor.inspect()

// All candidate Pinia stores
console.log(stores)

// Or find a specific store by duck-typing its keys:
// const store = extractor.getPiniaStore(['key1', 'key2'])`
    }

    if (snippetId === 'inspect') {
      return `${imp}

const extractor = await extractFromUrl('${url}')
const { tags, stores } = extractor.inspect()

// tags  → all custom type names found in the payload
// stores → resolved objects with many keys (likely Pinia stores)
console.log('types:', tags)
console.log('stores:', stores.length)`
    }

    return ''
  })

  function copy() {
    navigator.clipboard.writeText(generated)
    copied = true
    setTimeout(() => (copied = false), 1500)
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap gap-1">
    {#each SNIPPETS as s}
      <button
        class="rounded px-2.5 py-1 text-[11px] font-medium transition-colors
          {snippetId === s.id ? 'bg-[#00DC82]/15 text-[#00DC82]' : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => (snippetId = s.id)}
      >
        {s.label}
      </button>
    {/each}
  </div>

  <div class="flex items-center gap-2">
    <div class="flex overflow-hidden rounded border border-zinc-800 text-[11px]">
      <button
        class="px-2.5 py-1 transition-colors {lang === 'ts'
          ? 'bg-zinc-800 text-zinc-200'
          : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => (lang = 'ts')}
      >TS</button>
      <button
        class="px-2.5 py-1 transition-colors {lang === 'js'
          ? 'bg-zinc-800 text-zinc-200'
          : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => (lang = 'js')}
      >JS</button>
    </div>

    {#if snippetId === 'findType' && tags.length > 0}
      <select
        class="flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 outline-none"
        bind:value={selectedTag}
      >
        {#each tags as tag}
          <option value={tag}>{tag}</option>
        {/each}
      </select>
    {/if}

    <button
      class="ml-auto rounded px-2.5 py-1 text-[11px] text-zinc-500 transition-colors hover:text-[#00DC82]"
      onclick={copy}
    >
      {copied ? '✓ copied' : 'Copy'}
    </button>
  </div>

  <CodeBlock code={generated} lang="typescript" maxHeight="340px" />

  <p class="text-[10px] text-zinc-700">
    Requires <span class="font-mono text-zinc-600">nuxt-data-parser</span> — Node.js / Bun / Deno
    (not browser).
  </p>
</div>
