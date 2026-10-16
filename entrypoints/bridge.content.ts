import { defineContentScript } from '#imports';
import { browser } from 'wxt/browser';
import { DEFAULT_SETTINGS, getSettings } from '../utils/settings';
import { writeMirroredSettings } from '../utils/boot';

/**
 * 隔离世界桥接脚本（所有 B 站页面，document_start 起）：
 * - 把设置镜像到页面 localStorage，供主世界启动脚本**同步**读取（防闪烁）。
 * - 把 popup 的请求转发给主世界脚本，把响应/进度事件转发回 popup。
 * - 设置同步：主动推 + 响应主世界的 getSettings 拉取。
 * - 接受主世界发来的 setSetting（如首页“还原首页”）。
 */
export default defineContentScript({
  matches: ['https://www.bilibili.com/*'],
  runAt: 'document_start',
  main() {
    const toMain = (msg: unknown) => window.postMessage(msg, location.origin);

    const pushSettings = async () => {
      const settings = await getSettings();
      writeMirroredSettings(settings);
      toMain({ __bpr: 'req', id: -1, cmd: 'settings', payload: settings });
    };

    // 多次推送，避免与主世界脚本注入顺序的竞态
    [0, 300, 1200].forEach((d) => setTimeout(() => void pushSettings(), d));

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const patch: Record<string, unknown> = {};
      for (const k of Object.keys(changes)) {
        if (k in DEFAULT_SETTINGS) patch[k] = changes[k]?.newValue;
      }
      if (Object.keys(patch).length) {
        writeMirroredSettings(patch); // 同步写入，保证下次刷新 document_start 能读到
        void pushSettings();
      }
    });

    // 主世界 -> 隔离世界：拉设置 / 写设置
    window.addEventListener('message', (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data as
        | { __bpr?: string; cmd?: string; payload?: { key?: string; value?: unknown } }
        | undefined;
      if (d?.__bpr !== 'req') return;
      if (d.cmd === 'getSettings') {
        void pushSettings();
      } else if (d.cmd === 'setSetting' && d.payload?.key && d.payload.key in DEFAULT_SETTINGS) {
        void browser.storage.local.set({ [d.payload.key]: d.payload.value });
      }
    });

    browser.runtime.onConnect.addListener((port) => {
      if (port.name !== 'bpr') return;

      const fromMain = (ev: MessageEvent) => {
        if (ev.source !== window) return;
        const d = ev.data as { __bpr?: string } | undefined;
        if (!d || (d.__bpr !== 'res' && d.__bpr !== 'event')) return;
        port.postMessage(d);
      };
      window.addEventListener('message', fromMain);

      port.onMessage.addListener((msg: Record<string, unknown>) => {
        toMain({ ...msg, __bpr: 'req' });
      });
      port.onDisconnect.addListener(() => window.removeEventListener('message', fromMain));
    });
  },
});
