import { iconSvg } from './icons';
import { readMirroredSettings, removeBootAll, removeBootOverlay } from './boot';
import type { PinnedChannel } from './types';
import {
  fmtAgo,
  fmtCount,
  fmtDuration,
  getBangumiFollow,
  getBangumiIndex,
  getChannelModules,
  getFollowFeed,
  getGameFeed,
  getHistory,
  getMessageCounts,
  getMessages,
  getRecommend,
  getRegionRank,
  getRelationAttrs,
  getSelfProfile,
  getTimeline,
  getWatchLater,
  modifyRelation,
  cancelDislike,
  dislikeVideo,
  searchVideos,
  type Card,
  type HistoryCursor,
  type MsgCounts,
  type MsgItem,
  type ProfileData,
  type TimelineDay,
} from './home';

const TAG = '[bpr-home]';

/** 内置（固定）频道 key；自定义 pin 用 `pin:<id>` */
type StaticKey =
  | 'recommend'
  | 'follow'
  | 'toview'
  | 'anime'
  | 'tv'
  | 'doc'
  | 'movie'
  | 'game'
  | 'history'
  | 'message'
  | 'profile'
  | 'search';
type PinKey = `pin:${string}`;
type SecKey = StaticKey | PinKey;

const SECTIONS: { key: StaticKey; label: string; icon: string; group?: string; hidden?: boolean }[] = [
  { key: 'recommend', label: '推荐', icon: 'recommend' },
  { key: 'follow', label: '关注', icon: 'subscriptions' },
  { key: 'toview', label: '稍后再看', icon: 'schedule' },
  { key: 'anime', label: '番剧', icon: 'movie', group: '频道页' },
  { key: 'movie', label: '电影', icon: 'theaters', group: '频道页' },
  { key: 'tv', label: '电视剧', icon: 'live-tv', group: '频道页' },
  { key: 'profile', label: '个人中心', icon: 'account-circle', group: '我的' },
  { key: 'history', label: '历史记录', icon: 'history', group: '我的' },
  { key: 'message', label: '消息', icon: 'notifications', group: '我的' },
  { key: 'search', label: '搜索', icon: 'search', hidden: true },
];

/**
 * PGC 频道配置。
 * seasonType 见 `pgc/season/index/result`；followType 见 `x/space/bangumi/follow/list`
 * （该接口只接受 1=番剧 / 2=电视剧，故纪录片/电影不做“追”列表）。
 */
type PgcCfg = {
  seasonType: number;
  followType?: 1 | 2;
  followTitle?: string;
  page: string;
  v3?: boolean;
  timeline?: string;
};

const PGC: Partial<Record<StaticKey, PgcCfg>> = {
  anime: { seasonType: 1, followType: 1, followTitle: '我的追番', page: 'anime', v3: true, timeline: '1' },
  tv: { seasonType: 5, followType: 2, followTitle: '我的追剧', page: 'tv' },
  doc: { seasonType: 3, page: 'documentary' },
  movie: { seasonType: 2, page: 'movie' },
};

/** 可 pin 的专题频道（PGC slug） */
const PGC_PRESETS: Record<
  string,
  { name: string; seasonType: number; v3?: boolean; timeline?: string; followType?: 1 | 2; icon: string }
> = {
  anime: { name: '番剧', seasonType: 1, v3: true, timeline: '1', icon: 'movie' },
  guochuang: { name: '国创', seasonType: 4, v3: true, icon: 'movie' },
  tv: { name: '电视剧', seasonType: 5, icon: 'live-tv' },
  movie: { name: '电影', seasonType: 2, icon: 'theaters' },
  documentary: { name: '纪录片', seasonType: 3, icon: 'videocam' },
  variety: { name: '综艺', seasonType: 7, icon: 'live-tv' },
};

/** 可 pin 的 UGC 分区（rid） */
const REGION_PRESETS: { rid: number; name: string }[] = [
  { rid: 4, name: '游戏' },
  { rid: 36, name: '知识' },
  { rid: 3, name: '音乐' },
  { rid: 129, name: '舞蹈' },
  { rid: 188, name: '科技' },
  { rid: 160, name: '生活' },
  { rid: 211, name: '美食' },
  { rid: 119, name: '鬼畜' },
  { rid: 5, name: '娱乐' },
  { rid: 181, name: '影视' },
];

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c));

function sanitizePins(v: unknown): PinnedChannel[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: PinnedChannel[] = [];
  for (const raw of v) {
    const x = raw as Partial<PinnedChannel> | null;
    if (!x || typeof x.id !== 'string' || typeof x.ref !== 'string') continue;
    if (x.kind !== 'pgc' && x.kind !== 'region') continue;
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push({ id: x.id, kind: x.kind, name: String(x.name ?? ''), ref: x.ref, icon: x.icon });
  }
  return out;
}

/* ------------------------- 设计令牌 -------------------------
 * 画布白 + 墨黑文字 + 品牌粉作唯一强调色；用细线而非卡片阴影；
 * 卡片是「图像优先 + 频道头像」，不在每张卡上叠柔和阴影与统一圆角。
 */
