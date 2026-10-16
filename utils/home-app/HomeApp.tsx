import { Fragment, useEffect, useRef, useState } from 'react';
import { biliTvSvg, iconSvg } from '../icons';
import { fmtAgo, fmtCount, fmtDuration, type Card, type MsgItem, type TimelineDay } from '../home';
import type { PinnedChannel } from '../types';
import { APP_CSS } from './css';
import {
  PGC,
  PGC_PRESETS,
  REGION_PRESETS,
  SECTIONS,
  StoreProvider,
  newSection,
  useHomeStore,
  useStore,
  type SecKey,
  type StaticKey,
} from './store';

/* ------------------------------- 基础组件 ------------------------------- */

function Avatar({ c }: { c: Card }) {
  const [err, setErr] = useState(false);
  return (
    <div className="avatar">
      {c.upFace && !err ? (
        <img loading="lazy" referrerPolicy="no-referrer" src={c.upFace} onError={() => setErr(true)} />
      ) : (
        (c.up ?? '?').slice(0, 1)
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid">
      {Array.from({ length: 10 }).map((_, i) => (
        <div className="sk" key={i}>
          <div className="b thumb-b" style={{ animationDelay: `${(i % 5) * 0.08}s` }} />
          <div className="row">
            <div className="b av-b" style={{ animationDelay: `${(i % 5) * 0.08}s` }} />
            <div className="lines">
              <div className="b l1" style={{ animationDelay: `${(i % 5) * 0.08}s` }} />
              <div className="b l2" style={{ animationDelay: `${(i % 5) * 0.08}s` }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StateBox({
  title,
  desc,
  action,
}: {
  title: string;
  desc?: string;
  action?: { label: string; onClick: () => void; ghost?: boolean };
}) {
  return (
    <div className="state">
      <div className="big">{title}</div>
      {desc && <div>{desc}</div>}
      {action && (
        <div className="act">
          <button className={action.ghost ? 'ghost' : ''} onClick={action.onClick}>
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}

function CardView({ c }: { c: Card }) {
  const { hidden } = useStore();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const go = () => {
    location.href = c.url;
  };
  if (hidden.has(c.id)) return null;
  return (
    <div
      className="card"
      tabIndex={0}
      role="link"
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      }}
    >
      <div className="thumb">
        {c.cover && <img loading="lazy" referrerPolicy="no-referrer" src={c.cover} />}
        {c.duration ? (
          <div className="dur">{fmtDuration(c.duration)}</div>
        ) : c.badge ? (
          <div className={'corner' + (c.pinned ? ' hot' : '')}>{c.badge}</div>
        ) : null}
        {c.score && <div className="score">{c.score}</div>}
        {c.progress && c.duration ? (
          <div className="prog">
            <i style={{ width: Math.min(100, (c.progress / c.duration) * 100) + '%' }} />
          </div>
        ) : null}
        <div className="play">
          <span dangerouslySetInnerHTML={{ __html: iconSvg('play-arrow', 26) }} />
        </div>
        {c.mid ? (
          <button
            className="cmore"
            title="关注 / 拉黑"
            aria-haspopup="menu"
            aria-label="更多操作"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ x: r.left, y: r.bottom + 6 });
            }}
            dangerouslySetInnerHTML={{ __html: iconSvg('more-vert', 16) }}
          />
        ) : null}
      </div>
      <div className="meta">
        <Avatar c={c} />
        <div className="txt">
          <div className="t">{c.title}</div>
          <div className="ch">{c.up ?? ''}</div>
          <div className="sub">{c.right ?? ''}</div>
        </div>
      </div>
      {menu && <CardMenu card={c} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />}
    </div>
  );
}

function MiniCard({ c }: { c: Card }) {
  const go = () => {
    location.href = c.url;
  };
  return (
    <div
      className="mini"
      tabIndex={0}
      role="link"
      onClick={go}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      }}
    >
      <div className="mthumb">
        {c.cover && <img loading="lazy" referrerPolicy="no-referrer" src={c.cover} />}
        {c.badge && <div className={'corner' + (c.pinned ? ' hot' : '')}>{c.badge}</div>}
        {c.score && <div className="score">{c.score}</div>}
      </div>
      <div className="mt">{c.title}</div>
      {c.up ? <div className="msub">{c.up}</div> : null}
    </div>
  );
}

function CardMenu({ card, x, y, onClose }: { card: Card; x: number; y: number; onClose: () => void }) {
  const { relations, doRelation, doDislike } = useStore();
  const [mode, setMode] = useState<'main' | 'block' | 'dislike'>('main');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    const t = setTimeout(() => {
      window.addEventListener('click', onDoc, true);
      window.addEventListener('scroll', onScroll, { passive: true, once: true });
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('click', onDoc, true);
      window.removeEventListener('scroll', onScroll);
    };
  }, [onClose]);

  const attr = card.mid ? relations.get(card.mid) : undefined;
  const blocked = attr === 128;
  const following = attr === 1 || attr === 2 || attr === 6;
  const style = {
    left: Math.max(8, Math.min(x, window.innerWidth - 190)),
    top: Math.min(y, window.innerHeight - 220),
  };
  return (
    <div className="cmenu" ref={ref} style={style} onClick={(e) => e.stopPropagation()}>
      {mode === 'main' && (
        <>
          <button
            onClick={() => {
              onClose();
              location.href = `https://space.bilibili.com/${card.mid}`;
            }}
          >
            打开 UP 空间
          </button>
          <button
            onClick={() => {
              onClose();
              location.href = card.url;
            }}
          >
            打开视频
          </button>
          {following ? (
            <button onClick={() => void doRelation(card, 2, `已取消关注 ${card.up ?? ''}`)}>
              取消关注{card.up ? ' ' + card.up : ''}
            </button>
          ) : (
            <button onClick={() => void doRelation(card, 1, `已关注 ${card.up ?? ''}`)}>
              关注{card.up ? ' ' + card.up : ''}
            </button>
          )}
          {blocked ? (
            <button onClick={() => void doRelation(card, 6, `已取消拉黑 ${card.up ?? ''}`)}>取消拉黑</button>
          ) : (
            <button className="cm-danger" onClick={() => setMode('block')}>
              拉黑 UP
            </button>
          )}
          {card.trackId && <button onClick={() => setMode('dislike')}>不再推荐</button>}
        </>
      )}
      {mode === 'block' && (
        <>
          <div className="cm-q">确认拉黑 {card.up || '该 UP'}？</div>
          <button
            className="cm-danger"
            onClick={() => {
              onClose();
              void doRelation(card, 5, `已拉黑 ${card.up ?? ''}`);
            }}
          >
            确认拉黑
          </button>
          <button onClick={onClose}>取消</button>
        </>
      )}
      {mode === 'dislike' && (
        <>
          <div className="cm-q">不再推荐：</div>
          <button
            onClick={() => {
              onClose();
              void doDislike(card, 1);
            }}
          >
            内容不感兴趣
          </button>
          <button
            onClick={() => {
              onClose();
              void doDislike(card, 4);
            }}
          >
            不想看此 UP 主
          </button>
          <button onClick={onClose}>取消</button>
        </>
      )}
    </div>
  );
}

function Grid({ items }: { items: Card[] }) {
  return (
    <div className="grid">
      {items.map((c) => (
        <CardView key={c.id} c={c} />
      ))}
    </div>
  );
}

function RowBlock({ title, items, badge }: { title: string; items: Card[]; badge?: string }) {
  const [exp, setExp] = useState(false);
  return (
    <div className="follow">
      <div className="follow-head">
        <h3>{title}</h3>
        {badge && <span className="pin-badge">{badge}</span>}
        <button className="more-btn" onClick={() => setExp((v) => !v)}>
          {exp ? '收起' : '展开全部'}
        </button>
      </div>
      <div className={'follow-row' + (exp ? ' expanded' : '')}>
        {items.map((c) => (
          <MiniCard key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}

function TimelineBlock({ days }: { days: TimelineDay[] }) {
  const [i, setI] = useState(0);
  const idx = Math.min(Math.max(i, 0), days.length - 1);
  return (
    <div className="follow">
      <div className="follow-head">
        <h3>新番时间表</h3>
        <div className="tl-tabs">
          {days.map((d, di) => (
            <button key={di} className={di === idx ? 'active' : ''} onClick={() => setI(di)}>
              {d.isToday ? '今天' : d.date}
            </button>
          ))}
        </div>
      </div>
      <div className="follow-row">
        {(days[idx]?.episodes ?? []).map((c) => (
          <MiniCard key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}

function LoadMore({ sec }: { sec: SecKey }) {
  const { sections, loadMore } = useStore();
  const st = sections[sec];
  const ref = useRef<HTMLButtonElement>(null);
  const last = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const now = Date.now();
          if (now - last.current < 700) continue;
          last.current = now;
          loadMore(sec);
        }
      },
      { rootMargin: '600px 0px', threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sec, loadMore]);
  if (!st) return null;
  return (
    <button
      className="more"
      ref={ref}
      disabled={st.loading}
      onClick={() => {
        last.current = Date.now();
        loadMore(sec);
      }}
    >
      {st.loading ? '加载中…' : '加载更多'}
    </button>
  );
}

function Messages() {
  const { msg } = useStore();
  if (!msg.items.length && msg.loading) return <StateBox title="正在读取消息…" desc="稍候。" />;
  const counts = msg.counts ?? { reply: 0, at: 0, like: 0, sys: 0 };
  const labels: Record<string, string> = { reply: '回复我的', at: '@ 我的', like: '收到的赞', sys: '系统通知' };
  return (
    <>
      <div className="strip">
        {(['reply', 'at', 'like', 'sys'] as const).map((k) => (
          <div className="cell" key={k}>
            <div className={'n' + (counts[k] ? ' hot' : '')}>{counts[k] ?? 0}</div>
            <div className="l">{labels[k]}</div>
          </div>
        ))}
      </div>
      {!msg.items.length ? (
        <StateBox title="暂无最近消息" desc="有新的回复或 @ 时会出现在这里。" />
      ) : (
        <div>
          {msg.items.map((m) => (
            <MsgRow key={m.id} m={m} />
          ))}
        </div>
      )}
    </>
  );
}

function MsgRow({ m }: { m: MsgItem }) {
  const icon = m.type === 'like' ? 'favorite' : m.type === 'at' ? 'account-circle' : 'notifications';
  return (
    <div className="mrow" onClick={() => (location.href = m.url)}>
      <div className="mi" dangerouslySetInnerHTML={{ __html: iconSvg(icon, 19) }} />
      <div style={{ minWidth: 0 }}>
        <div className="mt">
          {m.from}
          {m.type === 'like' ? ' 赞了你' : m.type === 'at' ? ' @ 了你' : ' 回复了你'}
          {m.title ? '：' + m.title : ''}
        </div>
        <div className="md">{m.text || fmtAgo(m.time)}</div>
      </div>
    </div>
  );
}

function ProfileView() {
  const { profile } = useStore();
  if (!profile.data) {
    if (profile.loading) return <StateBox title="正在读取账号信息…" desc="稍候。" />;
    return (
      <StateBox
        title="还没登录 B 站"
        desc="登录后就能看到你的账号信息。"
        action={{ label: '去登录', onClick: () => (location.href = 'https://passport.bilibili.com/login') }}
      />
    );
  }
  const p = profile.data;
  const links: [string, string][] = [
    ['我的空间', `https://space.bilibili.com/${p.mid}`],
    ['我的动态', 'https://t.bilibili.com/'],
    ['我的收藏', `https://space.bilibili.com/${p.mid}/favlist`],
    ['关注列表', `https://space.bilibili.com/${p.mid}/fans/follow`],
    ['观看历史', 'https://www.bilibili.com/account/history'],
    ['稍后再看', 'https://www.bilibili.com/watchlater/'],
  ];
  return (
    <>
      <div className="profile">
        <div className="pav">
          {p.face && <img loading="lazy" referrerPolicy="no-referrer" src={p.face} />}
        </div>
        <div>
          <div className="pname">{p.name || '未登录'}</div>
          <div className="pmeta">
            <span className="lv">LV{p.level}</span>
            {p.vip && <span className="vip">{p.vipLabel || '大会员'}</span>}
          </div>
        </div>
      </div>
      <div className="pstats">
        <div className="pstat">
          <div className="n">{fmtCount(p.following)}</div>
          <div className="l">关注</div>
        </div>
        <div className="pstat">
          <div className="n">{fmtCount(p.follower)}</div>
          <div className="l">粉丝</div>
        </div>
      </div>
      <div className="plinks">
        {links.map(([label, url]) => (
          <a key={label} className="plink" href={url}>
            {label}
          </a>
        ))}
      </div>
    </>
  );
}

/* ------------------------------- 布局 ------------------------------- */

function Sidebar() {
  const { sec, selectSec, msg, load, onExit } = useStore();
  const unread = msg.counts ? msg.counts.reply + msg.counts.at + msg.counts.like + msg.counts.sys : 0;
  let lastGroup = '';
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="mark" dangerouslySetInnerHTML={{ __html: biliTvSvg(14) }} /> 我的首页
      </div>
      <nav className="nav">
        {SECTIONS.filter((s) => !s.hidden).map((s) => {
          const group = s.group && s.group !== lastGroup ? s.group : null;
          lastGroup = s.group ?? lastGroup;
          return (
            <Fragment key={s.key}>
              {group && <div className="nav-group">{group}</div>}
              <button data-sec={s.key} className={sec === s.key ? 'active' : ''} onClick={() => selectSec(s.key)}>
                <span className="ico" dangerouslySetInnerHTML={{ __html: iconSvg(s.icon, 20) }} />
                <span>{s.label}</span>
                {s.key === 'message' && (
                  <span className="badge" style={{ display: unread > 0 ? '' : 'none' }}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            </Fragment>
          );
        })}
      </nav>
      <div className="side-foot">
        <button onClick={() => void load(sec, true)}>
          <span dangerouslySetInnerHTML={{ __html: iconSvg('refresh', 19) }} /> 刷新
        </button>
        <button onClick={onExit}>
          <span dangerouslySetInnerHTML={{ __html: iconSvg('arrow-back', 19) }} /> 还原首页
        </button>
      </div>
    </aside>
  );
}

function TopBar() {
  const { sec, search, labelOf, doSearch, sections } = useStore();
  const [kw, setKw] = useState(search);
  useEffect(() => setKw(search), [search]);
  const st = sections[sec];
  const title = sec === 'search' ? `搜索：${search}` : labelOf(sec);
  const count = st && st.items.length ? `${st.items.length} 个视频` : '';
  return (
    <div className="top">
      <h2 className="sec-title">{title}</h2>
      <span className="count">{count}</span>
      <span className="sp" />
      <input
        className="search-input"
        type="search"
        placeholder="搜索视频…"
        aria-label="搜索视频"
        value={kw}
        onChange={(e) => setKw(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            doSearch(kw);
          }
        }}
      />
    </div>
  );
}

function Chips() {
  const { pinned, sec, selectSec } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="chips">
        {pinned.map((p) => {
          const key: SecKey = `pin:${p.id}`;
          return (
            <button key={p.id} className={'chip pin' + (sec === key ? ' active' : '')} onClick={() => selectSec(key)}>
              {p.name}
            </button>
          );
        })}
        <button className="chip add" onClick={() => setOpen(true)}>
          ＋ 添加频道
        </button>
      </div>
      {open && <PinDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function PinDialog({ onClose }: { onClose: () => void }) {
  const { pinned, addPin, removePin, movePin } = useStore();
  const pgcItems: PinnedChannel[] = Object.entries(PGC_PRESETS).map(([slug, v]) => ({
    id: `pgc:${slug}`,
    kind: 'pgc',
    name: v.name,
    ref: slug,
    icon: v.icon,
  }));
  const regionItems: PinnedChannel[] = REGION_PRESETS.map((r) => ({
    id: `region:${r.rid}`,
    kind: 'region',
    name: r.name,
    ref: String(r.rid),
  }));
  const Section = ({ title, items }: { title: string; items: PinnedChannel[] }) => (
    <>
      <div className="modal-sub">{title}</div>
      <div className="pin-list">
        {items.map((it) => {
          const on = pinned.some((p) => p.id === it.id);
          return (
            <button
              key={it.id}
              className={'pin-choice' + (on ? ' on' : '')}
              onClick={() => (on ? removePin(it.id) : addPin(it))}
            >
              <span>{it.name}</span>
              <span className="mark">{on ? '已添加' : '＋'}</span>
            </button>
          );
        })}
      </div>
    </>
  );
  return (
    <div
      className="modal-ov"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <h3>添加频道</h3>
          <button className="modal-x" aria-label="关闭" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {pinned.length > 0 && (
            <>
              <div className="modal-sub">已固定（可排序）</div>
              <div className="pin-list">
                {pinned.map((p) => (
                  <div key={p.id} className="pin-choice on manage">
                    <span>{p.name}</span>
                    <span className="pin-ops2">
                      <button title="上移" onClick={() => movePin(p.id, -1)}>
                        ↑
                      </button>
                      <button title="下移" onClick={() => movePin(p.id, 1)}>
                        ↓
                      </button>
                      <button title="移除" onClick={() => removePin(p.id)}>
                        ×
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          <Section title="专题频道" items={pgcItems} />
          <Section title="分区" items={regionItems} />
        </div>
      </div>
    </div>
  );
}

function Toast() {
  const { toast, dismissToast } = useStore();
  if (!toast) return null;
  return (
    <div className={'toast' + (toast.err ? ' err' : '')}>
      <span>{toast.text}</span>
      {toast.action && (
        <button
          className="toast-act"
          onClick={() => {
            toast.action!.onClick();
            dismissToast();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

function SectionContent() {
  const { sec, sections, load } = useStore();
  if (sec === 'message') return <Messages />;
  if (sec === 'profile') return <ProfileView />;
  const st = sections[sec] ?? newSection();
  const hasAny = st.items.length || st.follow.length || st.rank.length || st.column.length || st.timeline.length;
  if (st.loading && !hasAny) return <SkeletonGrid />;
  if (st.error && !hasAny) {
    if (st.error.includes('未登录')) {
      return (
        <StateBox
          title="还没登录 B 站"
          desc="登录后就能看到你的关注、追番和观看记录。"
          action={{ label: '去登录', onClick: () => (location.href = 'https://passport.bilibili.com/login') }}
        />
      );
    }
    return <StateBox title="加载失败" desc={st.error} action={{ label: '重试', ghost: true, onClick: () => void load(sec, true) }} />;
  }
  if (!hasAny) {
    const t =
      sec === 'toview'
        ? '稍后再看是空的'
        : sec === 'history'
          ? '还没有观看记录'
          : sec === 'search'
            ? '没有找到相关视频'
            : '暂时没有新内容';
    return <StateBox title={t} desc="过会儿再回来看看。" />;
  }
  const upd = st.follow.filter((c) => c.pinned).length;
  return (
    <>
      {st.follow.length > 0 && (
        <RowBlock
          title={PGC[sec as StaticKey]?.followTitle ?? '我的追番'}
          items={st.follow}
          badge={upd ? `${upd} 部有更新` : undefined}
        />
      )}
      {st.rank.length > 0 && <RowBlock title={st.rankTitle || '热播榜'} items={st.rank} />}
      {st.timeline.length > 0 && <TimelineBlock days={st.timeline} />}
      {st.column.length > 0 && <RowBlock title={st.columnTitle || '专题'} items={st.column} />}
      {st.items.length > 0 && <Grid items={st.items} />}
      {st.hasMore && <LoadMore sec={sec} />}
    </>
  );
}

export interface HomeAppProps {
  pinned: PinnedChannel[];
  onExit: () => void;
}

export function HomeApp({ pinned, onExit }: HomeAppProps) {
  const store = useHomeStore(pinned, onExit);
  return (
    <StoreProvider value={store}>
      <style>{APP_CSS}</style>
      <div className="app">
        <Sidebar />
        <main className="main">
          <TopBar />
          <Chips />
          <div className="content">
            <SectionContent />
          </div>
        </main>
      </div>
      <Toast />
    </StoreProvider>
  );
}
