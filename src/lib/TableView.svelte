<script lang="ts">
  import { t } from './i18n'


  let { resolved }: { resolved: unknown[] } = $props()

  interface ArrayInfo {
    path: string
    data: Record<string, unknown>[]
    columns: string[]
  }

  function findArrays(val: unknown, path: string, depth: number, results: ArrayInfo[]) {
    if (depth > 6 || results.length >= 10) return
    if (
      Array.isArray(val) &&
      val.length > 0 &&
      val[0] &&
      typeof val[0] === 'object' &&
      !Array.isArray(val[0]) &&
      !(val[0] instanceof Date)
    ) {
      const data = val.filter(
        (v): v is Record<string, unknown> =>
          v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date),
      )
      if (data.length > 0) {
        const columns = [...new Set(data.flatMap((obj) => Object.keys(obj)))].slice(0, 25)
        results.push({ path: path || '$', data: data.slice(0, 500), columns })
      }
    }
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const [k, v] of Object.entries(val as object)) {
        findArrays(v, path ? `${path}.${k}` : k, depth + 1, results)
      }
    } else if (Array.isArray(val)) {
      val.slice(0, 3).forEach((item, i) => findArrays(item, `${path}[${i}]`, depth + 1, results))
    }
  }

  const arrays = $derived.by(() => {
    const results: ArrayInfo[] = []
    if (resolved[0]) findArrays(resolved[0], '', 0, results)
    return results
  })

  let selectedIndex = $state(0)
  let csvCopied = $state(false)

  const current = $derived(arrays[selectedIndex] ?? null)

  function cellStr(val: unknown): string {
    if (val == null) return ''
    if (val instanceof Date) return val.toISOString()
    if (typeof val === 'object') return JSON.stringify(val)
    return String(val)
  }

  function toCSV(): string {
    if (!current) return ''
    const escape = (s: string) =>
      s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    const rows = current.data.map((row) => current.columns.map((c) => escape(cellStr(row[c]))).join(','))
    return [current.columns.join(','), ...rows].join('\n')
  }

  function copyCSV() {
    navigator.clipboard.writeText(toCSV())
    csvCopied = true
    setTimeout(() => (csvCopied = false), 1500)
  }
</script>

{#if arrays.length === 0}
  <p class="py-8 text-center text-xs text-zinc-600">{t('tableview_empty')}</p>
{:else}
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-2">
      {#if arrays.length > 1}
        <select
          class="flex-1 rounded border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300 outline-none"
          bind:value={selectedIndex}
        >
          {#each arrays as arr, i}
            <option value={i}>{arr.path} ({t('tableview_rows', String(arr.data.length))})</option>
          {/each}
        </select>
      {:else if current}
        <span class="flex-1 font-mono text-[11px] text-zinc-500">
          {current.path} · {t('tableview_rows', String(current.data.length))} · {t('tableview_cols', String(current.columns.length))}
        </span>
      {/if}
      <button
        class="shrink-0 rounded px-2.5 py-1 text-[11px] text-zinc-500 transition-colors hover:text-[#00DC82]"
        onclick={copyCSV}
      >
        {csvCopied ? t('action_copied') : t('tableview_copy_csv')}
      </button>
    </div>

    {#if current}
      <div class="max-h-[400px] overflow-auto rounded-lg border border-zinc-800">
        <table class="w-full border-collapse text-[11px]">
          <thead class="sticky top-0 bg-[#111111]">
            <tr>
              {#each current.columns as col}
                <th
                  class="border-b border-zinc-800 px-3 py-1.5 text-left font-medium whitespace-nowrap text-zinc-400"
                >{col}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each current.data as row, i}
              <tr class="{i % 2 === 0 ? '' : 'bg-zinc-900/30'} hover:bg-white/5">
                {#each current.columns as col}
                  {@const v = row[col]}
                  <td class="border-b border-zinc-800/40 px-3 py-1.5 max-w-[160px] truncate whitespace-nowrap">
                    {#if v == null}
                      <span class="italic text-zinc-700">—</span>
                    {:else if typeof v === 'boolean'}
                      <span class="text-purple-400">{String(v)}</span>
                    {:else if typeof v === 'number'}
                      <span class="text-orange-400">{v}</span>
                    {:else if typeof v === 'string'}
                      <span class="text-zinc-300">{v}</span>
                    {:else}
                      <span class="text-zinc-600 italic">{cellStr(v)}</span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
{/if}
