import { defineContentScript } from '#imports';
import { createPill, mountHome, type HomeMount } from '../utils/home-app';
import { removeBootAll, removeBootOverlay } from '../utils/boot';
import type { PinnedChannel, RpcRequest } from '../utils/types';

/**
 * 首页重构（主世界）。
 *
 * 注意：manifest 的 matches 必须用 `https://www.bilibili.com/*`，
 * 因为 `https://www.bilibili.com/` 匹配不到带 query 的首页（如 `/?spm_id_from=...`）。
 * 因此这里做**运行时路径判断**，只在本站首页生效。
 *
 * 视图由 React 应用到 `#new-home-app`（内部 Shadow DOM 隔离样式），全部状态在 React 内管理。
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

    let app: HomeMount | null = null;
    let pill: HTMLElement | null = null;
    let enabled = false;
    let pinnedChannels: PinnedChannel[] = [];

    const postSetting = (key: string, value: unknown) =>
      window.postMessage({ __bpr: 'req', id: -Date.now(), cmd: 'setSetting', payload: { key, value } }, location.origin);

    /* -------- 隐藏 / 还原 B 站原版信息流 -------- */
    const hidden: { el: HTMLElement; prev: string }[] = [];
    const hideOld = () => {
      for (const sel of ['.bili-feed4', '.feed2', '#i_cement', '.recommended-container_floor_aside']) {
        document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
          if (el.dataset.bprHidden) return;
          hidden.push({ el, prev: el.style.display });
          el.style.setProperty('display', 'none', 'important');
          el.dataset.bprHidden = '1';
        });
      }
    };
    const restoreOld = () => {
      for (const { el, prev } of hidden) {
        el.style.display = prev;
        delete el.dataset.bprHidden;
      }
      hidden.length = 0;
    };

    /* -------- mount / unmount -------- */
    const props = () => ({ pinned: pinnedChannels, onExit });

    const mountApp = () => {
      if (app || !isHome()) return;
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      hideOld();
      const host = document.createElement('div');
      host.id = 'new-home-app';
      document.body.appendChild(host);
      app = mountHome(host, props());
      if (pill) pill.style.display = 'none';
      removeBootOverlay();
      console.log('[bpr-home] React app mounted');
    };
    const unmountApp = () => {
      if (!app) return;
      app.unmount();
      app = null;
      restoreOld();
      removeBootAll();
      if (pill) pill.style.display = '';
      if ('scrollRestoration' in history) history.scrollRestoration = 'auto';
    };

    const apply = () => {
      if (enabled && isHome()) mountApp();
      else unmountApp();
    };

    const onExit = () => {
      enabled = false;
      postSetting('homepageEnabled', false);
      unmountApp();
    };

    const ensurePill = () => {
      if (pill || !isHome() || !document.body) return;
      pill = createPill(() => {
        enabled = true;
        apply();
      });
      console.log('[bpr-home] pill 已注入');
    };

    /* -------- 设置同步 -------- */
    const requestSettings = (ms: number) =>
      setTimeout(() => window.postMessage({ __bpr: 'req', id: -2, cmd: 'getSettings' }, location.origin), ms);

    window.addEventListener('message', (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data as RpcRequest | undefined;
      if (!d || d.__bpr !== 'req' || d.cmd !== 'settings') return;
      const payload = d.payload as { homepageEnabled?: boolean; pinnedChannels?: PinnedChannel[] } | undefined;
      enabled = !!payload?.homepageEnabled;
      pinnedChannels = Array.isArray(payload?.pinnedChannels) ? payload.pinnedChannels! : [];
      app?.update(props());
      apply();
    });

    /* -------- 首次 + SPA 路由变化 -------- */
    const boot = () => {
      ensurePill();
      if (!isHome()) {
        unmountApp();
        return;
      }
      [0, 300, 1200].forEach(requestSettings);
    };
    boot();

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
