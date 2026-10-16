/**
 * 首页数据源（全部只读，复用登录 Cookie）。
 * 推荐 / 关注新视频 / 稍后再看 / 追番 / 追剧 / 历史记录 / 消息。
 */

import { getMixinKey, toQuery, wbiSign } from './wbi';

export interface Card {
  id: string;
  url: string;
  cover: string;
  title: string;
  up?: string;
  /** UP 头像 */
  upFace?: string;
  /** UP 的 mid（用于关注/取关/拉黑） */
  mid?: number;
  /** 推荐流对“不再推荐”所需的字段 */
  aid?: number;
  cid?: number;
  trackId?: string;
  goto?: string;
  /** 右侧次要信息：时长 / 播放量 / 时间 */
  right?: string;
  /** 进度（秒） */
  progress?: number;
  /** 总时长（秒） */
  duration?: number;
  /** 角标：更新至第 N 话 / 会员等 */
  badge?: string;
  /** 是否置顶（如有更新的追番/追剧） */
  pinned?: boolean;
  /** 评分（电视剧/动画频道内容） */
  score?: string;
}

export interface Page<T> {
  items: T[];
  hasMore: boolean;
  cursor?: string;
  total?: number;
}

function https(u?: string): string {
  if (!u) return '';
  if (u.startsWith('//')) return 'https:' + u;
  return u.replace(/^http:/, 'https:');
}

/** 把各种形态的链接（完整 URL / // 开头 / / 开头 / bilibili:// 深链）归一化成 http(s) 链接 */
function normalizeUrl(u?: string): string {
  if (!u) return 'https://message.bilibili.com/';
  const s = u.trim();
  if (/^https?:\/\//i.test(s)) return s; // 已是完整 URL
  if (s.startsWith('//')) return 'https:' + s; // 协议相对
  if (s.startsWith('/')) return 'https://www.bilibili.com' + s; // 站内路径
  if (s.startsWith('bilibili://')) {
    const rest = s.slice('bilibili://'.length).replace(/^\/+/, '');
    const [kind, id] = rest.split('/');
    if (kind === 'video' && id) return `https://www.bilibili.com/video/${id}`;
    if (kind === 'bangumi' && id) return `https://www.bilibili.com/bangumi/play/ep${id}`;
    if ((kind === 'dynamic' || kind === 'opus') && id) return `https://www.bilibili.com/opus/${id}`;
  }
  return 'https://message.bilibili.com/';
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('返回内容不是 JSON（可能被风控拦截）');
  }
}

function assertOk(j: any, what: string): void {
  if (j.code !== 0) {
    if (j.code === -101) throw new Error('未登录');
    throw new Error(`${what}：${j.code} ${j.message ?? ''}`);
  }
}

export function fmtDuration(sec: number): string {
  if (!sec || sec < 0) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function fmtCount(n: number): string {
  if (!n) return '0';
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿';
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return String(n);
}

export function fmtAgo(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() / 1000 - ts;
  if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}天前`;
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ============================ 我自己的 mid ============================ */
let _mid: number | null = null;
export async function getSelfMid(): Promise<number> {
  if (_mid) return _mid;
  const j = await getJson('https://api.bilibili.com/x/web-interface/nav');
  assertOk(j, '获取账号信息失败');
  if (!j.data?.mid) throw new Error('未登录');
  _mid = j.data.mid as number;
  return _mid;
}

/* ============================ 关注的新视频（可翻页） ============================ */
export async function getFollowFeed(offset?: string): Promise<Page<Card>> {
  const q = new URLSearchParams({ type: 'video', timezone_offset: '-480' });
  if (offset) q.set('offset', offset);
  else q.set('page', '1');
  const j = await getJson(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/all?${q}`);
  assertOk(j, '关注动态读取失败');
  const items: Card[] = [];
  for (const it of (j.data?.items ?? []) as any[]) {
    const arch = it?.modules?.module_dynamic?.major?.archive;
    if (!arch?.bvid) continue;
    const author = it?.modules?.module_author ?? {};
    items.push({
      id: arch.bvid,
      url: `https://www.bilibili.com/video/${arch.bvid}`,
      cover: https(arch.cover),
      title: arch.title ?? '',
      up: author.name ?? '',
      upFace: https(author.face),
      mid: author.mid ? Number(author.mid) : undefined,
      aid: arch.aid ? Number(arch.aid) : undefined,
      cid: arch.cid ? Number(arch.cid) : undefined,
      right: `${fmtCount(arch.stat?.play ?? 0)}播放`,
      duration: parseDur(arch.duration_text),
      badge: arch.duration_text || '',
    });
  }
  return { items, hasMore: !!j.data?.has_more, cursor: j.data?.offset };
}

