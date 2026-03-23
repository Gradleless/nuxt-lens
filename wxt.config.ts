import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'Nuxt Data Scraper',
    description: 'Detect and explore __NUXT_DATA__ on any Nuxt 3 page',
    permissions: ['activeTab', 'tabs', 'storage', 'scripting'],
    browser_specific_settings: {
      gecko: {
        id: 'nuxt-data-scraper@wxt',
        strict_min_version: '109.0',
      },
    },
  },
  webExt: {
    chromiumArgs: ['--user-data-dir=./.chrome-profile'],
  },
})