const VIEW_CSS = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      -webkit-font-smoothing: antialiased; }

  .app { display: flex; min-height: 72vh; background: #fff; color: #0f1115; }
  :focus-visible { outline: 2px solid #fb7299; outline-offset: 2px; border-radius: 6px; }

  /* 侧栏：细线分区，激活项用粉色竖条 */
  .sidebar { width: 216px; flex: 0 0 216px; padding: 18px 12px 24px; border-right: 1px solid #eef0f2;
    position: sticky; top: 0; align-self: flex-start; height: 100vh; overflow-y: auto; }
  .brand { display: flex; align-items: center; gap: 9px; padding: 4px 10px 18px; font-size: 15px; font-weight: 700; letter-spacing: .2px; }
  .brand .mark { width: 22px; height: 22px; border-radius: 7px; background: #fb7299; color: #fff;
    display: flex; align-items: center; justify-content: center; }
  .nav { display: flex; flex-direction: column; gap: 1px; }
  .nav-group { margin: 16px 12px 6px; font-size: 11px; font-weight: 600; letter-spacing: .4px; color: #9aa0a8; }
  .nav button { position: relative; display: flex; align-items: center; gap: 13px; width: 100%;
    border: none; background: transparent; color: #3d4148; font-size: 13.5px; line-height: 1;
    padding: 0 12px; height: 40px; border-radius: 8px; cursor: pointer; text-align: left; }
  .nav button:hover { background: #f5f6f8; }
  .nav button.active { color: #0f1115; font-weight: 600; background: #f5f6f8; }
  .nav button.active::before { content: ''; position: absolute; left: -12px; top: 9px; bottom: 9px; width: 3px; border-radius: 0 3px 3px 0; background: #fb7299; }
  .nav .ico { flex: 0 0 20px; display: flex; color: #6b7178; }
  .nav button.active .ico { color: #fb7299; }
  .nav .badge { margin-left: auto; background: #fb7299; color: #fff; font-size: 11px; font-weight: 600;
    border-radius: 9px; padding: 1px 7px; line-height: 15px; }
  .side-foot { margin-top: 18px; padding-top: 12px; border-top: 1px solid #eef0f2; display: flex; flex-direction: column; gap: 1px; }
  .side-foot button { display: flex; align-items: center; gap: 13px; border: none; background: transparent;
    color: #6b7178; font-size: 13px; padding: 0 12px; height: 38px; border-radius: 8px; cursor: pointer; text-align: left; }
  .side-foot button:hover { background: #f5f6f8; color: #0f1115; }

  /* 首页 tag 栏（只放固定频道） */
  .chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 2px 0 16px; }
  .chips:empty { display: none; }
  .chip { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 6px; border: none; background: #f2f3f5;
    color: #0f1115; font-size: 13px; line-height: 1; padding: 8px 14px; border-radius: 999px; cursor: pointer; white-space: nowrap; }
  .chip:hover { background: #e9ebee; }
  .chip.active { background: #0f1115; color: #fff; }
  .chip.pin::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #fb7299; }
  .chip.pin.active::before { background: #ffb3cd; }
  .chip.add { background: #fff; border: 1px dashed #d6d9dd; color: #6b7178; }
  .chip.add:hover { border-color: #fb7299; color: #fb7299; }

  /* 添加频道弹窗 */
  .modal-ov { position: fixed; inset: 0; z-index: 2147483600; background: rgba(15,17,21,.42);
    display: flex; align-items: center; justify-content: center; }
  .modal { width: 520px; max-width: calc(100vw - 40px); max-height: 76vh; overflow: hidden; background: #fff;
    border-radius: 14px; display: flex; flex-direction: column; box-shadow: 0 16px 48px rgba(0,0,0,.24); }
  .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid #eef0f2; }
  .modal-head h3 { margin: 0; font-size: 15px; font-weight: 650; }
  .modal-x { border: none; background: transparent; font-size: 16px; color: #6b7178; cursor: pointer; }
  .modal-body { padding: 14px 18px 20px; overflow-y: auto; }
  .modal-sub { font-size: 12px; font-weight: 600; color: #9aa0a8; margin: 10px 0 8px; }
  .pin-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .pin-choice { display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid #eef0f2;
    background: #fff; border-radius: 9px; padding: 10px 12px; font-size: 13px; color: #0f1115; cursor: pointer; text-align: left; }
  .pin-choice:hover { border-color: #e0e2e6; background: #fafbfc; }
  .pin-choice.on { border-color: #fb7299; background: #fff5f8; }
  .pin-choice .mark { font-size: 11px; color: #7c828c; }
  .pin-choice.on .mark { color: #fb7299; font-weight: 600; }
  .pin-choice.manage { cursor: default; }
  .pin-ops2 { display: inline-flex; gap: 4px; }
  .pin-ops2 button { width: 24px; height: 24px; border: none; border-radius: 6px; background: #f2f3f5; color: #3d4148;
    font-size: 12px; line-height: 1; cursor: pointer; }
  .pin-ops2 button:hover { background: #fb7299; color: #fff; }

  /* 主区 */
  .main { flex: 1; min-width: 0; padding: 16px 32px 80px; }

  .top { display: flex; align-items: baseline; gap: 12px; margin-bottom: 14px; position: sticky; top: 0;
    background: #fff; padding: 10px 0 12px; z-index: 2; border-bottom: 1px solid transparent; }
  .top.stuck { border-bottom-color: #eef0f2; }
  .top h2 { font-size: 20px; font-weight: 650; margin: 0; letter-spacing: -.2px; }
  .top .count { font-size: 12.5px; color: #7c828c; }
  .top .sp { flex: 1; }
  .search-input { width: 220px; border: 1px solid #eef0f2; background: #f7f8f9; border-radius: 8px;
    padding: 8px 12px; font-size: 13px; color: #0f1115; outline: none; }
  .search-input:focus { border-color: #fb7299; background: #fff; }
  .tbtn { border: none; background: transparent; color: #6b7178; font-size: 12.5px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; border-radius: 8px; }
  .tbtn:hover { background: #f5f6f8; color: #0f1115; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(252px, 1fr)); gap: 26px 20px; }
  .card { display: block; cursor: pointer; }
  .thumb { position: relative; aspect-ratio: 16 / 9; border-radius: 9px; overflow: hidden; background: #eceef1;
    outline: 1px solid rgba(15,17,21,.06); outline-offset: -1px; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block;
    transition: transform .42s cubic-bezier(.2,.7,.2,1); will-change: transform; }
  .card:hover .thumb { outline-color: rgba(15,17,21,.16); }
  .card:hover .thumb img { transform: scale(1.05); }
  /* hover 时浮现的播放按钮：回应「要看」这个动作，不自动播放 */
  .play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    opacity: 0; pointer-events: none; transition: opacity .18s ease; }
  .play span { width: 46px; height: 46px; border-radius: 50%; background: rgba(15,17,21,.55);
    -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px); color: #fff;
    display: flex; align-items: center; justify-content: center;
    transform: scale(.86); transition: transform .24s cubic-bezier(.2,.7,.2,1); }
  .card:hover .play, .card:focus-visible .play { opacity: 1; }
  .card:hover .play span, .card:focus-visible .play span { transform: scale(1); }
  .dur { position: absolute; right: 6px; bottom: 6px; background: rgba(15,17,21,.82); color: #fff;
    font-size: 11px; font-variant-numeric: tabular-nums; padding: 1px 5px; border-radius: 4px; }
  .corner { position: absolute; left: 6px; top: 6px; background: rgba(15,17,21,.78); color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 4px; }
  .corner.hot { background: #fb7299; }
  .score { position: absolute; right: 6px; top: 6px; color: #ff6699; font-size: 12px; font-weight: 700;
    text-shadow: 0 1px 3px rgba(0,0,0,.5); font-variant-numeric: tabular-nums; }
  .prog { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.42); }
  .prog > i { display: block; height: 100%; background: #fb7299; }

  .meta { display: flex; gap: 10px; margin-top: 10px; }
  .avatar { width: 32px; height: 32px; flex: 0 0 32px; border-radius: 50%; overflow: hidden; background: #e9ebee;
    display: flex; align-items: center; justify-content: center; color: #9aa0a8; font-size: 13px; font-weight: 600; }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .txt { min-width: 0; }
  .t { font-size: 13.5px; line-height: 1.42; font-weight: 500; margin: 0 0 3px; letter-spacing: -.1px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .card:hover .t { color: #e14a78; }
  .ch { font-size: 12px; color: #3d4148; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: 12px; color: #7c828c; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* 骨架屏（加载态用结构而非文案） */
  .sk { display: block; }
  .sk .b { background: #eef0f2; border-radius: 9px; animation: bprpulse 1.4s ease-in-out infinite; }
  .sk .thumb-b { aspect-ratio: 16/9; }
  .sk .row { display: flex; gap: 10px; margin-top: 10px; }
  .sk .av-b { width: 32px; height: 32px; border-radius: 50%; flex: 0 0 32px; }
  .sk .lines { flex: 1; }
  .sk .l1 { height: 12px; border-radius: 4px; margin-bottom: 7px; }
  .sk .l2 { height: 11px; border-radius: 4px; width: 55%; }
  @keyframes bprpulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
  @media (prefers-reduced-motion: reduce) {
    .sk .b { animation: none; }
    .thumb img, .mini .mthumb img, .play, .play span, .t { transition: none; }
    .card:hover .thumb img, .mini:hover .mthumb img { transform: none; }
    .card:hover .play span { transform: none; }
  }

  /* 空/错态：直接、可操作 */
  .state { padding: 64px 0; text-align: center; color: #7c828c; font-size: 13.5px; }
  .state .big { color: #0f1115; font-size: 15px; font-weight: 600; margin-bottom: 6px; }
  .state .act { margin-top: 14px; }
  .state .act button { border: none; background: #fb7299; color: #fff; font-size: 13px; font-weight: 600;
    padding: 8px 16px; border-radius: 8px; cursor: pointer; }
  .state .act button.ghost { background: #f5f6f8; color: #0f1115; }

  .more { display: block; margin: 30px auto 0; border: none; background: #f5f6f8; color: #0f1115;
    border-radius: 9px; padding: 10px 26px; font-size: 13px; font-weight: 500; cursor: pointer; }
  .more:hover { background: #eceef1; }
  .more:disabled { opacity: .6; cursor: default; }

  /* 我的追番/追剧：一排、可展开 */
  .follow { margin-bottom: 28px; }
  .follow-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
  .follow-head h3 { font-size: 15px; font-weight: 650; margin: 0; letter-spacing: -.2px; }
  .pin-badge { font-size: 11px; font-weight: 600; color: #fff; background: #fb7299; border-radius: 9px; padding: 1px 8px; }
  .more-btn { margin-left: auto; border: none; background: transparent; color: #6b7178; font-size: 12.5px;
    cursor: pointer; padding: 6px 10px; border-radius: 8px; }
  .more-btn:hover { background: #f5f6f8; color: #0f1115; }
  .follow-row { display: flex; gap: 12px; overflow-x: auto; padding: 2px 0 8px; scrollbar-width: thin; }
  .follow-row.expanded { flex-wrap: wrap; overflow-x: visible; }
  .mini { flex: 0 0 116px; width: 116px; cursor: pointer; }
  .mini:focus-visible { outline: 2px solid #fb7299; outline-offset: 2px; border-radius: 8px; }
  .mini .mthumb { position: relative; aspect-ratio: 3 / 4; border-radius: 8px; overflow: hidden; background: #eceef1;
    outline: 1px solid rgba(15,17,21,.06); outline-offset: -1px; }
  .mini .mthumb img { width: 100%; height: 100%; object-fit: cover; display: block;
    transition: transform .42s cubic-bezier(.2,.7,.2,1); }
  .mini:hover .mthumb img { transform: scale(1.05); }
  .mini .corner { font-size: 10px; padding: 1px 5px; max-width: calc(100% - 12px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mini .mt { font-size: 12px; line-height: 1.35; margin-top: 6px; height: 2.7em; overflow: hidden; color: #0f1115;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .mini:hover .mt { color: #e14a78; }
  .mini .msub { font-size: 11px; line-height: 1.3; margin-top: 2px; color: #7c828c;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* 新番时间表：日期 tab */
  .tl-tabs { margin-left: auto; display: flex; gap: 4px; overflow-x: auto; }
  .tl-tabs button { border: none; background: transparent; color: #6b7178; font-size: 12px; line-height: 1;
    padding: 6px 9px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
  .tl-tabs button:hover { background: #f5f6f8; color: #0f1115; }
  .tl-tabs button.active { background: #fb7299; color: #fff; font-weight: 600; }

  /* 卡片「⋯」菜单：关注 / 取关 / 拉黑 */
  .cmore { position: absolute; right: 5px; top: 5px; width: 26px; height: 26px; border: none; border-radius: 50%;
    background: rgba(15,17,21,.55); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer;
    opacity: 0; pointer-events: none; transition: opacity .15s ease; }
  .card:hover .cmore, .card:focus-within .cmore, .mini:hover .cmore, .mini:focus-within .cmore, .cmore:focus-visible {
    opacity: 1; pointer-events: auto; }
  .cmore:hover { background: rgba(15,17,21,.82); }
  .cmenu { position: fixed; z-index: 2147483600; min-width: 170px; background: #fff; border: 1px solid #eef0f2;
    border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.16); padding: 6px; display: flex; flex-direction: column; gap: 2px; }
  .cmenu button { border: none; background: transparent; text-align: left; padding: 8px 10px; border-radius: 7px;
    font-size: 13px; color: #0f1115; cursor: pointer; white-space: nowrap; }
  .cmenu button:hover { background: #f5f6f8; }
  .cmenu button.cm-danger { color: #e14a78; font-weight: 600; }
  .cm-q { padding: 8px 10px 4px; font-size: 12.5px; color: #7c828c; }
  .toast { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); z-index: 2147483600;
    display: flex; align-items: center; gap: 12px;
    background: rgba(15,17,21,.9); color: #fff; font-size: 13px; padding: 9px 16px; border-radius: 20px; }
  .toast.err { background: #e14a78; }
  .toast-act { border: none; background: transparent; color: #ffb3cd; font-size: 13px; font-weight: 700; cursor: pointer; padding: 0; }
  .toast-act:hover { color: #fff; text-decoration: underline; }

  /* 消息：横向数据条 + 列表，避免四张同款卡片 */
  .strip { display: flex; border: 1px solid #eef0f2; border-radius: 10px; overflow: hidden; margin-bottom: 8px; }
  .strip .cell { flex: 1; padding: 16px 18px; border-right: 1px solid #eef0f2; }
  .strip .cell:last-child { border-right: none; }
  .strip .n { font-size: 22px; font-weight: 650; letter-spacing: -.5px; }
  .strip .n.hot { color: #fb7299; }
  .strip .l { font-size: 12px; color: #7c828c; margin-top: 2px; }
  .mrow { display: flex; gap: 12px; padding: 14px 4px; border-bottom: 1px solid #f2f3f5; cursor: pointer; }
  .mrow:hover { background: #fafbfc; }
  .mrow .mi { flex: 0 0 20px; color: #9aa0a8; padding-top: 2px; }
  .mrow .mt { font-size: 13px; color: #0f1115; margin-bottom: 3px; }
  .mrow .md { font-size: 12px; color: #7c828c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  /* 个人中心 */
  .profile { display: flex; align-items: center; gap: 16px; padding: 22px 0 6px; }
  .pav { width: 72px; height: 72px; flex: 0 0 72px; border-radius: 50%; overflow: hidden; background: #eceef1; }
  .pav img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pname { font-size: 20px; font-weight: 650; letter-spacing: -.2px; }
  .pmeta { display: flex; gap: 8px; margin-top: 7px; }
  .pmeta .lv { font-size: 11px; font-weight: 700; color: #fff; background: #fb7299; border-radius: 4px; padding: 2px 7px; }
  .pmeta .vip { font-size: 11px; font-weight: 700; color: #7a4a00; border-radius: 4px; padding: 2px 7px;
    background: linear-gradient(90deg, #ffe6a8, #ffcf6b); }
  .pstats { display: flex; gap: 44px; margin: 18px 0 6px; padding: 16px 0; border-top: 1px solid #eef0f2; border-bottom: 1px solid #eef0f2; }
  .pstat .n { font-size: 18px; font-weight: 650; font-variant-numeric: tabular-nums; }
  .pstat .l { font-size: 12px; color: #7c828c; margin-top: 2px; }
  .plinks { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
  .plink { font-size: 13px; color: #3d4148; text-decoration: none; background: #f5f6f8; border-radius: 8px; padding: 9px 14px; }
  .plink:hover { background: #eceef1; color: #0f1115; }
`;

const PILL_CSS = `
  :host { all: initial; }
  button { position: fixed; right: 20px; bottom: 90px; z-index: 2147483000; display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border: none; border-radius: 20px; background: #fb7299; color: #fff;
    font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(251,114,153,.5);
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  button:hover { filter: brightness(1.06); }
`;

export interface HomeController {
  activate(): Promise<void>;
  deactivate(): void;
  isActive(): boolean;
  setPinned(list: PinnedChannel[]): void;
}

interface SecState {
  items: Card[];
  /** 追番/追剧（单独一排展示） */
  follow: Card[];
  /** 专题页热播榜 */
  rank: Card[];
  /** 专题页专题/推荐位 */
  column: Card[];
  /** 新番时间表（仅部分频道） */
  timeline: TimelineDay[];
  rankTitle: string;
  columnTitle: string;
  loading: boolean;
  loaded: boolean;
  error: string;
  hasMore: boolean;
  cursor?: string | HistoryCursor;
  page: number;
  total?: number;
}

const newState = (): SecState => ({
  items: [],
  follow: [],
  rank: [],
  column: [],
  timeline: [],
  rankTitle: '',
  columnTitle: '',
  loading: false,
  loaded: false,
  error: '',
  hasMore: true,
  page: 1,
});

/* ------------------------- 会话持久化（同一个 tab 内跨导航） ------------------------- */
const K_SECTION = 'bpr:home:section';
const kCache = (s: SecKey) => `bpr:home:cache:${s}`;
/** 数据缓存有效期（后退回来秒开用；刷新会主动清空重取） */
const CACHE_TTL = 5 * 60 * 1000;

/** 本次导航类型：reload=刷新 / back_forward=前进后退 / navigate=直接进入 */
function navType(): string {
  try {
    const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return e?.type ?? 'navigate';
  } catch {
    return 'navigate';
  }
}
const NAV_TYPE = navType();
const IS_RELOAD = NAV_TYPE === 'reload';

function ssGet(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return null;
  }
}
function ssSet(k: string, v: string): void {
  try {
    sessionStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

function postSetting(key: string, value: unknown) {
  window.postMessage({ __bpr: 'req', id: -Date.now(), cmd: 'setSetting', payload: { key, value } }, location.origin);
}

function avatarEl(c: Card): HTMLElement {
  const a = document.createElement('div');
  a.className = 'avatar';
  if (c.upFace) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = c.upFace;
    img.addEventListener('error', () => (img.replaceWith(document.createTextNode((c.up ?? '?').slice(0, 1)))), { once: true });
    a.appendChild(img);
  } else {
    a.textContent = (c.up ?? '?').slice(0, 1);
  }
  return a;
}

export function createHome(): HomeController {
  let view: HTMLDivElement | null = null;
  let sh: ShadowRoot | null = null;
  let pill: HTMLDivElement | null = null;
  let active = false;
  let sec: SecKey = 'follow';
  let states = new Map<SecKey, SecState>();
  let msgCounts: MsgCounts | null = null;
  let msgItems: MsgItem[] = [];
  let profile: ProfileData | null = null;
  let pinned: PinnedChannel[] = sanitizePins(readMirroredSettings().pinnedChannels);
  let dialogEl: HTMLElement | null = null;
  let searchKeyword = '';
  const expanded = new Set<string>();
  /** mid -> relation.attribute（0 未关注 / 1 悄悄 / 2 单向 / 6 互关 / 128 拉黑） */
  const relations = new Map<number, number>();
  let menuEl: HTMLElement | null = null;
  let toastEl: HTMLElement | null = null;

  let contentEl: HTMLElement | null = null;
  let titleEl: HTMLElement | null = null;
  let countEl: HTMLElement | null = null;
  let topEl: HTMLElement | null = null;
  let moreObserver: IntersectionObserver | null = null;
  let lastAutoLoad = 0;
  /** 时间表当前选中天（仅动画频道用） */
  let timelineDay = 0;

  /* ---------------- pill ---------------- */
  function ensurePill() {
    if (pill || !document.body) return;
    pill = document.createElement('div');
    pill.id = 'bpr-home-pill';
    const ps = pill.attachShadow({ mode: 'open' });
    ps.innerHTML = `<style>${PILL_CSS}</style><button>${iconSvg('favorite', 15)} 我的首页</button>`;
    ps.querySelector('button')!.addEventListener('click', () => (active ? deactivate() : void activate()));
    document.body.appendChild(pill);
    console.log(TAG, 'pill 已注入');
  }

  /* ---------------- 隐藏/还原旧首页 ---------------- */
  const hidden: { el: HTMLElement; prev: string }[] = [];
  function hideOld() {
    for (const sel of ['.bili-feed4', '.feed2', '#i_cement', '.recommended-container_floor_aside']) {
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        if (el.dataset.bprHidden) return;
        hidden.push({ el, prev: el.style.display });
        el.style.setProperty('display', 'none', 'important');
        el.dataset.bprHidden = '1';
      });
    }
  }
  function restoreOld() {
    for (const { el, prev } of hidden) {
      el.style.display = prev;
      delete el.dataset.bprHidden;
    }
    hidden.length = 0;
  }

  /* ---------------- 卡片 ---------------- */
  function cardEl(c: Card): HTMLElement {
    const el = document.createElement('div');
    el.className = 'card';
    el.tabIndex = 0;
    el.setAttribute('role', 'link');
    const go = () => {
      location.href = c.url;
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        go();
      }
    });

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (c.cover) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.src = c.cover;
      thumb.appendChild(img);
    }
    if (c.duration) {
      const d = document.createElement('div');
      d.className = 'dur';
      d.textContent = fmtDuration(c.duration);
      thumb.appendChild(d);
    } else if (c.badge) {
      const b = document.createElement('div');
      b.className = 'corner' + (c.pinned ? ' hot' : '');
      b.textContent = c.badge;
      thumb.appendChild(b);
    }
    if (c.score) {
      const s = document.createElement('div');
      s.className = 'score';
      s.textContent = c.score;
      thumb.appendChild(s);
    }
    if (c.progress && c.duration) {
      const p = document.createElement('div');
      p.className = 'prog';
      const i = document.createElement('i');
      i.style.width = Math.min(100, (c.progress / c.duration) * 100) + '%';
      p.appendChild(i);
      thumb.appendChild(p);
    }
    const play = document.createElement('div');
    play.className = 'play';
    const playDot = document.createElement('span');
    playDot.innerHTML = iconSvg('play-arrow', 26);
    play.appendChild(playDot);
    thumb.appendChild(play);

    const mb = moreButton(c);
    if (mb) thumb.appendChild(mb);

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.appendChild(avatarEl(c));
    const txt = document.createElement('div');
    txt.className = 'txt';
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = c.title;
    const ch = document.createElement('div');
    ch.className = 'ch';
    ch.textContent = c.up ?? '';
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = c.right ?? '';
    txt.append(t, ch, sub);
    meta.appendChild(txt);

    el.append(thumb, meta);
    return el;
  }

  function skeletonGrid(n = 10): HTMLElement {
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (let i = 0; i < n; i++) {
      const sk = document.createElement('div');
      sk.className = 'sk';
      sk.innerHTML = `<div class="b thumb-b"></div>
        <div class="row"><div class="b av-b"></div>
        <div class="lines"><div class="b l1"></div><div class="b l2"></div></div></div>`;
      sk.querySelectorAll('.b').forEach((b) => ((b as HTMLElement).style.animationDelay = `${(i % 5) * 0.08}s`));
      grid.appendChild(sk);
    }
    return grid;
  }

  function stateEl(title: string, desc?: string, action?: { label: string; onClick: () => void; ghost?: boolean }): HTMLElement {
    const d = document.createElement('div');
    d.className = 'state';
    const big = document.createElement('div');
    big.className = 'big';
    big.textContent = title;
    d.appendChild(big);
    if (desc) {
      const p = document.createElement('div');
      p.textContent = desc;
      d.appendChild(p);
    }
    if (action) {
      const wrap = document.createElement('div');
      wrap.className = 'act';
      const b = document.createElement('button');
      if (action.ghost) b.className = 'ghost';
      b.textContent = action.label;
      b.addEventListener('click', action.onClick);
      wrap.appendChild(b);
      d.appendChild(wrap);
    }
    return d;
  }

  function miniCardEl(c: Card): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mini';
    el.tabIndex = 0;
    el.setAttribute('role', 'link');
    const go = () => {
      location.href = c.url;
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        go();
      }
    });

    const thumb = document.createElement('div');
    thumb.className = 'mthumb';
    if (c.cover) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.src = c.cover;
      thumb.appendChild(img);
    }
    if (c.badge) {
      const b = document.createElement('div');
      b.className = 'corner' + (c.pinned ? ' hot' : '');
      b.textContent = c.badge;
      thumb.appendChild(b);
    }
    const mb = moreButton(c);
    if (mb) thumb.appendChild(mb);
    if (c.score) {
      const sc = document.createElement('div');
      sc.className = 'score';
      sc.textContent = c.score;
      thumb.appendChild(sc);
    }
    const t = document.createElement('div');
    t.className = 'mt';
    t.textContent = c.title;
    el.append(thumb, t);
    if (c.up) {
      const sub = document.createElement('div');
      sub.className = 'msub';
      sub.textContent = c.up;
      el.appendChild(sub);
    }
    return el;
  }

  /** 通用横排：标题 + 可选角标 + 展开/收起，卡片复用 miniCardEl */
  function rowBlock(title: string, items: Card[], rowKey: string, badgeText?: string): HTMLElement {
    const key = `${sec}:${rowKey}`;
    const wrap = document.createElement('div');
    wrap.className = 'follow';
    const head = document.createElement('div');
    head.className = 'follow-head';
    const h = document.createElement('h3');
    h.textContent = title;
    head.appendChild(h);
    if (badgeText) {
      const badge = document.createElement('span');
      badge.className = 'pin-badge';
      badge.textContent = badgeText;
      head.appendChild(badge);
    }
    const isExp = expanded.has(key);
    const btn = document.createElement('button');
    btn.className = 'more-btn';
    btn.textContent = isExp ? '收起' : '展开全部';
    btn.addEventListener('click', () => {
      if (isExp) expanded.delete(key);
      else expanded.add(key);
      renderGrid(states.get(sec)!);
    });
    head.appendChild(btn);

    const row = document.createElement('div');
    row.className = 'follow-row' + (isExp ? ' expanded' : '');
    for (const c of items) row.appendChild(miniCardEl(c));

    wrap.append(head, row);
    return wrap;
  }

  function followBlock(st: SecState): HTMLElement {
    const upd = st.follow.filter((c) => c.pinned).length;
    return rowBlock(
      PGC[sec as StaticKey]?.followTitle ?? '我的追番',
      st.follow,
      'follow',
      upd ? `${upd} 部有更新` : undefined,
    );
  }

  /** 新番时间表：日期 tab + 当日剧集横排 */
  function timelineBlock(st: SecState): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'follow';
    const head = document.createElement('div');
    head.className = 'follow-head';
    const h = document.createElement('h3');
    h.textContent = '新番时间表';
    head.appendChild(h);

    const tabs = document.createElement('div');
    tabs.className = 'tl-tabs';
    const body = document.createElement('div');
    body.className = 'follow-row';
    const renderDay = (i: number) => {
      timelineDay = i;
      tabs.querySelectorAll('button').forEach((b, bi) => b.classList.toggle('active', bi === i));
      body.innerHTML = '';
      for (const c of st.timeline[i]?.episodes ?? []) body.appendChild(miniCardEl(c));
    };
    st.timeline.forEach((d, i) => {
      const b = document.createElement('button');
      b.textContent = d.isToday ? '今天' : d.date;
      b.addEventListener('click', () => renderDay(i));
      tabs.appendChild(b);
    });
    head.appendChild(tabs);
    wrap.append(head, body);
    renderDay(Math.min(Math.max(timelineDay, 0), st.timeline.length - 1));
    return wrap;
  }

  function renderGrid(st: SecState) {
    if (!contentEl) return;
    if (titleEl) titleEl.textContent = sec === 'search' ? `搜索：${searchKeyword}` : labelOf(sec);
    if (countEl) countEl.textContent = st.items.length ? `${st.items.length} 个视频` : '';
    contentEl.innerHTML = '';

    const hasAny = st.items.length || st.follow.length || st.rank.length || st.column.length || st.timeline.length;
    if (st.loading && !hasAny) {
      contentEl.appendChild(skeletonGrid());
      return;
    }
    if (st.error && !hasAny) {
      contentEl.appendChild(
        st.error.includes('未登录')
          ? stateEl('还没登录 B 站', '登录后就能看到你的关注、追番和观看记录。', {
              label: '去登录',
              onClick: () => (location.href = 'https://passport.bilibili.com/login'),
            })
          : stateEl('加载失败', st.error, { label: '重试', onClick: () => void loadSec(sec, true), ghost: true }),
      );
      return;
    }
    if (!hasAny) {
      contentEl.appendChild(
        stateEl(sec === 'toview' ? '稍后再看是空的' : sec === 'history' ? '还没有观看记录' : '暂时没有新内容', '过会儿再回来看看。'),
      );
      return;
    }

    if (st.follow.length) {
      contentEl.appendChild(followBlock(st));
    }
    if (st.rank.length) contentEl.appendChild(rowBlock(st.rankTitle || '热播榜', st.rank, 'rank'));
    if (st.timeline.length) contentEl.appendChild(timelineBlock(st));
    if (st.column.length) contentEl.appendChild(rowBlock(st.columnTitle || '专题', st.column, 'column'));

    if (st.items.length) {
      const grid = document.createElement('div');
      grid.className = 'grid';
      for (const c of st.items) grid.appendChild(cardEl(c));
      contentEl.appendChild(grid);
    }

    if (st.hasMore) {
      const more = document.createElement('button');
      more.className = 'more';
      more.dataset.sec = sec;
      more.textContent = st.loading ? '加载中…' : '加载更多';
      more.disabled = st.loading;
      more.addEventListener('click', () => {
        lastAutoLoad = Date.now();
        void loadSec(sec, false);
      });
      contentEl.appendChild(more);
      observeMore(more);
    } else {
      moreObserver?.disconnect();
    }
  }

  /** 自动加载：接近底部时触发；节流 + 守卫，避免频繁/重复请求 */
  function observeMore(el: HTMLElement) {
    if (!moreObserver) {
      moreObserver = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const key = (e.target as HTMLElement).dataset.sec as SecKey | undefined;
            if (!key || key !== sec) continue; // 只处理当前栏
            const st = states.get(key);
            if (!st || st.loading || !st.hasMore || st.error) continue; // 守卫
            const now = Date.now();
            if (now - lastAutoLoad < 700) continue; // 节流：最快 700ms 一次
            lastAutoLoad = now;
            void loadSec(key, false);
          }
        },
        { rootMargin: '600px 0px', threshold: 0 },
      );
    } else {
      moreObserver.disconnect();
    }
    moreObserver.observe(el);
  }

  /** 卡片的「⋯」按钮（仅当有 UP mid 时） */
  function moreButton(c: Card): HTMLElement | null {
    if (!c.mid) return null;
    const b = document.createElement('button');
    b.className = 'cmore';
    b.title = '关注 / 拉黑';
    b.setAttribute('aria-haspopup', 'menu');
    b.setAttribute('aria-label', '更多操作');
    b.innerHTML = iconSvg('more-vert', 16);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      openMenu(b, c);
    });
    return b;
  }

  async function loadRelations(cards: Card[]) {
    const mids = cards.map((c) => c.mid).filter((m): m is number => !!m && !relations.has(m));
    if (!mids.length) return;
    try {
      const attrs = await getRelationAttrs(mids);
      for (const [k, v] of Object.entries(attrs)) relations.set(Number(k), v as number);
    } catch {
      /* 未登录等，忽略 */
    }
  }

  function outsideClick(e: MouseEvent) {
    if (menuEl && !e.composedPath().includes(menuEl)) closeMenu();
  }
  function closeMenu() {
    window.removeEventListener('click', outsideClick, true);
    menuEl?.remove();
    menuEl = null;
  }

  function openMenu(anchor: HTMLElement, c: Card) {
    closeMenu();
    if (!c.mid || !sh) return;
    const attr = relations.get(c.mid);
    const blocked = attr === 128;
    const following = attr === 1 || attr === 2 || attr === 6;

    const menu = document.createElement('div');
    menu.className = 'cmenu';
    const add = (label: string, danger: boolean, fn: () => void) => {
      const b = document.createElement('button');
      if (danger) b.className = 'cm-danger';
      b.textContent = label;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      menu.appendChild(b);
    };
    add('打开 UP 空间', false, () => {
      closeMenu();
      location.href = `https://space.bilibili.com/${c.mid}`;
    });
    add('打开视频', false, () => { closeMenu(); location.href = c.url; });
    if (following) add(`取消关注${c.up ? ' ' + c.up : ''}`, false, () => void doAction(c, 2, `已取消关注 ${c.up ?? ''}`));
    else add(`关注${c.up ? ' ' + c.up : ''}`, false, () => void doAction(c, 1, `已关注 ${c.up ?? ''}`));
    if (blocked) add('取消拉黑', false, () => void doAction(c, 6, `已取消拉黑 ${c.up ?? ''}`));
    else add('拉黑 UP', true, () => confirmBlock(menu, c));
    if (c.trackId) add('不再推荐', false, () => confirmDislike(menu, c, anchor.closest('.card, .mini') as HTMLElement | null));

    sh.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8));
    const top = Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menuEl = menu;

    setTimeout(() => {
      window.addEventListener('click', outsideClick, true);
      window.addEventListener('scroll', closeMenu, { passive: true, once: true });
    }, 0);
  }

  function confirmBlock(menu: HTMLElement, c: Card) {
    menu.innerHTML = '';
    const q = document.createElement('div');
    q.className = 'cm-q';
    q.textContent = `确认拉黑 ${c.up || '该 UP'}？`;
    menu.appendChild(q);
    const yes = document.createElement('button');
    yes.className = 'cm-danger';
    yes.textContent = '确认拉黑';
    yes.addEventListener('click', (e) => {
      e.stopPropagation();
      void doAction(c, 5, `已拉黑 ${c.up ?? ''}`);
    });
    const no = document.createElement('button');
    no.textContent = '取消';
    no.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
    });
    menu.append(yes, no);
  }

  function confirmDislike(menu: HTMLElement, c: Card, cardEl: HTMLElement | null) {
    menu.innerHTML = '';
    const q = document.createElement('div');
    q.className = 'cm-q';
    q.textContent = '不再推荐：';
    menu.appendChild(q);
    const reason = (label: string, id: number) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        void doDislike(c, id, cardEl);
      });
      menu.appendChild(b);
    };
    reason('内容不感兴趣', 1);
    reason('不想看此 UP 主', 4);
    const no = document.createElement('button');
    no.textContent = '取消';
    no.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenu();
    });
    menu.appendChild(no);
  }

  async function doDislike(c: Card, reasonId: number, cardEl: HTMLElement | null) {
    closeMenu();
    try {
      await dislikeVideo(c, reasonId);
      if (cardEl) cardEl.style.display = 'none';
      toast('已减少此类推荐', false, {
        label: '撤销',
        onClick: async () => {
          try {
            await cancelDislike(c, reasonId);
            if (cardEl) cardEl.style.display = '';
            toast('已撤销', false);
          } catch (e) {
            toast('撤销失败：' + (e instanceof Error ? e.message : String(e)), true);
          }
        },
      });
    } catch (e) {
      toast('操作失败：' + (e instanceof Error ? e.message : String(e)), true);
    }
  }

  async function doAction(c: Card, act: 1 | 2 | 5 | 6, okMsg: string) {
    if (!c.mid) return;
    closeMenu();
    try {
      await modifyRelation(c.mid, act);
      relations.set(c.mid, act === 1 ? 2 : act === 5 ? 128 : 0);
      toast(okMsg, false);
    } catch (e) {
      toast('操作失败：' + (e instanceof Error ? e.message : String(e)), true);
    }
  }

  function toast(text: string, err: boolean, action?: { label: string; onClick: () => void }) {
    if (!sh) return;
    toastEl?.remove();
    const t = document.createElement('div');
    t.className = 'toast' + (err ? ' err' : '');
    const span = document.createElement('span');
    span.textContent = text;
    t.appendChild(span);
    if (action) {
      const btn = document.createElement('button');
      btn.className = 'toast-act';
      btn.textContent = action.label;
      btn.addEventListener('click', () => {
        action.onClick();
        t.remove();
        if (toastEl === t) toastEl = null;
      });
      t.appendChild(btn);
    }
    sh.appendChild(t);
    toastEl = t;
    setTimeout(() => {
      t.remove();
      if (toastEl === t) toastEl = null;
    }, action ? 5200 : 2400);
  }

  function renderMessages() {
    if (!contentEl) return;
    if (titleEl) titleEl.textContent = '消息';
    if (countEl) countEl.textContent = '';
    contentEl.innerHTML = '';
    const mst = states.get('message');
    if (!msgItems.length && mst?.loading) {
      contentEl.appendChild(stateEl('正在读取消息…', '稍候。'));
      return;
    }
    const counts = msgCounts ?? { reply: 0, at: 0, like: 0, sys: 0 };
    const labels: Record<string, string> = { reply: '回复我的', at: '@ 我的', like: '收到的赞', sys: '系统通知' };
    const strip = document.createElement('div');
    strip.className = 'strip';
    (['reply', 'at', 'like', 'sys'] as const).forEach((k) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const n = document.createElement('div');
      n.className = 'n' + (counts[k] ? ' hot' : '');
      n.textContent = String(counts[k] ?? 0);
      const l = document.createElement('div');
      l.className = 'l';
      l.textContent = labels[k] ?? '';
      cell.append(n, l);
      strip.appendChild(cell);
    });
    contentEl.appendChild(strip);

    if (!msgItems.length) {
      contentEl.appendChild(stateEl('暂无最近消息', '有新的回复或 @ 时会出现在这里。'));
      return;
    }
    const list = document.createElement('div');
    for (const m of msgItems) {
      const row = document.createElement('div');
      row.className = 'mrow';
      row.addEventListener('click', () => {
        location.href = m.url;
      });
      const ic = document.createElement('div');
      ic.className = 'mi';
      ic.innerHTML = iconSvg(m.type === 'like' ? 'favorite' : m.type === 'at' ? 'account-circle' : 'notifications', 19);
      const b = document.createElement('div');
      b.style.minWidth = '0';
      const mt = document.createElement('div');
      mt.className = 'mt';
      mt.textContent = `${m.from}${m.type === 'like' ? ' 赞了你' : m.type === 'at' ? ' @ 了你' : ' 回复了你'}${m.title ? '：' + m.title : ''}`;
      const md = document.createElement('div');
      md.className = 'md';
      md.textContent = m.text || fmtAgo(m.time);
      b.append(mt, md);
      row.append(ic, b);
      list.appendChild(row);
    }
    contentEl.appendChild(list);
  }

  function renderProfile() {
    if (!contentEl) return;
    if (titleEl) titleEl.textContent = '个人中心';
    if (countEl) countEl.textContent = '';
    contentEl.innerHTML = '';
    const st = states.get('profile');
    if (!profile) {
      contentEl.appendChild(
        st?.loading
          ? stateEl('正在读取账号信息…', '稍候。')
          : stateEl('还没登录 B 站', '登录后就能看到你的账号信息。', {
              label: '去登录',
              onClick: () => (location.href = 'https://passport.bilibili.com/login'),
            }),
      );
      return;
    }
    const p = profile;
    const card = document.createElement('div');
    card.className = 'profile';
    const av = document.createElement('div');
    av.className = 'pav';
    if (p.face) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.src = p.face;
      av.appendChild(img);
    }
    const info = document.createElement('div');
    const nm = document.createElement('div');
    nm.className = 'pname';
    nm.textContent = p.name || '未登录';
    const meta = document.createElement('div');
    meta.className = 'pmeta';
    const lv = document.createElement('span');
    lv.className = 'lv';
    lv.textContent = `LV${p.level}`;
    meta.appendChild(lv);
    if (p.vip) {
      const vip = document.createElement('span');
      vip.className = 'vip';
      vip.textContent = p.vipLabel || '大会员';
      meta.appendChild(vip);
    }
    info.append(nm, meta);
    card.append(av, info);

    const stats = document.createElement('div');
    stats.className = 'pstats';
    ([['关注', p.following], ['粉丝', p.follower]] as [string, number][]).forEach(([l, n]) => {
      const c = document.createElement('div');
      c.className = 'pstat';
      const nEl = document.createElement('div');
      nEl.className = 'n';
      nEl.textContent = fmtCount(n);
      const lEl = document.createElement('div');
      lEl.className = 'l';
      lEl.textContent = l;
      c.append(nEl, lEl);
      stats.appendChild(c);
    });

    const links = document.createElement('div');
    links.className = 'plinks';
    const go = (label: string, url: string) => {
      const a = document.createElement('a');
      a.className = 'plink';
      a.href = url;
      a.textContent = label;
      links.appendChild(a);
    };
    go('我的空间', `https://space.bilibili.com/${p.mid}`);
    go('我的动态', 'https://t.bilibili.com/');
    go('我的收藏', `https://space.bilibili.com/${p.mid}/favlist`);
    go('关注列表', `https://space.bilibili.com/${p.mid}/fans/follow`);
    go('观看历史', 'https://www.bilibili.com/account/history');
    go('稍后再看', 'https://www.bilibili.com/watchlater/');

    contentEl.append(card, stats, links);
  }

  /* ---------------- 持久化 ---------------- */
  function saveCache(key: SecKey) {
    const st = states.get(key);
    if (!st || (!st.items.length && !st.follow.length)) return;
    ssSet(
      kCache(key),
      JSON.stringify({ items: st.items, follow: st.follow, rank: st.rank, column: st.column, timeline: st.timeline, rankTitle: st.rankTitle, columnTitle: st.columnTitle, cursor: st.cursor ?? null, hasMore: st.hasMore, page: st.page, total: st.total ?? 0, ts: Date.now() }),
    );
  }
  function restoreCache(): void {
    for (const { key } of SECTIONS) {
      const raw = ssGet(kCache(key));
      if (!raw) continue;
      try {
        const c = JSON.parse(raw);
        if (!c || Date.now() - (c.ts ?? 0) > CACHE_TTL || (!c.items?.length && !c.rank?.length && !c.column?.length && !c.timeline?.length)) continue;
        states.set(key, { items: c.items, follow: c.follow ?? [], rank: c.rank ?? [], column: c.column ?? [], timeline: c.timeline ?? [], rankTitle: c.rankTitle ?? '', columnTitle: c.columnTitle ?? '', cursor: c.cursor ?? undefined, hasMore: !!c.hasMore, page: c.page ?? 1, total: c.total ?? 0, loading: false, loaded: true, error: '' });
      } catch {
        /* ignore */
      }
    }
  }
  /* ---------------- 数据加载 ---------------- */
  async function loadPgcInto(st: SecState, cfg: PgcCfg, reset: boolean) {
    if (!reset) {
      const idx = await getBangumiIndex(cfg.seasonType, st.page);
      st.items.push(...idx.items);
      st.hasMore = idx.hasMore;
      st.page += 1;
      return;
    }
    const followP: Promise<{ items: Card[] }> = cfg.followType
      ? getBangumiFollow(cfg.followType, 1).catch(() => ({ items: [] as Card[] }))
      : Promise.resolve({ items: [] as Card[] });
    const timelineP: Promise<TimelineDay[]> = cfg.timeline
      ? getTimeline(cfg.timeline).catch(() => [] as TimelineDay[])
      : Promise.resolve([] as TimelineDay[]);
    const [follow, idx, mods, timeline] = await Promise.all([
      followP,
      getBangumiIndex(cfg.seasonType, 1),
      getChannelModules(cfg.page, cfg.v3).catch(() => ({
        rankTitle: '',
        rank: [] as Card[],
        columnTitle: '',
        column: [] as Card[],
      })),
      timelineP,
    ]);
    st.follow = follow.items;
    st.items = idx.items;
    st.hasMore = idx.hasMore;
    st.rank = mods.rank;
    st.rankTitle = mods.rankTitle;
    st.column = mods.column;
    st.columnTitle = mods.columnTitle;
    st.timeline = timeline;
    st.page = 2;
  }

  async function loadPinInto(st: SecState, p: PinnedChannel, reset: boolean) {
    if (p.kind === 'region') {
      if (!reset) return;
      st.items = await getRegionRank(Number(p.ref));
      st.hasMore = false;
      return;
    }
    const preset = PGC_PRESETS[p.ref];
    if (!preset) throw new Error('未知频道');
    await loadPgcInto(
      st,
      { seasonType: preset.seasonType, page: p.ref, v3: preset.v3, timeline: preset.timeline, followType: preset.followType },
      reset,
    );
  }

  async function loadSec(key: SecKey, reset: boolean) {
    const st = ensureState(key);
    if (st.loading) return;
    if (reset) {
      // SWR：保留已有内容用于即时渲染，成功后再替换；仅重置分页游标
      st.page = 1;
      st.cursor = undefined;
      st.hasMore = true;
      st.error = '';
    }
    st.loading = true;
    if (key === sec) {
      if (key === 'message') renderMessages();
      else if (key === 'profile') renderProfile();
      else renderGrid(st);
    }

    try {
      if (key === 'recommend') {
        const p = await getRecommend(st.page);
        if (reset) st.items = [];
        st.items.push(...p.items);
        st.hasMore = p.hasMore;
        st.page += 1;
      } else if (key === 'follow') {
        const p = await getFollowFeed(reset ? undefined : (st.cursor as string | undefined));
        if (reset) st.items = [];
        st.items.push(...p.items);
        st.hasMore = p.hasMore;
        st.cursor = p.cursor;
      } else if (key === 'toview') {
        st.hasMore = false;
        if (reset) st.items = await getWatchLater();
      } else if (key.startsWith('pin:')) {
        const p = pinned.find((x) => `pin:${x.id}` === key);
        if (!p) throw new Error('频道已移除');
        await loadPinInto(st, p, reset);
      } else if (PGC[key as StaticKey]) {
        await loadPgcInto(st, PGC[key as StaticKey]!, reset);
      } else if (key === 'game') {
        if (reset) {
          const p = await getGameFeed();
          st.items = p.items;
          st.hasMore = false;
        }
      } else if (key === 'history') {
        const p = await getHistory(reset ? undefined : (st.cursor as HistoryCursor | undefined));
        if (reset) st.items = [];
        st.items.push(...p.items);
        st.hasMore = p.hasMore;
        st.cursor = p.next;
      } else if (key === 'message') {
        if (reset) {
          const [counts, items] = await Promise.all([
            getMessageCounts().catch(() => null),
            getMessages().catch(() => []),
          ]);
          if (counts) msgCounts = counts; // 拉取失败时保留原角标，不清零
          msgItems = items;
        }
      } else if (key === 'profile') {
        if (reset) profile = await getSelfProfile();
      } else if (key === 'search') {
        const p = await searchVideos(searchKeyword, st.page);
        if (reset) st.items = [];
        st.items.push(...p.items);
        st.hasMore = p.hasMore;
        st.page += 1;
      }
      st.loaded = true;
      saveCache(key);
    } catch (e) {
      st.error = e instanceof Error ? e.message : String(e);
      console.error(TAG, key, 'failed', st.error);
    } finally {
      st.loading = false;
    }

    if (key === 'message') {
      updateBadge();
      if (key === sec) renderMessages();
    } else if (key === 'profile') {
      if (key === sec) renderProfile();
    } else {
      void loadRelations([...st.follow, ...st.items]);
      if (key === sec) renderGrid(st);
    }
  }

  function doSearch(raw: string) {
    const kw = raw.trim();
    if (!kw) return;
    searchKeyword = kw;
    states.set('search', newState());
    selectSec('search');
  }

  function selectSec(key: SecKey) {
    sec = key;
    if (key !== 'search') ssSet(K_SECTION, key);
    if (!sh) return;
    sh.querySelectorAll('[data-sec]').forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.sec === key));
    if (titleEl) titleEl.textContent = labelOf(key);
    const st = ensureState(key);
    // 先用现有内容即时渲染，再后台刷新（SWR）；无内容时交给 loadSec 显示骨架屏
    if (key === 'message') {
      if (st.loaded || msgItems.length) renderMessages();
    } else if (key === 'profile') {
      if (st.loaded || profile) renderProfile();
    } else if (st.loaded || st.items.length || st.follow.length) {
      renderGrid(st);
    }
    if (!st.loading) void loadSec(key, true);
    // 不保留滚动：切栏和返回都回到顶部
    window.scrollTo(0, 0);
  }

  /* ---------------- 自定义固定频道 ---------------- */
  const navKeys = (): SecKey[] => [
    ...SECTIONS.map((s) => s.key),
    ...pinned.map((p) => `pin:${p.id}` as SecKey),
  ];

  function ensureState(key: SecKey): SecState {
    let st = states.get(key);
    if (!st) {
      st = newState();
      states.set(key, st);
    }
    return st;
  }

  function labelOf(key: SecKey): string {
    const s = SECTIONS.find((x) => x.key === key);
    if (s) return s.label;
    const p = pinned.find((x) => `pin:${x.id}` === key);
    return p?.name ?? '频道';
  }

  /** 侧栏：仅基础功能（固定 pin 在首页 tag 栏） */
  function renderNav() {
    const nav = sh?.querySelector('.nav') as HTMLElement | null;
    if (!nav) return;
    nav.innerHTML = '';
    let lastGroup = '';
    for (const s of SECTIONS) {
      if (s.hidden) continue;
      if (s.group && s.group !== lastGroup) {
        const g = document.createElement('div');
        g.className = 'nav-group';
        g.textContent = s.group;
        nav.appendChild(g);
        lastGroup = s.group;
      }
      nav.appendChild(navItem(s.key, s.label, s.icon));
    }
    updateBadge();
  }

  function navItem(key: SecKey, label: string, icon: string): HTMLElement {
    const b = document.createElement('button');
    b.dataset.sec = key;
    if (key === sec) b.classList.add('active');
    b.innerHTML = `<span class="ico">${iconSvg(icon, 20)}</span><span>${esc(label)}</span><span class="badge" style="display:none"></span>`;
    b.addEventListener('click', () => selectSec(key));
    return b;
  }

  /** 首页 tag 栏：只放固定频道 + 添加 */
  function renderChips() {
    const bar = sh?.querySelector('.chips') as HTMLElement | null;
    if (!bar) return;
    bar.innerHTML = '';
    for (const p of pinned) {
      const key: SecKey = `pin:${p.id}`;
      const b = document.createElement('button');
      b.className = 'chip pin' + (key === sec ? ' active' : '');
      b.dataset.sec = key;
      b.textContent = p.name;
      b.addEventListener('click', () => selectSec(key));
      bar.appendChild(b);
    }
    const add = document.createElement('button');
    add.className = 'chip add';
    add.textContent = '＋ 添加频道';
    add.addEventListener('click', openPinDialog);
    bar.appendChild(add);
  }

  function persistPins() {
    postSetting('pinnedChannels', pinned);
  }

  function setPinned(list: PinnedChannel[]) {
    pinned = sanitizePins(list);
    for (const p of pinned) ensureState(`pin:${p.id}` as SecKey);
    if (active) {
      renderChips();
      if (!navKeys().includes(sec)) selectSec('follow');
    }
  }

  function addPin(p: PinnedChannel) {
    if (pinned.some((x) => x.id === p.id)) return;
    pinned = [...pinned, p];
    persistPins();
    ensureState(`pin:${p.id}` as SecKey);
    renderChips();
    refreshPinDialog();
  }

  function removePin(id: string) {
    const key: SecKey = `pin:${id}`;
    pinned = pinned.filter((p) => p.id !== id);
    states.delete(key);
    persistPins();
    renderChips();
    if (sec === key) selectSec('follow');
    refreshPinDialog();
  }

  function movePin(id: string, dir: number) {
    const i = pinned.findIndex((p) => p.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= pinned.length) return;
    const a = pinned[i]!;
    const b = pinned[j]!;
    pinned[i] = b;
    pinned[j] = a;
    persistPins();
    renderChips();
    refreshPinDialog();
  }

  function openPinDialog() {
    if (!sh) return;
    closePinDialog();
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    const box = document.createElement('div');
    box.className = 'modal';
    box.innerHTML = `<div class="modal-head"><h3>添加频道</h3><button class="modal-x" aria-label="关闭">✕</button></div><div class="modal-body"></div>`;
    ov.appendChild(box);
    ov.addEventListener('click', (e) => {
      if (e.target === ov) closePinDialog();
    });
    box.querySelector('.modal-x')!.addEventListener('click', closePinDialog);
    sh.appendChild(ov);
    dialogEl = ov;
    refreshPinDialog();
  }

  function refreshPinDialog() {
    if (!dialogEl) return;
    const body = dialogEl.querySelector('.modal-body') as HTMLElement | null;
    if (!body) return;
    body.innerHTML = '';
    if (pinned.length) {
      const h = document.createElement('div');
      h.className = 'modal-sub';
      h.textContent = '已固定（可排序）';
      body.appendChild(h);
      const list = document.createElement('div');
      list.className = 'pin-list';
      pinned.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'pin-choice on manage';
        const nm = document.createElement('span');
        nm.textContent = p.name;
        const ops = document.createElement('span');
        ops.className = 'pin-ops2';
        const mk = (txt: string, title: string, fn: () => void) => {
          const o = document.createElement('button');
          o.textContent = txt;
          o.title = title;
          o.addEventListener('click', fn);
          ops.appendChild(o);
        };
        mk('↑', '上移', () => movePin(p.id, -1));
        mk('↓', '下移', () => movePin(p.id, 1));
        mk('×', '移除', () => removePin(p.id));
        row.append(nm, ops);
        list.appendChild(row);
      });
      body.appendChild(list);
    }
    const section = (title: string, items: PinnedChannel[]) => {
      const h = document.createElement('div');
      h.className = 'modal-sub';
      h.textContent = title;
      body.appendChild(h);
      const list = document.createElement('div');
      list.className = 'pin-list';
      for (const it of items) {
        const on = pinned.some((p) => p.id === it.id);
        const row = document.createElement('button');
        row.className = 'pin-choice' + (on ? ' on' : '');
        row.innerHTML = `<span>${esc(it.name)}</span><span class="mark">${on ? '已添加' : '＋'}</span>`;
        row.addEventListener('click', () => {
          if (on) removePin(it.id);
          else addPin(it);
        });
        list.appendChild(row);
      }
      body.appendChild(list);
    };
    section(
      '专题频道',
      Object.entries(PGC_PRESETS).map(([slug, v]) => ({
        id: `pgc:${slug}`,
        kind: 'pgc' as const,
        name: v.name,
        ref: slug,
        icon: v.icon,
      })),
    );
    section(
      '分区',
      REGION_PRESETS.map((r) => ({
        id: `region:${r.rid}`,
        kind: 'region' as const,
        name: r.name,
        ref: String(r.rid),
      })),
    );
  }

  function closePinDialog() {
    dialogEl?.remove();
    dialogEl = null;
  }

  /* ---------------- 构建 ---------------- */
  function build() {
    sh!.innerHTML = `<style>${VIEW_CSS}</style>
      <div class="app">
        <aside class="sidebar">
          <div class="brand"><span class="mark">${iconSvg('play-arrow', 15)}</span> 我的首页</div>
          <nav class="nav"></nav>
          <div class="side-foot">
            <button data-act="refresh">${iconSvg('refresh', 19)} 刷新</button>
            <button data-act="close">${iconSvg('arrow-back', 19)} 还原首页</button>
          </div>
        </aside>
        <main class="main">
          <div class="top">
            <h2 class="sec-title">关注</h2>
            <span class="count"></span>
            <span class="sp"></span>
            <input class="search-input" type="search" placeholder="搜索视频…" aria-label="搜索视频" />
            <button class="tbtn" data-act="bili">${iconSvg('open-in-new', 15)} 打开 B 站</button>
          </div>
          <div class="chips"></div>
          <div class="content"></div>
        </main>
      </div>`;

    renderNav();
    renderChips();
    titleEl = sh!.querySelector('.sec-title') as HTMLElement;
    countEl = sh!.querySelector('.count') as HTMLElement;
    contentEl = sh!.querySelector('.content') as HTMLElement;
    topEl = sh!.querySelector('.top') as HTMLElement;

    sh!.querySelector('[data-act="refresh"]')!.addEventListener('click', () => void loadSec(sec, true));
    sh!.querySelector('[data-act="close"]')!.addEventListener('click', () => {
      postSetting('homepageEnabled', false);
      deactivate();
    });
    sh!.querySelector('[data-act="bili"]')!.addEventListener('click', () => deactivate());
    const searchInput = sh!.querySelector('.search-input') as HTMLInputElement;
    searchInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault();
        doSearch(searchInput.value);
      }
    });
    updateBadge();
  }

  function updateBadge() {
    const b = sh?.querySelector('.nav [data-sec="message"] .badge') as HTMLElement | null;
    if (!b) return;
    const n = msgCounts ? msgCounts.reply + msgCounts.at + msgCounts.like + msgCounts.sys : 0;
    b.textContent = n > 99 ? '99+' : String(n);
    b.style.display = n > 0 ? '' : 'none';
  }

  function onScroll() {
    if (topEl) topEl.classList.toggle('stuck', window.scrollY > 4);
  }

  async function activate() {
    if (active) return;
    active = true;
    console.log(TAG, 'activate | nav =', NAV_TYPE, IS_RELOAD ? '(刷新，清缓存)' : '(用缓存)');
    hideOld();
    view = document.createElement('div');
    view.id = 'bpr-home';
    sh = view.attachShadow({ mode: 'open' });
    build();
    document.body.appendChild(view);
    if (pill) pill.style.display = 'none';
    removeBootOverlay();

    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.addEventListener('scroll', onScroll, { passive: true });

    states = new Map<SecKey, SecState>(SECTIONS.map((s) => [s.key, newState()] as [SecKey, SecState]));
    for (const p of pinned) states.set(`pin:${p.id}` as SecKey, newState());
    if (IS_RELOAD) {
      // 刷新：清空数据缓存，重新拉取
      for (const { key } of SECTIONS) {
        try {
          sessionStorage.removeItem(kCache(key));
        } catch {
          /* ignore */
        }
      }
      console.log(TAG, 'reload：清空数据缓存，重新拉取');
    } else {
      restoreCache();
    }
    const savedSec = ssGet(K_SECTION) as SecKey | null;
    selectSec(savedSec && savedSec !== 'search' && navKeys().includes(savedSec) ? savedSec : 'follow');
  }

  function deactivate() {
    if (!active && !view) return;
    console.log(TAG, 'deactivate');
    active = false;
    closeMenu();
    closePinDialog();
    moreObserver?.disconnect();
    window.removeEventListener('scroll', onScroll);
    view?.remove();
    view = null;
    sh = null;
    contentEl = null;
    titleEl = null;
    countEl = null;
    topEl = null;
    states = new Map();
    restoreOld();
    removeBootAll();
    if (pill) pill.style.display = '';
    if ('scrollRestoration' in history) history.scrollRestoration = 'auto';
  }

  if (document.body) ensurePill();
  else document.addEventListener('DOMContentLoaded', ensurePill, { once: true });

  void (async () => {
    try {
      msgCounts = await getMessageCounts();
      updateBadge();
    } catch {
      /* 未登录等，忽略 */
    }
  })();

  return { activate, deactivate, isActive: () => active, setPinned };
}