function parseDur(t?: string): number {
  if (!t) return 0;
  const p = t.split(':').map((x) => parseInt(x, 10) || 0);
  return p.length === 3
    ? (p[0] ?? 0) * 3600 + (p[1] ?? 0) * 60 + (p[2] ?? 0)
    : p.length === 2
      ? (p[0] ?? 0) * 60 + (p[1] ?? 0)
      : 0;
}

/* ============================ 首页推荐（WBI 签名，可翻页） ============================ */
export async function getRecommend(freshIdx = 1): Promise<Page<Card>> {
  const fetchPage = async (forceKey: boolean) => {
    const mixinKey = await getMixinKey(forceKey);
    const params = wbiSign(
      {
        web_location: 1430650,
        y_num: 5,
        fresh_type: 4,
        feed_version: 'V8',
        fresh_idx: freshIdx,
        fresh_idx_1h: 1,
        fetch_row: 1,
        brush: 0,
        homepage_ver: 1,
        ps: 12,
        last_showlist: '',
      },
      mixinKey,
    );
    return getJson(`https://api.bilibili.com/x/web-interface/wbi/index/top/feed/rcmd?${toQuery(params)}`);
  };
  let j = await fetchPage(false);
  // WBI 签名失效（跨天/公钥轮换）：强制重取一次
  if (j?.code === -352 || j?.code === -403) j = await fetchPage(true);
  assertOk(j, '推荐读取失败');
  const items: Card[] = [];
  for (const it of (j.data?.item ?? []) as any[]) {
    const url: string = it.uri || (it.bvid ? `https://www.bilibili.com/video/${it.bvid}` : '');
    if (!url) continue;
    items.push({
      id: it.bvid || String(it.id),
      url,
      cover: https(it.pic),
      title: it.title ?? '',
      up: it.owner?.name ?? '',
      upFace: https(it.owner?.face),
      mid: it.owner?.mid ? Number(it.owner.mid) : undefined,
      aid: it.id ? Number(it.id) : undefined,
      cid: it.cid ? Number(it.cid) : undefined,
      trackId: it.track_id || undefined,
      goto: it.goto || undefined,
      right: it.stat?.view != null ? `${fmtCount(it.stat.view)}播放` : '',
      duration: it.duration ?? 0,
      badge: it.rcmd_reason ?? '',
    });
  }
  return { items, hasMore: items.length > 0 };
}

/* ============================ 稍后再看 ============================ */
export async function getWatchLater(): Promise<Card[]> {
  const j = await getJson('https://api.bilibili.com/x/v2/history/toview');
  assertOk(j, '稍后再看读取失败');
  return ((j.data?.list ?? []) as any[]).map((v) => ({
    id: v.bvid,
    url: `https://www.bilibili.com/video/${v.bvid}`,
    cover: https(v.pic),
    title: v.title ?? '',
    up: v.owner?.name ?? '',
    upFace: https(v.owner?.face),
    mid: v.owner?.mid ? Number(v.owner.mid) : undefined,
    aid: v.aid ? Number(v.aid) : undefined,
    cid: v.cid ? Number(v.cid) : undefined,
    right: v.duration ? fmtDuration(v.duration) : '',
    duration: v.duration ?? 0,
    progress: v.progress ?? 0,
  }));
}

