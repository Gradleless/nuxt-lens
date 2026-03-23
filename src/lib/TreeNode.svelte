<script lang="ts">
  import { untrack, getContext } from 'svelte'
  import TreeNode from './TreeNode.svelte'

  const MAX_DEPTH = 8

  let {
    key = null,
    value,
    depth = 0,
    startCollapsed = false,
    pathArr = [],
  }: {
    key?: string | number | null
    value: unknown
    depth?: number
    startCollapsed?: boolean
    pathArr?: (string | number)[]
  } = $props()

  // Callback set once in App.svelte and inherited by all recursive TreeNode children via Svelte context
  const onLeafClick = getContext<((path: string) => void) | undefined>('onLeafClick')

  function buildPath(): string {
    const parts: (string | number)[] = key !== null ? [...pathArr, key] : [...pathArr]
    if (!parts.length) return '$'
    return parts.reduce<string>((acc, p, i) => {
      if (i === 0) return String(p)
      if (typeof p === 'number') return `${acc}[${p}]`
      return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(String(p)) ? `${acc}.${p}` : `${acc}['${p}']`
    }, '')
  }

  const childPathArr = $derived<(string | number)[]>(
    key !== null ? [...pathArr, key as string | number] : [...pathArr],
  )

  const isNull = $derived(value === null)
  const isUndefined = $derived(value === undefined)
  const isString = $derived(typeof value === 'string')
  const isNumber = $derived(typeof value === 'number')
  const isBoolean = $derived(typeof value === 'boolean')
  const isDate = $derived(value instanceof Date)
  const isSet = $derived(value instanceof Set)
  const isMap = $derived(value instanceof Map)
  const isArray = $derived(Array.isArray(value))
  const isObject = $derived(
    value !== null && typeof value === 'object' && !isArray && !isDate && !isSet && !isMap,
  )

  const entries = $derived(
    isObject
      ? Object.entries(value as object)
      : isArray
        ? (value as unknown[]).map((v, i) => [i, v] as [number, unknown])
        : isSet
          ? [...(value as Set<unknown>)].map((v, i) => [i, v] as [number, unknown])
          : isMap
            ? [...(value as Map<unknown, unknown>).entries()].map(([k, v]) => [String(k), v])
            : null,
  )

  const hasChildren = $derived(entries !== null && (entries as unknown[]).length > 0)
  const count = $derived((entries as unknown[] | null)?.length ?? 0)

  // untrack prevents this $state initialization from re-running when startCollapsed/depth/count
  // change later — expanded is intentionally set only once at mount time
  let expanded = $state(untrack(() => !startCollapsed && depth < 2 && count <= 20))

  function typeLabel(): string {
    if (isDate) return 'Date'
    if (isSet) return `Set(${(value as Set<unknown>).size})`
    if (isMap) return `Map(${(value as Map<unknown, unknown>).size})`
    if (isArray) return `[${(value as unknown[]).length}]`
    if (isObject) return `{${count}}`
    return ''
  }
</script>

<div class="font-mono text-xs leading-relaxed">
  {#if hasChildren && depth < MAX_DEPTH}
    <button
      class="flex w-full items-baseline gap-1 rounded px-1 py-0.5 text-left hover:bg-white/5"
      onclick={() => {
        expanded = !expanded
        onLeafClick?.(buildPath())
      }}
    >
      <span class="w-3 shrink-0 text-zinc-600">{expanded ? '▾' : '▸'}</span>
      {#if key !== null}
        <span class="text-sky-300">{key}</span>
        <span class="text-zinc-600">:&nbsp;</span>
      {/if}
      <span class="text-[11px] text-zinc-500">{typeLabel()}</span>
      {#if !expanded}<span class="ml-1 text-zinc-700">…</span>{/if}
    </button>
    {#if expanded}
      <div class="ml-1.5 border-l border-white/5 pl-3.5">
        {#each entries as [k, v]}
          <TreeNode key={k as string | number} value={v} depth={depth + 1} pathArr={childPathArr} />
        {/each}
      </div>
    {/if}
  {:else if depth >= MAX_DEPTH && hasChildren}
    <div class="flex items-baseline gap-1 rounded px-1 py-0.5">
      {#if key !== null}
        <span class="text-sky-300">{key}</span>
        <span class="text-zinc-600">:&nbsp;</span>
      {/if}
      <span class="italic text-zinc-600">[max depth]</span>
    </div>
  {:else}
    <div
      class="flex cursor-pointer items-baseline gap-1 rounded px-1 py-0.5 hover:bg-white/[0.03]"
      role="button"
      tabindex="0"
      onclick={() => onLeafClick?.(buildPath())}
      onkeydown={(e) => e.key === 'Enter' && onLeafClick?.(buildPath())}
    >
      {#if key !== null}
        <span class="text-sky-300">{key}</span>
        <span class="text-zinc-600">:&nbsp;</span>
      {/if}
      {#if isNull || isUndefined}
        <span class="italic text-zinc-600">{isNull ? 'null' : 'undefined'}</span>
      {:else if isString}
        <span class="break-all text-emerald-400">"{value}"</span>
      {:else if isNumber}
        <span class="text-orange-400">{value}</span>
      {:else if isBoolean}
        <span class="text-purple-400">{String(value)}</span>
      {:else if isDate}
        <span class="text-yellow-400">{(value as Date).toISOString()}</span>
      {:else}
        <span class="italic text-zinc-600">{typeLabel()}</span>
      {/if}
    </div>
  {/if}
</div>
