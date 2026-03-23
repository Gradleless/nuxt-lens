<script lang="ts">
  import { quicktype, InputData, jsonInputForTargetLanguage } from 'quicktype-core'
  import CodeBlock from './CodeBlock.svelte'

  let {
    resolved,
    tags,
    pageUrl,
  }: { resolved: unknown[]; tags: string[]; pageUrl: string } = $props()

  const INTERNAL_TAGS = new Set([
    'ShallowReactive', 'Reactive', 'Ref', 'EmptyRef',
    'Date', 'Set', 'Map', 'payload-urls',
    'NuxtError', 'AsyncData', 'NavigationFailure',
    'RegExp', 'BigInt', 'URL', 'URLSearchParams',
    'ArrayBuffer', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray',
    'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array',
    'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  ])

  let showInternalTags = $state(false)
  const activeTags = $derived(showInternalTags ? tags : tags.filter(t => !INTERNAL_TAGS.has(t)))

  type Mode = 'script' | 'types' | 'json'
  type Lang = 'typescript' | 'python' | 'golang' | 'rust' | 'csharp' | 'java' | 'swift' | 'kotlin'

  const LANGS: { id: Lang; label: string; hljs: string }[] = [
    { id: 'typescript', label: 'TypeScript', hljs: 'typescript' },
    { id: 'python', label: 'Python', hljs: 'python' },
    { id: 'golang', label: 'Go', hljs: 'go' },
    { id: 'rust', label: 'Rust', hljs: 'rust' },
    { id: 'csharp', label: 'C#', hljs: 'csharp' },
    { id: 'java', label: 'Java', hljs: 'java' },
    { id: 'swift', label: 'Swift', hljs: 'swift' },
    { id: 'kotlin', label: 'Kotlin', hljs: 'kotlin' },
  ]

  let mode = $state<Mode>('script')
  let typesLang = $state<Lang>('typescript')
  let generating = $state(false)
  let generated = $state('')
  let copied = $state(false)

  // Monotonic counter — each async generation increments it; a result is discarded if gen
  // has moved on, preventing a slow earlier run from overwriting a faster newer one
  let gen = 0

  function serialize(val: unknown): string {
    const seen = new WeakSet()
    return JSON.stringify(
      val,
      (_, v) => {
        if (v instanceof Set) return [...v]
        if (v instanceof Map) return Object.fromEntries(v)
        if (v instanceof Date) return v.toISOString()
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return null
          seen.add(v)
        }
        return v
      },
      2,
    )
  }

  async function runQuicktype(lang: Lang, justTypes: boolean): Promise<string> {
    const jsonStr = serialize(resolved[0])
    const jsonInput = jsonInputForTargetLanguage(lang)
    await jsonInput.addSource({ name: 'Root', samples: [jsonStr] })
    const inputData = new InputData()
    inputData.addInput(jsonInput)
    const opts: Record<string, string> = {}
    if (justTypes && lang === 'typescript') opts['just-types'] = 'true'
    if (lang === 'rust') opts['derive-debug'] = 'true'
    const { lines } = await quicktype({ inputData, lang, rendererOptions: opts })
    return lines.join('\n')
  }

  function pluralize(s: string): string {
    if (s.endsWith('y') && !/[aeiou]y$/i.test(s)) return s.slice(0, -1) + 'ies'
    if (/[sxz]$/.test(s) || /[cs]h$/.test(s)) return s + 'es'
    return s + 's'
  }
  function lowerFirst(s: string): string {
    return s.charAt(0).toLowerCase() + s.slice(1)
  }

  async function generateScript() {
    const v = ++gen
    generating = true
    generated = ''
    try {
      const types = await runQuicktype('typescript', true)
      if (v !== gen) return

      const tagLines = activeTags
        .map((tag) => `  const ${lowerFirst(pluralize(tag))} = ext.findAllByType<${tag}>('${tag}')`)
        .join('\n')

      const logVars = ['root', ...activeTags.map((t) => lowerFirst(pluralize(t)))].join(', ')

      generated =
        `import { extractFromUrl } from 'nuxt-data-parser'\n` +
        `\n` +
        `// ─── Types ───────────────────────────────────────────────────────────────────\n` +
        `\n` +
        `${types}\n` +
        `\n` +
        `// ─── Main ────────────────────────────────────────────────────────────────────\n` +
        `\n` +
        `async function main() {\n` +
        `  const ext = await extractFromUrl('${pageUrl}')\n` +
        (tagLines ? tagLines + '\n' : '') +
        `  const root = ext.resolveAll()[0] as Root\n` +
        `\n` +
        `  console.log({ ${logVars} })\n` +
        `}\n` +
        `\n` +
        `main()`
    } catch (e) {
      if (v === gen) generated = `// Error: ${e}`
    }
    if (v === gen) generating = false
  }

  async function generateTypes(lang: Lang) {
    const v = ++gen
    generating = true
    generated = ''
    try {
      const result = await runQuicktype(lang, true)
      if (v !== gen) return
      generated = result
    } catch (e) {
      if (v === gen) generated = `// Error: ${e}`
    }
    if (v === gen) generating = false
  }

  function generateJson() {
    ++gen
    generating = false
    generated = serialize(resolved[0])
  }

  $effect(() => {
    if (mode === 'script') generateScript()
    else if (mode === 'types') generateTypes(typesLang)
    else generateJson()
  })

  const hljsLang = $derived(
    mode === 'json'
      ? 'json'
      : mode === 'script'
        ? 'typescript'
        : (LANGS.find((l) => l.id === typesLang)?.hljs ?? 'typescript'),
  )

  function copy() {
    navigator.clipboard.writeText(generated)
    copied = true
    setTimeout(() => (copied = false), 1500)
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex items-center gap-1">
    {#each ([['script', 'Script TS'], ['types', 'Types'], ['json', 'JSON']] as [Mode, string][]) as [m, label]}
      <button
        class="rounded px-2.5 py-1 text-[11px] font-medium transition-colors
          {mode === m ? 'bg-[#00DC82]/15 text-[#00DC82]' : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => (mode = m)}
      >{label}</button>
    {/each}

    <button
      class="ml-auto rounded px-2.5 py-1 text-[11px] text-zinc-500 transition-colors hover:text-[#00DC82]"
      onclick={copy}
      disabled={generating}
    >{copied ? '✓ copied' : 'Copy'}</button>
  </div>

  {#if mode === 'types'}
    <div class="flex flex-wrap gap-1">
      {#each LANGS as l}
        <button
          class="rounded px-2.5 py-1 text-[11px] font-medium transition-colors
            {typesLang === l.id ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-600 hover:text-zinc-300'}"
          onclick={() => (typesLang = l.id)}
        >{l.label}</button>
      {/each}
    </div>
  {/if}

  {#if mode === 'script'}
    <div class="flex items-center gap-2 rounded-lg border border-zinc-800/60 bg-zinc-900/40 px-3 py-2">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" class="shrink-0 text-[#00DC82]">
        <path d="M12 2L2 20h20L12 2z" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
      <div class="min-w-0 flex-1">
        <p class="text-[11px] text-zinc-400">
          nuxt-data-parser · TypeScript · <span class="text-zinc-600">bun run script.ts</span>
        </p>
        {#if activeTags.length > 0}
          <p class="mt-0.5 text-[10px] text-zinc-600">
            {activeTags.length} type{activeTags.length > 1 ? 's' : ''} :
            <span class="font-mono text-zinc-500">{activeTags.slice(0, 4).join(', ')}{activeTags.length > 4 ? '…' : ''}</span>
          </p>
        {/if}
      </div>
      {#if tags.some(t => INTERNAL_TAGS.has(t))}
        <button
          class="shrink-0 rounded border border-zinc-700 px-2 py-1 text-[10px] transition-colors
            {showInternalTags ? 'border-[#00DC82]/30 text-[#00DC82]' : 'text-zinc-500 hover:text-zinc-300'}"
          onclick={() => (showInternalTags = !showInternalTags)}
        >+internes</button>
      {/if}
    </div>
  {/if}

  {#if mode === 'types' && typesLang !== 'typescript'}
    <p class="text-[10px] text-zinc-700">
      nuxt-data-parser est Node.js only — utilise ces types avec ta propre logique de fetch.
    </p>
  {/if}

  {#if generating}
    <div class="flex h-28 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-[#00DC82]"></div>
      <span class="text-[11px] text-zinc-600">Génération…</span>
    </div>
  {:else}
    <CodeBlock code={generated} lang={hljsLang} maxHeight="370px" />
  {/if}
</div>
