<script lang="ts">
  import hljs from 'highlight.js/lib/core'
  import ts from 'highlight.js/lib/languages/typescript'
  import python from 'highlight.js/lib/languages/python'
  import go from 'highlight.js/lib/languages/go'
  import rust from 'highlight.js/lib/languages/rust'
  import csharp from 'highlight.js/lib/languages/csharp'
  import java from 'highlight.js/lib/languages/java'
  import swift from 'highlight.js/lib/languages/swift'
  import kotlin from 'highlight.js/lib/languages/kotlin'
  import json from 'highlight.js/lib/languages/json'

  hljs.registerLanguage('typescript', ts)
  hljs.registerLanguage('python', python)
  hljs.registerLanguage('go', go)
  hljs.registerLanguage('rust', rust)
  hljs.registerLanguage('json', json)
  hljs.registerLanguage('csharp', csharp)
  hljs.registerLanguage('java', java)
  hljs.registerLanguage('swift', swift)
  hljs.registerLanguage('kotlin', kotlin)

  let { code, lang, maxHeight = '400px' }: { code: string; lang: string; maxHeight?: string } =
    $props()

  const highlighted = $derived(
    code ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : '',
  )
</script>

<div
  class="overflow-auto rounded-lg border border-zinc-800 bg-zinc-900/50"
  style="max-height: {maxHeight}"
>
  <pre class="p-3 font-mono text-[11px] leading-relaxed whitespace-pre"><code>{@html highlighted}</code></pre>
</div>

<style>
  code :global(.hljs-keyword),
  code :global(.hljs-operator),
  code :global(.hljs-important) {
    color: #c792ea;
  }
  code :global(.hljs-string),
  code :global(.hljs-attr) {
    color: #a3e68c;
  }
  code :global(.hljs-number),
  code :global(.hljs-literal) {
    color: #f78c6c;
  }
  code :global(.hljs-comment),
  code :global(.hljs-doctag) {
    color: #4e6272;
    font-style: italic;
  }
  code :global(.hljs-title),
  code :global(.hljs-title.class_),
  code :global(.hljs-title.function_) {
    color: #82aaff;
  }
  code :global(.hljs-type),
  code :global(.hljs-built_in),
  code :global(.hljs-class .hljs-title) {
    color: #ffcb6b;
  }
  code :global(.hljs-variable),
  code :global(.hljs-params) {
    color: #e4e4e7;
  }
  code :global(.hljs-punctuation) {
    color: #89ddff;
  }
  code :global(.hljs-meta) {
    color: #00dc82;
  }
  code :global(.hljs-symbol),
  code :global(.hljs-bullet) {
    color: #00dc82;
  }
</style>
