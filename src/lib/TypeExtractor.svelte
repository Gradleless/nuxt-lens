<script lang="ts">
  import { quicktype, InputData, jsonInputForTargetLanguage } from 'quicktype-core'
  import CodeBlock from './CodeBlock.svelte'

  let { resolved, tags }: { resolved: unknown[]; tags: string[] } = $props()

  type Lang = 'typescript' | 'python' | 'golang' | 'rust' | 'csharp' | 'java' | 'swift' | 'kotlin'

  const LANGS: { id: Lang; label: string }[] = [
    { id: 'typescript', label: 'TypeScript' },
    { id: 'python', label: 'Python' },
    { id: 'golang', label: 'Go' },
    { id: 'rust', label: 'Rust' },
    { id: 'csharp', label: 'C#' },
    { id: 'java', label: 'Java' },
    { id: 'swift', label: 'Swift' },
    { id: 'kotlin', label: 'Kotlin' },
  ]

  const HLJS_LANG: Record<Lang, string> = {
    typescript: 'typescript',
    python: 'python',
    golang: 'go',
    rust: 'rust',
    csharp: 'csharp',
    java: 'java',
    swift: 'swift',
    kotlin: 'kotlin',
  }

  let lang = $state<Lang>('typescript')
  let justTypes = $state(true)
  let generated = $state('')
  let generating = $state(false)
  let copied = $state(false)

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

  async function generate(targetLang: Lang, val: unknown, typesOnly: boolean) {
    generating = true
    generated = ''
    try {
      const jsonStr = serialize(val)
      const jsonInput = jsonInputForTargetLanguage(targetLang)
      await jsonInput.addSource({ name: 'Root', samples: [jsonStr] })

      const inputData = new InputData()
      inputData.addInput(jsonInput)

      const opts: Record<string, string> = {}
      if (typesOnly && targetLang === 'typescript') opts['just-types'] = 'true'
      if (targetLang === 'rust') opts['derive-debug'] = 'true'

      const { lines } = await quicktype({ inputData, lang: targetLang, rendererOptions: opts })
      generated = lines.join('\n')
    } catch (e) {
      generated = `// Error: ${e}`
    }
    generating = false
  }

  $effect(() => {
    generate(lang, resolved[0], justTypes)
  })

  function copy() {
    navigator.clipboard.writeText(generated)
    copied = true
    setTimeout(() => (copied = false), 1500)
  }
</script>

<div class="flex flex-col gap-3">
  <div class="flex flex-wrap items-center gap-1">
    {#each LANGS as l}
      <button
        class="rounded px-2.5 py-1 text-[11px] font-medium transition-colors
          {lang === l.id ? 'bg-[#00DC82]/15 text-[#00DC82]' : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => (lang = l.id)}
      >
        {l.label}
      </button>
    {/each}
  </div>

  <div class="flex items-center gap-2">
    <div class="flex overflow-hidden rounded border border-zinc-800 text-[11px]">
      <button
        class="px-2.5 py-1 transition-colors {justTypes
          ? 'bg-zinc-800 text-zinc-200'
          : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => (justTypes = true)}
      >Types only</button>
      <button
        class="px-2.5 py-1 transition-colors {!justTypes
          ? 'bg-zinc-800 text-zinc-200'
          : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => (justTypes = false)}
      >Full client</button>
    </div>

    <button
      class="ml-auto rounded px-2.5 py-1 text-[11px] text-zinc-500 transition-colors hover:text-[#00DC82]"
      onclick={copy}
      disabled={generating}
    >
      {copied ? '✓ copied' : 'Copy'}
    </button>
  </div>

  {#if generating}
    <div class="flex h-24 items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-[#00DC82]"></div>
      <span class="text-[11px] text-zinc-600">Generating…</span>
    </div>
  {:else}
    <CodeBlock code={generated} lang={HLJS_LANG[lang]} maxHeight="320px" />
  {/if}

  {#if tags.length > 0}
    <div>
      <p class="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
        Custom types in payload ({tags.length})
      </p>
      <div class="flex flex-wrap gap-1">
        {#each tags as tag}
          <span class="rounded bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400">
            {tag}
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>
