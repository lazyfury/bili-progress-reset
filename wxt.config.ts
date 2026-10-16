import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'B站剧集进度重置 (00:00)',
    description: '把番剧/电视剧每集进度重置为 00:00，并把每季“上次播放”重置到第 1 集。',
    permissions: ['storage', 'activeTab'],
    action: {
      default_title: 'B站剧集进度重置',
    },
  },
});