/* ============================ 追番 / 追剧 ============================ */
export async function getBangumiFollow(type: 1 | 2, pn = 1): Promise<Page<Card>> {
  const mid = await getSelfMid();
  const j = await getJson(
    `https://api.bilibili.com/x/space/bangumi/follow/list?type=${type}&follow_type=1&pn=${pn}&ps=30&vmid=${mid}`,
  );
  assertOk(j, type === 1 ? '追番读取失败' : '追剧读取失败');
  const list = (j.data?.list ?? []) as any[];
  const items: Card[] = list.map((b) => {
    const newEp: string = b.new_ep?.index_show || '';
    return {
      id: String(b.season_id),
      url: normalizeUrl(b.url || `https://www.bilibili.com/bangumi/play/ss${b.season_id}`),
      cover: https(b.cover),
      title: b.title ?? '',
      up: (b.areas ?? []).map((a: any) => a.name).join(' / '),
      badge: newEp,
      pinned: !!newEp && !/已看完|完结|全集|全\d+话/.test(newEp),
    };
  });
  // 把“有更新”的追番/追剧置顶（保持各自原有相对顺序）
  items.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  const total = j.data?.total ?? list.length;
  return { items, hasMore: pn * 30 < total, total };
}

/* ============================ 动画/电视剧频道内容（官方 /tv/、/anime/ 落地页同源接口） ============================ */
/** seasonType: 1=番剧(动画), 5=电视剧 */
export async function getBangumiIndex(seasonType: number, page = 1): Promise<Page<Card>> {
  const q = new URLSearchParams({
    st: '1',
    order: '2', // 播放数量
    season_version: '-1',
    spoken_language_type: '-1',
    area: '-1',
    is_finish: '-1',
    copyright: '-1',
    season_status: '-1',
    season_type: String(seasonType),
    style_id: '-1',
    sort: '0',
    page: String(page),
    pagesize: '24',
    type: '1',
  });
  const j = await getJson(`https://api.bilibili.com/pgc/season/index/result?${q}`);
  assertOk(j, '频道内容读取失败');
  const d = j.data ?? {};
  const items: Card[] = ((d.list ?? []) as any[]).map((b) => ({
    id: String(b.media_id),
    url: https(b.link),
    cover: https(b.cover),
    title: b.title || b.subTitle || '',
    up: b.subTitle ?? '',
    right: b.order ?? '',
    badge: b.index_show ?? '',
    score: b.score,
    pinned: false,
  }));
  return { items, hasMore: !!d.has_next, total: d.total ?? 0 };
}

/* ============================ 游戏区（排行榜，rid=4；该接口不可翻页） ============================ */
export async function getGameFeed(): Promise<Page<Card>> {
  const j = await getJson('https://api.bilibili.com/x/web-interface/ranking/v2?rid=4&type=all');
  assertOk(j, '游戏区读取失败');
  const list = ((j.data?.list ?? []) as any[]).slice(0, 30);
  const items: Card[] = list.map((v) => ({
    id: v.bvid,
    url: `https://www.bilibili.com/video/${v.bvid}`,
    cover: https(v.pic),
    title: v.title ?? '',
    up: v.owner?.name ?? '',
    upFace: https(v.owner?.face),
    mid: v.owner?.mid ? Number(v.owner.mid) : undefined,
    aid: v.aid ? Number(v.aid) : undefined,
    cid: v.cid ? Number(v.cid) : undefined,
    right: v.stat?.view != null ? `${fmtCount(v.stat.view)}播放` : '',
    duration: v.duration ?? 0,
  }));
  return { items, hasMore: false };
}

/* ==================== 专题页模块（轮播/热播榜/专题/推荐；整页一次返回） ==================== */
export interface ChannelModules {
  rankTitle: string;
  rank: Card[];
  columnTitle: string;
  column: Card[];
}

/** 专题页卡片映射：rank 带名次，column/hot 带运营角标 */
function moduleCard(it: any, i: number, kind: 'rank' | 'column' | 'hot'): Card {
  return {
    id: String(it?.season_id ?? it?.episode_id ?? it?.item_id ?? it?.link ?? `${kind}-${i}`),
    url: normalizeUrl(it?.link),
    cover: https(it?.cover),
    title: it?.title ?? '',
    up: it?.sub_title ?? '',
    score: it?.rating || undefined,
    badge: kind === 'rank' ? it?.rank_tag || `NO.${i + 1}` : it?.img_badge || '',
    pinned: kind === 'rank' && i === 0,
  };
}

