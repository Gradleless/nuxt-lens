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
        id: 'nuxtlens@gradleless',
        strict_min_version: '109.0',
        // @ts-expect-error — new Firefox field, not yet in WXT types
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
  webExt: {
    chromiumArgs: ['--user-data-dir=./.chrome-profile'],
  },
})
