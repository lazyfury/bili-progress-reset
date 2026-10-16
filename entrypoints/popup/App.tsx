import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import type { ResetProgress, SeasonInfo } from '../../utils/types';

type PageKind = 'bangumi' | 'home' | 'other';
type Phase = 'loading' | 'ready' | 'error';
interface LogLine {
  text: string;
  cls?: string;
}

class RpcClient {
  private seq = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  onProgress?: (p: ResetProgress) => void;

  constructor(private port: ReturnType<typeof browser.tabs.connect>) {
    port.onMessage.addListener((m: any) => {
      if (m?.__bpr === 'res') {
        const p = this.pending.get(m.id);
        if (p) {
          this.pending.delete(m.id);
          m.ok ? p.resolve(m.data) : p.reject(new Error(m.error || '未知错误'));
        }
      } else if (m?.__bpr === 'event' && m.event === 'progress') {
        this.onProgress?.(m.data as ResetProgress);
      }
    });
    port.onDisconnect.addListener(() => {
      for (const p of this.pending.values()) p.reject(new Error('与页面的连接已断开，请刷新页面后重试'));
      this.pending.clear();
    });
  }

  request<T>(cmd: string, payload?: unknown): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.port.postMessage({ id, cmd, payload });
    });
  }

  disconnect() {
    try {
      this.port.disconnect();
    } catch {
      /* noop */
    }
  }
}

function pageKindOf(url: string): PageKind {
  if (/\/bangumi\/play\/(ep|ss)\d+/.test(url)) return 'bangumi';
  if (/^https:\/\/www\.bilibili\.com\/?(index\.html)?(\?.*)?$/.test(url)) return 'home';
  return 'other';
}