/**
 * 拉取专题页版式模块。动画/国创走 `pgc/page/web/v3`，其余走 `v2`。
 * 返回「热播榜」+「专题（无专题时回退为新热推荐）」。
 */
export async function getChannelModules(name: string, v3 = false): Promise<ChannelModules> {
  const path = v3 ? 'pgc/page/web/v3' : 'pgc/page/web/v2';
  const j = await getJson(`https://api.bilibili.com/${path}?name=${encodeURIComponent(name)}`);
  assertOk(j, '专题页读取失败');
  const modules = (j.data?.modules ?? []) as any[];
  const pick = (prefix: string) =>
    modules.find((m) => String(m?.style ?? '').startsWith(prefix));
  const rankMod = pick('web_rank');
  const colMod = pick('web_column') ?? pick('web_hot');
  return {
    rankTitle: rankMod?.title || '热播榜',
    rank: ((rankMod?.items ?? []) as any[]).map((it, i) => moduleCard(it, i, 'rank')),
    columnTitle: colMod?.title || '专题',
    column: ((colMod?.items ?? []) as any[]).map((it, i) => moduleCard(it, i, 'column')),
  };
}

/* ============================ 历史记录（游标翻页） ============================ */
export interface HistoryCursor {
  max: number;
  viewAt: number;
}
export async function getHistory(cursor?: HistoryCursor): Promise<Page<Card> & { next?: HistoryCursor }> {
  const max = cursor?.max ?? 0;
  const viewAt = cursor?.viewAt ?? 0;
  const j = await getJson(
    `https://api.bilibili.com/x/web-interface/history/cursor?ps=30&max=${max}&view_at=${viewAt}&business=&type=all`,
  );
  assertOk(j, '历史记录读取失败');
  const items: Card[] = ((j.data?.list ?? []) as any[]).map((h) => {
    const biz = h.history?.business ?? '';
    let url = '';
    if (h.history?.bvid) url = `https://www.bilibili.com/video/${h.history.bvid}`;
    else if (biz === 'pgc' && h.history?.epid) url = `https://www.bilibili.com/bangumi/play/ep${h.history.epid}`;
    else if (h.history?.oid) url = `https://www.bilibili.com/video/av${h.history.oid}`;
    return {
      id: String(h.kid ?? h.history?.oid ?? Math.random()),
      url,
      cover: https(h.cover),
      title: h.title ?? '',
      up: h.author_name ?? '',
      upFace: https(h.author_face),
      mid: h.author_mid ? Number(h.author_mid) : undefined,
      aid: h.history?.oid ? Number(h.history.oid) : undefined,
      cid: h.history?.cid ? Number(h.history.cid) : undefined,
      right: fmtAgo(h.view_at),
      duration: h.duration ?? 0,
      progress: h.progress ?? 0,
      badge: biz === 'pgc' ? '番剧' : '',
    };
  });
  const c = j.data?.cursor;
  const next: HistoryCursor | undefined = c ? { max: c.max, viewAt: c.view_at } : undefined;
  // 最后一页列表为空，但 cursor 仍会返回：必须靠 items 判空，否则会无限“加载更多”
  return { items, hasMore: items.length > 0 && !!c, next };
}

/* ============================ 关注关系（关注/取关/拉黑） ============================ */
/** relation.attribute: 0 未关注 / 1 悄悄关注 / 2 单向 / 6 互关 / 128 已拉黑 */
function getCsrf(): string {
  const m = document.cookie.match(/(?:^|; )bili_jct=([^;]*)/);
  return m && m[1] ? decodeURIComponent(m[1]) : '';
}

/** act: 1 关注 / 2 取关 / 5 拉黑 / 6 取消拉黑 */
export async function modifyRelation(mid: number, act: 1 | 2 | 5 | 6): Promise<void> {
  const body = new URLSearchParams();
  body.set('fid', String(mid));
  body.set('act', String(act));
  body.set('re_src', '11');
  body.set('gaia_source', 'web');
  body.set('csrf', getCsrf());
  const res = await fetch(
    'https://api.bilibili.com/x/relation/modify?statistics=' +
      encodeURIComponent(JSON.stringify({ appId: 100, platform: 5 })),
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    },
  );
  const j = await res.json();
  if (j.code !== 0) throw new Error(j.message || `code=${j.code}`);
}

