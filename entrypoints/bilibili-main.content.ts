import { defineContentScript } from '#imports';
import { getSeasonInfo, parseVideoRef, runReset } from '../utils/engine';
import { createFloating } from '../utils/floating';
import type { ResetProgress, RpcRequest } from '../utils/types';

/**
 * 主世界内容脚本：
 * - 引擎（fetch + WBI + 心跳）必须跑在页面主世界，才能带上页面 Origin / Referer / Cookie，
 *   否则从扩展源发起会被 B 站风控（412）。
 * - 同时负责可选悬浮窗。
 * - 通过 window.postMessage 与隔离世界的桥接脚本通信，再由桥接脚本转发给 popup。
 */
export default defineContentScript({
  matches: ['https://www.bilibili.com/bangumi/play/*'],
  world: 'MAIN',
  runAt: 'document_idle',
  main() {
    const floating = createFloating();
    const post = (msg: unknown) => window.postMessage(msg, '*');

    window.addEventListener('message', async (ev: MessageEvent) => {
      if (ev.source !== window) return;
      const d = ev.data as RpcRequest | undefined;
      if (!d || d.__bpr !== 'req') return;

      const reply = (ok: boolean, data?: unknown, error?: string) =>
        post({ __bpr: 'res', id: d.id, ok, data, error });

      try {
        if (d.cmd === 'settings') {
          const enabled = !!(d.payload as { floatingEnabled?: boolean } | undefined)?.floatingEnabled;
          if (enabled) await floating.mount();
          else floating.unmount();
          reply(true, { floatingEnabled: enabled });
          return;
        }

        const ref = parseVideoRef(location.href);
        if (!ref) throw new Error('当前页面不是番剧/电视剧播放页');

        if (d.cmd === 'getSeason') {
          reply(true, await getSeasonInfo(ref));
        } else if (d.cmd === 'startReset') {
          const seasonIds = (d.payload as { seasonIds: number[] }).seasonIds;
          const summary = await runReset(ref, seasonIds, (p: ResetProgress) =>
            post({ __bpr: 'event', event: 'progress', data: p }),
          );
          reply(true, summary);
        }
      } catch (e) {
        reply(false, undefined, e instanceof Error ? e.message : String(e));
      }
    });

    // 主动拉取设置（桥接脚本可能晚于本脚本挂载）
    [0, 300, 1200].forEach((ms) =>
      setTimeout(() => window.postMessage({ __bpr: 'req', id: -2, cmd: 'getSettings' }, '*'), ms),
    );
  },
});
