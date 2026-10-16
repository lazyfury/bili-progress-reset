/**
 * 防闪烁启动遮罩的共享工具。
 * 由 document_start 的启动脚本调用；home 视图挂载/卸载时调用移除函数。
 */

export const BOOT_ID = 'bpr-boot';
export const BOOT_STYLE_ID = 'bpr-boot-style';
export const SETTINGS_LS_KEY = 'bpr_settings';

export function readMirroredSettings(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_LS_KEY) || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function writeMirroredSettings(patch: Record<string, unknown>): void {
  try {
    const cur = readMirroredSettings();
    localStorage.setItem(SETTINGS_LS_KEY, JSON.stringify({ ...cur, ...patch }));
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

const BOOT_CSS = `
  .bili-feed4, .feed2, #i_cement, .recommended-container_floor_aside { display: none !important; }
  html { background: #fff !important; }
  #${BOOT_ID} { position: fixed; inset: 0; z-index: 2147483600; background: #fff;
    display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 14px;
    color: #606060; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 13px; }
  #${BOOT_ID} .s { width: 30px; height: 30px; border: 3px solid #f0f0f0; border-top-color: #fb7299;
    border-radius: 50%; animation: bprspin .8s linear infinite; }
  #${BOOT_ID} .b { color: #fb7299; font-weight: 700; }
  @keyframes bprspin { to { transform: rotate(360deg); } }
`;

export function installBoot(): void {
  const doInstall = () => {
    const root = document.documentElement;
    if (!root) return;

    if (!document.getElementById(BOOT_STYLE_ID)) {
      const style = document.createElement('style');
      style.id = BOOT_STYLE_ID;
      style.textContent = BOOT_CSS;
      root.appendChild(style);
    }
    if (!document.getElementById(BOOT_ID)) {
      const box = document.createElement('div');
      box.id = BOOT_ID;
      box.innerHTML = `<div class="s"></div><div><span class="b">我的首页</span> 加载中…</div>`;
      root.appendChild(box);
    }

    // 兜底：8 秒后若仍无人接管，撤掉遮罩，避免卡死
    setTimeout(() => document.getElementById(BOOT_ID)?.remove(), 8000);
  };

  if (document.documentElement) {
    doInstall();
    return;
  }
  // 极早期（document_start / addScriptToEvaluateOnNewDocument）可能还没有 <html>，等它出现
  const obs = new MutationObserver(() => {
    if (document.documentElement) {
      obs.disconnect();
      doInstall();
    }
  });
  obs.observe(document, { childList: true, subtree: true });
}

export function removeBootOverlay(): void {
  document.getElementById(BOOT_ID)?.remove();
}

export function removeBootAll(): void {
  document.getElementById(BOOT_ID)?.remove();
  document.getElementById(BOOT_STYLE_ID)?.remove();
}