/** 首页推荐「不再推荐」/「撤销」：reason_id 1=内容不感兴趣 4=不想看此UP主 */
async function feedbackDislike(url: string, t: Card, reasonId: number): Promise<void> {
  const body = new URLSearchParams();
  const put = (k: string, v: string | number) => body.set(k, String(v));
  put('app_id', 100);
  put('platform', 5);
  put('from_spmid', '');
  put('spmid', '333.1007.0.0');
  put('goto', t.goto || 'av');
  put('id', t.aid ?? 0);
  put('mid', t.mid ?? 0);
  put('track_id', t.trackId ?? '');
  put('feedback_page', 1);
  put('reason_id', reasonId);
  put('csrf', getCsrf());
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const j = await res.json();
  if (j.code !== 0) throw new Error(j.message || `code=${j.code}`);
}

/** 不再推荐 */
export async function dislikeVideo(t: Card, reasonId: number): Promise<void> {
  return feedbackDislike('https://api.bilibili.com/x/web-interface/feedback/dislike', t, reasonId);
}

/** 撤销不再推荐 */
export async function cancelDislike(t: Card, reasonId: number): Promise<void> {
  return feedbackDislike('https://api.bilibili.com/x/web-interface/feedback/dislike/cancel', t, reasonId);
}

/** 批量查询关系态：返回 { mid: attribute } */
export async function getRelationAttrs(mids: number[]): Promise<Record<number, number>> {
  const out: Record<number, number> = {};
  const uniq = [...new Set(mids.filter(Boolean))];
  if (!uniq.length) return out;
  // 分块查询：fids 过多时 URL 会超长导致失败
  const CHUNK = 50;
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const chunk = uniq.slice(i, i + CHUNK);
    const j = await getJson(`https://api.bilibili.com/x/relation/relations?fids=${chunk.join(',')}`);
    if (j.code !== 0) throw new Error(`关系读取失败：${j.code}`);
    const d = j.data;
    const arr: any[] = Array.isArray(d) ? d : Array.isArray(d?.list) ? d.list : Object.values(d ?? {});
    for (const it of arr) {
      const mid = Number(it?.mid ?? it?.fid);
      if (!mid) continue;
      const attr = it?.attribute ?? it?.relation?.attribute ?? 0;
      out[mid] = Number(attr);
    }
  }
  return out;
}

export interface MsgCounts {
  reply: number;
  at: number;
  like: number;
  sys: number;
}
export async function getMessageCounts(): Promise<MsgCounts> {
  const j = await getJson('https://api.bilibili.com/x/msgfeed/unread');
  assertOk(j, '消息数读取失败');
  const d = j.data ?? {};
  return { reply: d.reply ?? 0, at: d.at ?? 0, like: d.like ?? 0, sys: d.sys_msg ?? 0 };
}

export interface MsgItem {
  id: string;
  title: string;
  from: string;
  text: string;
  url: string;
  time: number;
  type: 'reply' | 'at' | 'like';
}
export async function getMessages(): Promise<MsgItem[]> {
  const out: MsgItem[] = [];
  const feed = async (path: string, type: MsgItem['type']) => {
    const j = await getJson(`https://api.bilibili.com/x/msgfeed/${path}?platform=web&build=0&mobi_app=web&pn=1&ps=20`);
    if (j.code !== 0) return;
    for (const m of (j.data?.items ?? []) as any[]) {
      const item = m.item ?? {};
      out.push({
        id: `${type}-${m.id ?? Math.random()}`,
        title: item.title ?? m.title ?? '',
        from: m.user?.nickname ?? '',
        text: (m.item?.source_content ?? m.item?.content ?? '').slice(0, 120),
        url: normalizeUrl(item.uri ?? m.item?.uri),
        time: m.reply_time ?? m.time ?? 0,
        type,
      });
    }
  };
  await Promise.all([feed('reply', 'reply'), feed('at', 'at'), feed('like', 'like')]);
  return out.sort((a, b) => b.time - a.time);
}
