import { getSeasonInfo, parseVideoRef, runReset } from './engine';
import type { ResetProgress, SeasonInfo } from './types';

/** 悬浮窗（可选功能），与 popup 同源逻辑，直接在主世界运行引擎 */

const CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .fab { position: fixed; right: 20px; bottom: 96px; z-index: 2147483000; display: flex; align-items: center; gap: 6px;
    padding: 10px 14px; border: none; border-radius: 22px; background: #fb7299; color: #fff; font-size: 13px; font-weight: 600;
    cursor: pointer; box-shadow: 0 4px 14px rgba(251,114,153,.5); }
  .fab:hover { filter: brightness(1.05); } .fab:disabled { opacity: .6; cursor: default; }
  .panel { position: fixed; right: 20px; bottom: 150px; z-index: 2147483000; width: 360px; max-width: calc(100vw - 40px);
    max-height: 66vh; display: none; flex-direction: column; background: #1f1f27; color: #e8e8ee; border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0,0,0,.55); overflow: hidden; }
  .panel.open { display: flex; }
  .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #2a2a35; font-size: 13px; font-weight: 600; }
  .x { background: none; border: none; color: #9a9aa8; font-size: 18px; cursor: pointer; line-height: 1; padding: 0 4px; }
  .x:hover { color: #fff; }
  .body { padding: 12px 14px; overflow-y: auto; font-size: 12px; }
  .desc { color: #a9a9b8; line-height: 1.6; margin-bottom: 10px; } .desc b { color: #ff9db8; }
  .opts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
  .opts label { display: flex; align-items: center; gap: 8px; cursor: pointer; color: #cfcfda; font-size: 12px; }
  .opts input { accent-color: #fb7299; }
  .seasons { border: 1px solid #3a3a48; border-radius: 8px; padding: 8px; margin-bottom: 10px; display: none; }
  .seasons.show { display: block; }
  .seasons .h { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; color: #a9a9b8; }
  .seasons .h button { background: #3a3a48; color: #dcdce6; border: none; border-radius: 6px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
  .seasons .list { max-height: 130px; overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; }
  .seasons .list label { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #cfcfda; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .seasons .list input { accent-color: #fb7299; }
  .actions { display: flex; gap: 8px; margin-bottom: 10px; }
  .actions button { flex: 1; padding: 9px 10px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
  #run { background: #fb7299; color: #fff; } #run:disabled { background: #5a3a46; cursor: default; }
  #reload { background: #3a3a48; color: #dcdce6; } #reload:disabled { opacity: .5; cursor: default; }
  .bar { height: 6px; border-radius: 3px; background: #3a3a48; overflow: hidden; margin-bottom: 10px; }
  .bar > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,#fb7299,#ff9db8); transition: width .2s; }
  .log { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.6; color: #b9b9c8;
    white-space: pre-wrap; word-break: break-all; max-height: 180px; overflow-y: auto; }
  .log .ok { color: #6ee7a8; } .log .err { color: #ff7b7b; } .log .info { color: #8fc7ff; }
`;

export interface FloatingController {
  mount(): Promise<void>;
  unmount(): void;
}

export function createFloating(): FloatingController {
  let host: HTMLDivElement | null = null;
  let info: SeasonInfo | null = null;
  let running = false;
  let checks: { seasonId: number; input: HTMLInputElement }[] = [];

  async function mount() {
    if (host) return;
    const ref = parseVideoRef(location.href);
    if (!ref) return;

    host = document.createElement('div');
    host.id = 'bpr-root';
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `
      <style>${CSS}</style>
      <button class="fab" id="fab">⏱ 重置本剧进度</button>
      <div class="panel" id="panel">
        <div class="head"><span>重置剧集进度为 00:00</span><button class="x" id="x">✕</button></div>
        <div class="body">
          <div class="desc" id="desc">正在读取剧集信息…</div>
          <div class="opts">
            <label><input type="checkbox" id="allseason"> 包含全部分季</label>
          </div>
          <div class="seasons" id="seasons">
            <div class="h"><span>选择分季</span><span><button id="selall">全选</button> <button id="selnone">清空</button></span></div>
            <div class="list" id="list"></div>
          </div>
          <div class="actions">
            <button id="run" disabled>开始重置</button>
            <button id="reload" disabled>刷新页面</button>
          </div>
          <div class="bar"><i id="bar"></i></div>
          <div class="log" id="log"></div>
        </div>
      </div>`;

    const $ = (id: string) => sh.getElementById(id) as HTMLElement;
    const fab = $('fab') as HTMLButtonElement;
    const panel = $('panel');
    const desc = $('desc');
    const allCb = $('allseason') as HTMLInputElement;
    const seasonsBox = $('seasons');
    const list = $('list');
    const runBtn = $('run') as HTMLButtonElement;
    const reloadBtn = $('reload') as HTMLButtonElement;
    const bar = $('bar');
    const logEl = $('log');

    const log = (msg: string, cls?: string) => {
      const line = document.createElement('div');
      if (cls) line.className = cls;
      line.textContent = msg;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    };
    const setBar = (done: number, total: number) => {
      bar.style.width = total ? (done / total) * 100 + '%' : '0%';
    };
    const selected = () => {
      if (!info) return [] as number[];
      if (!allCb.checked) return [info.seasonId];
      const picked = checks.filter((c) => c.input.checked).map((c) => c.seasonId);
      return picked.length ? picked : [info.seasonId];
    };
    const updateDesc = () => {
      if (!info) return;
      const n = selected().length;
      const multi = info.seasons.length > 1;
      desc.innerHTML =
        `《${info.title}》本季 <b>${info.episodes.length}</b> 集` +
        (multi ? `，全剧共 <b>${info.seasons.length}</b> 季。当前处理 <b>${n}</b> 季。` : '。') +
        ` 每集归零，每季“上次播放”重置到第 1 集。`;
    };

    fab.addEventListener('click', () => panel.classList.toggle('open'));
    $('x').addEventListener('click', () => panel.classList.remove('open'));
    allCb.addEventListener('change', () => {
      checks.forEach((c) => (c.input.disabled = !allCb.checked));
      seasonsBox.style.opacity = allCb.checked ? '1' : '.45';
      updateDesc();
    });
    $('selall').addEventListener('click', () => {
      checks.forEach((c) => (c.input.checked = true));
      updateDesc();
    });
    $('selnone').addEventListener('click', () => {
      checks.forEach((c) => (c.input.checked = false));
      updateDesc();
    });
    reloadBtn.addEventListener('click', () => location.reload());

    runBtn.addEventListener('click', async () => {
      if (running || !info || !ref) return;
      running = true;
      runBtn.disabled = true;
      reloadBtn.disabled = true;
      logEl.innerHTML = '';
      setBar(0, 1);
      try {
        await runReset(ref, selected(), (p: ResetProgress) => {
          if (p.type === 'meta') {
            setBar(0, p.total);
            log(`共 ${p.seasons} 季 / ${p.total} 集（每季倒序，末次落到第 1 集）。`, 'info');
          } else if (p.type === 'item') {
            log(
              `${p.ok ? '✓' : '✗'} [${p.seasonTitle}] ${p.title}${p.ok ? ' → 00:00' : ' 失败：' + p.error}`,
              p.ok ? 'ok' : 'err',
            );
            setBar(p.index, p.total);
          } else if (p.type === 'season-last') {
            log(`↩ [${p.seasonTitle}] 上次播放 → ${p.title}`, 'info');
          } else if (p.type === 'done') {
            log(`完成：成功 ${p.ok}，失败 ${p.fail}。`, 'info');
          }
        });
        reloadBtn.disabled = false;
      } catch (e) {
        log('中断：' + (e instanceof Error ? e.message : String(e)), 'err');
      } finally {
        running = false;
        runBtn.disabled = false;
      }
    });

    (document.body || document.documentElement).appendChild(host);
    seasonsBox.style.opacity = '.45';

    try {
      info = await getSeasonInfo(ref);
      checks = info.seasons.map((s) => {
        const lab = document.createElement('label');
        lab.title = s.title;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = s.seasonId === info!.seasonId;
        input.disabled = !allCb.checked;
        input.addEventListener('change', updateDesc);
        const span = document.createElement('span');
        span.textContent = s.title;
        lab.appendChild(input);
        lab.appendChild(span);
        list.appendChild(lab);
        return { seasonId: s.seasonId, input };
      });
      if (info.seasons.length > 1) seasonsBox.classList.add('show');
      updateDesc();
      runBtn.disabled = false;
    } catch (e) {
      desc.textContent = '读取剧集失败：' + (e instanceof Error ? e.message : String(e));
    }
  }

  function unmount() {
    host?.remove();
    host = null;
    checks = [];
    info = null;
  }

  return { mount, unmount };
}
