import { defineContentScript } from '#imports';
import { createHome, type HomeController } from '../utils/home-view';
import { removeBootAll } from '../utils/boot';
import type { RpcRequest } from '../utils/types';

/**
 * 首页重构（主世界）。
 *
 * 注意：manifest 的 matches 必须用 `https://www.bilibili.com/*`，
 * 因为 `https://www.bilibili.com/` 匹配不到带 query 的首页（如 `/?spm_id_from=...`）。
 * 因此这里做**运行时路径判断**，只在本站首页生效。
 */
export default defineContentScript({
  matches: ['https://www.bilibili.com/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    const isHome = () => {
      const p = location.pathname;
      return p === '/' || p === '/index.html';
    };

    let home: HomeController | null = null;
    let enabled = false;

    const teardown = () => {
      home?.deactivate();
      home = null;
      removeBootAll();
    };

    const ensureController = () => {
      if (!isHome()) {
        teardown();
        return;
      }
      if (!home) {
        home = createHome(); // 立即注入「我的首页」小入口
        console.log('[bpr-home] controller ready on', location.pathname);
      }
    };

    const apply = () => {
      ensureController();
      if (!home) return;
      if (enabled) void home.activate();
      else home.deactivate();
    };

    const requestSettings = (ms: number) =>
      setTimeout(() => window.postMessage({ __bpr: 'req', id: -2, cmd: 'getSettings' }, location.origin), ms);

    window.addEventListener('message', (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data as RpcRequest | undefined;
      if (!d || d.__bpr !== 'req' || d.cmd !== 'settings') return;
      enabled = !!(d.payload as { homepageEnabled?: boolean } | undefined)?.homepageEnabled;
      console.log('[bpr-home] settings, homepageEnabled =', enabled, '| isHome =', isHome());
      apply();
    });

    // 首次 + SPA 路由变化时拉取设置并应用
    const boot = () => {
      if (!isHome()) return;
      ensureController();
      [0, 300, 1200].forEach(requestSettings);
    };
    boot();

    // SPA 路由变化：优先用 Navigation API（Chrome 102+），不支持时退化为低频轮询
    let lastHref = location.href;
    const onUrlChange = () => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      boot();
      apply();
    };
    const navigation = (window as unknown as {
      navigation?: { addEventListener?: (type: string, fn: () => void) => void };
    }).navigation;
    if (navigation?.addEventListener) {
      navigation.addEventListener('navigate', () => setTimeout(onUrlChange, 0));
    } else {
      setInterval(onUrlChange, 800);
    }
  },
});