export default function App() {
  const [kind, setKind] = useState<PageKind>('other');
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<SeasonInfo | null>(null);
  const [allSeasons, setAllSeasons] = useState(false);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const [floating, setFloating] = useState(false);
  const [homepage, setHomepage] = useState(false);

  const rpcRef = useRef<RpcClient | null>(null);
  const tabIdRef = useRef<number | null>(null);

  const appendLog = useCallback((text: string, cls?: string) => {
    setLogs((prev) => [...prev, { text, cls }].slice(-500));
  }, []);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const url = tab?.url ?? '';
      const k = pageKindOf(url);
      tabIdRef.current = tab?.id ?? null;
      if (disposed) return;
      setKind(k);

      const s = await browser.storage.local.get({ floatingEnabled: false, homepageEnabled: false });
      if (disposed) return;
      setFloating(!!s.floatingEnabled);
      setHomepage(!!s.homepageEnabled);

      if (k !== 'bangumi' || tab?.id == null) {
        setPhase('ready');
        return;
      }

      const port = browser.tabs.connect(tab.id, { name: 'bpr' });
      const rpc = new RpcClient(port);
      rpc.onProgress = (p) => {
        if (p.type === 'meta') {
          setProgress({ done: 0, total: p.total });
          appendLog(`共 ${p.seasons} 季 / ${p.total} 集（每季倒序，末次落到第 1 集）`, 'info');
        } else if (p.type === 'season-start') {
          appendLog(`— 第 ${p.index}/${p.total} 季：${p.seasonTitle} —`, 'info');
        } else if (p.type === 'item') {
          setProgress({ done: p.index, total: p.total });
          appendLog(
            `${p.ok ? '✓' : '✗'} [${p.seasonTitle}] ${p.title}${p.ok ? ' → 00:00' : ' 失败：' + p.error}`,
            p.ok ? 'ok' : 'err',
          );
        } else if (p.type === 'season-last') {
          appendLog(`↩ [${p.seasonTitle}] 上次播放 → ${p.title}`, 'info');
        } else if (p.type === 'done') {
          appendLog(`完成：成功 ${p.ok}，失败 ${p.fail}。`, 'info');
        }
      };
      rpcRef.current = rpc;

      try {
        const data = await rpc.request<SeasonInfo>('getSeason');
        if (disposed) return;
        setInfo(data);
        setChecked(new Set([data.seasonId]));
        setPhase('ready');
      } catch (e) {
        if (disposed) return;
        setPhase('error');
        appendLog(e instanceof Error ? e.message : String(e), 'err');
      }
    })();

    return () => {
      disposed = true;
      rpcRef.current?.disconnect();
    };
  }, [appendLog]);

  const effectiveSeasonIds = (): number[] => {
    if (!info) return [];
    if (!allSeasons) return [info.seasonId];
    const picked = [...checked];
    return picked.length ? picked : [info.seasonId];
  };

  const run = async () => {
    if (!rpcRef.current || !info || running) return;
    setRunning(true);
    setLogs([]);
    setProgress({ done: 0, total: info.episodes.length });
    try {
      await rpcRef.current.request('startReset', { seasonIds: effectiveSeasonIds() });
    } catch (e) {
      appendLog('中断：' + (e instanceof Error ? e.message : String(e)), 'err');
    } finally {
      setRunning(false);
    }
  };

  const toggleFloating = async () => {
    const v = !floating;
    setFloating(v);
    await browser.storage.local.set({ floatingEnabled: v });
    if (kind === 'bangumi') reloadTab();
  };
  const toggleHomepage = async () => {
    const v = !homepage;
    setHomepage(v);
    await browser.storage.local.set({ homepageEnabled: v });
    if (kind === 'home') reloadTab();
  };
  const toggleSeason = (id: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const reloadTab = () => tabIdRef.current != null && browser.tabs.reload(tabIdRef.current);

  if (phase === 'loading') return <div className="wrap center">读取中…</div>;

  const totalSelected = effectiveSeasonIds().length;
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="wrap">
      <header>
        <h1>B站剧集进度重置</h1>
      </header>

      <div className="card">
        <label className="row">
          <input type="checkbox" checked={homepage} onChange={toggleHomepage} />
          <span>
            重构首页：用「稍后再看 + 关注新视频」替换信息流
          </span>
        </label>
        <div className="dim" style={{ margin: '2px 0 8px 24px' }}>
          开关会自动刷新首页；若仍没变化，到 chrome://extensions 点一下本扩展的刷新按钮。
        </div>
        <label className="row" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={floating} onChange={toggleFloating} />
          <span>播放页右下角悬浮窗</span>
        </label>
      </div>

      {kind === 'other' && (
        <div className="card dim">
          当前页面不支持操作。
          <br />
          进度重置请打开番剧/电视剧播放页；首页重构请打开 B 站首页。
        </div>
      )}

      {kind === 'home' && (
        <div className="card">
          <div className="dim">
            {homepage ? '首页已开启重构，去 B 站首页看看；关闭开关即可还原。' : '开启上面的开关后刷新首页即可生效。'}
          </div>
          <div className="actions" style={{ marginTop: 10 }}>
            <button onClick={reloadTab}>刷新首页</button>
          </div>
        </div>
      )}

      {kind === 'bangumi' && phase === 'error' && (
        <div className="card err">
          {logs.map((l, i) => (
            <div key={i} className={l.cls}>
              {l.text}
            </div>
          ))}
          <p className="dim">若刚安装/更新扩展，请刷新 B 站页面后重试。</p>
        </div>
      )}

      {kind === 'bangumi' && phase === 'ready' && info && (
        <>
          <div className="card">
            <div className="title">{info.title}</div>
            <div className="dim">
              本季 {info.episodes.length} 集
              {info.seasons.length > 1 ? ` · 全剧 ${info.seasons.length} 季 · 已选 ${totalSelected} 季` : ''}
            </div>
          </div>

          <div className="card">
            <label className="row">
              <input type="checkbox" checked={allSeasons} onChange={(e) => setAllSeasons(e.target.checked)} />
              <span>包含全部分季（一次性清空整部剧）</span>
            </label>
            {allSeasons && info.seasons.length > 1 && (
              <div className="seasons">
                <div className="seasons-head">
                  <span className="dim">选择分季</span>
                  <span>
                    <button onClick={() => setChecked(new Set(info.seasons.map((s) => s.seasonId)))}>全选</button>
                    <button onClick={() => setChecked(new Set())}>清空</button>
                  </span>
                </div>
                <div className="season-list">
                  {info.seasons.map((s) => (
                    <label key={s.seasonId}>
                      <input type="checkbox" checked={checked.has(s.seasonId)} onChange={() => toggleSeason(s.seasonId)} />
                      <span>{s.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bar">
            <i style={{ width: `${pct}%` }} />
          </div>

          <div className="actions">
            <button className="primary" onClick={run} disabled={running}>
              {running ? '重置中…' : '开始重置'}
            </button>
            <button onClick={reloadTab}>刷新页面</button>
          </div>

          <div className="log">
            {logs.map((l, i) => (
              <div key={i} className={l.cls}>
                {l.text}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
