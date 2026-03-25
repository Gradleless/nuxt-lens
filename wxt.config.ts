import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ browser }) => ({
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
    ...(browser === 'firefox' ? {
      data_collection_permissions: { required: [], optional: [] },
    } : {}),
  }),
  webExt: {
    chromiumArgs: ['--user-data-dir=./.chrome-profile'],
  },
})
