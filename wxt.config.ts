import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    default_locale: 'en',
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
