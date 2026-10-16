import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  cancelDislike,
  dislikeVideo,
  getBangumiFollow,
  getBangumiIndex,
  getChannelModules,
  getFollowFeed,
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
  searchVideos,
  type Card,
  type HistoryCursor,
  type MsgCounts,
  type MsgItem,
  type ProfileData,
  type TimelineDay,
} from '../home';
import type { PinnedChannel } from '../types';

/* ------------------------------- 常量 / 配置 ------------------------------- */

export type StaticKey =
  | 'recommend'
  | 'follow'
  | 'toview'
  | 'anime'
  | 'tv'
  | 'movie'
  | 'history'
  | 'message'
  | 'profile'
  | 'search';
export type PinKey = `pin:${string}`;
export type SecKey = StaticKey | PinKey;

export const SECTIONS: { key: StaticKey; label: string; icon: string; group?: string; hidden?: boolean }[] = [
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

interface PgcCfg {
  seasonType: number;
  followType?: 1 | 2;
  followTitle?: string;
  page: string;
  v3?: boolean;
  timeline?: string;
}

export const PGC: Partial<Record<StaticKey, PgcCfg>> = {
  anime: { seasonType: 1, followType: 1, followTitle: '我的追番', page: 'anime', v3: true, timeline: '1' },
  tv: { seasonType: 5, followType: 2, followTitle: '我的追剧', page: 'tv' },
  movie: { seasonType: 2, page: 'movie' },
};

export const PGC_PRESETS: Record<string, { name: string; seasonType: number; v3?: boolean; timeline?: string; followType?: 1 | 2; icon: string }> = {
  anime: { name: '番剧', seasonType: 1, v3: true, timeline: '1', icon: 'movie' },
  guochuang: { name: '国创', seasonType: 4, v3: true, icon: 'movie' },
  tv: { name: '电视剧', seasonType: 5, icon: 'live-tv' },
  movie: { name: '电影', seasonType: 2, icon: 'theaters' },
  documentary: { name: '纪录片', seasonType: 3, icon: 'videocam' },
  variety: { name: '综艺', seasonType: 7, icon: 'live-tv' },
};

export const REGION_PRESETS: { rid: number; name: string }[] = [
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

/* ------------------------------- 会话缓存 ------------------------------- */
const K_SECTION = 'bpr:home:section';
const kCache = (s: string) => `bpr:home:cache:${s}`;
const CACHE_TTL = 5 * 60 * 1000;

function navType(): string {
  try {
    const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return e?.type ?? 'navigate';
  } catch {
    return 'navigate';
  }
}
const IS_RELOAD = navType() === 'reload';

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

export function sanitizePins(v: unknown): PinnedChannel[] {
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

/* ------------------------------- 类型 ------------------------------- */
export interface SectionState {
  items: Card[];
  follow: Card[];
  rank: Card[];
  column: Card[];
  timeline: TimelineDay[];
  rankTitle: string;
  columnTitle: string;
  loading: boolean;
  loaded: boolean;
  error: string;
  hasMore: boolean;
  cursor?: string | HistoryCursor;
  page: number;
}
export const newSection = (): SectionState => ({
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

export interface ToastState {
  text: string;
  err: boolean;
  action?: { label: string; onClick: () => void };
}

export interface MsgState {
  counts: MsgCounts | null;
  items: MsgItem[];
  loading: boolean;
}
export interface ProfileState {
  data: ProfileData | null;
  loading: boolean;
  error: string;
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const isPin = (k: string): k is PinKey => k.startsWith('pin:');

/* ------------------------------- Store ------------------------------- */

export interface Store {
  sec: SecKey;
  sections: Record<string, SectionState>;
  pinned: PinnedChannel[];
  search: string;
  msg: MsgState;
  profile: ProfileState;
  toast: ToastState | null;
  relations: Map<number, number>;
  hidden: Set<string>;
  navKeys: () => SecKey[];
  labelOf: (k: SecKey) => string;
  selectSec: (k: SecKey) => void;
  load: (k: SecKey, reset: boolean) => Promise<void>;
  loadMore: (k: SecKey) => void;
  doSearch: (kw: string) => void;
  addPin: (p: PinnedChannel) => void;
  removePin: (id: string) => void;
  movePin: (id: string, dir: number) => void;
  showToast: (text: string, err?: boolean, action?: ToastState['action']) => void;
  dismissToast: () => void;
  ensureRelations: (cards: Card[]) => void;
  doRelation: (c: Card, act: 1 | 2 | 5 | 6, okMsg: string) => Promise<void>;
  doDislike: (c: Card, reasonId: number) => Promise<void>;
  onExit: () => void;
}

export function useHomeStore(pinnedProp: PinnedChannel[], onExit: () => void): Store {
  const [sections, setSections] = useState<Record<string, SectionState>>(() => {
    if (IS_RELOAD) {
      for (const { key } of SECTIONS) {
        try {
          sessionStorage.removeItem(kCache(key));
        } catch {
          /* ignore */
        }
      }
      return {};
    }
    const out: Record<string, SectionState> = {};
    for (const { key } of SECTIONS) {
      const raw = ssGet(kCache(key));
      if (!raw) continue;
      try {
        const c = JSON.parse(raw);
        if (!c || Date.now() - (c.ts ?? 0) > CACHE_TTL) continue;
        if (!c.items?.length && !c.rank?.length && !c.column?.length && !c.timeline?.length) continue;
        out[key] = {
          items: c.items ?? [],
          follow: c.follow ?? [],
          rank: c.rank ?? [],
          column: c.column ?? [],
          timeline: c.timeline ?? [],
          rankTitle: c.rankTitle ?? '',
          columnTitle: c.columnTitle ?? '',
          loading: false,
          loaded: true,
          error: '',
          hasMore: !!c.hasMore,
          cursor: c.cursor ?? undefined,
          page: c.page ?? 1,
        };
      } catch {
        /* ignore */
      }
    }
    return out;
  });
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;

  const [pinned, setPinnedState] = useState<PinnedChannel[]>(pinnedProp);
  const pinnedRef = useRef(pinned);
  pinnedRef.current = pinned;

  const [sec, setSecState] = useState<SecKey>(() => {
    const saved = ssGet(K_SECTION) as SecKey | null;
    const valid =
      saved &&
      saved !== 'search' &&
      (SECTIONS.some((s) => s.key === saved) || pinnedProp.some((p) => `pin:${p.id}` === saved));
    return valid ? (saved as SecKey) : 'follow';
  });
  const secRef = useRef(sec);
  secRef.current = sec;

  const [search, setSearch] = useState('');
  const searchRef = useRef(search);
  searchRef.current = search;

  const [msg, setMsg] = useState<MsgState>({ counts: null, items: [], loading: false });
  const [profile, setProfile] = useState<ProfileState>({ data: null, loading: false, error: '' });
  const [toast, setToast] = useState<ToastState | null>(null);
  const [relations, setRelations] = useState<Map<number, number>>(new Map());
  const relationsRef = useRef(relations);
  relationsRef.current = relations;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 外部（storage）推来的 pinned 同步
  const pinnedSig = JSON.stringify(pinnedProp);
  useEffect(() => {
    const clean = sanitizePins(pinnedProp);
    if (JSON.stringify(clean) === JSON.stringify(pinnedRef.current)) return;
    pinnedRef.current = clean;
    setPinnedState(clean);
  }, [pinnedSig]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = useCallback((key: SecKey, p: Partial<SectionState>) => {
    const cur = sectionsRef.current[key] ?? newSection();
    sectionsRef.current = { ...sectionsRef.current, [key]: { ...cur, ...p } };
    setSections(sectionsRef.current);
  }, []);

  const saveCache = useCallback((key: SecKey) => {
    const st = sectionsRef.current[key];
    if (!st || (!st.items.length && !st.follow.length)) return;
    ssSet(
      kCache(key),
      JSON.stringify({
        items: st.items,
        follow: st.follow,
        rank: st.rank,
        column: st.column,
        timeline: st.timeline,
        rankTitle: st.rankTitle,
        columnTitle: st.columnTitle,
        cursor: st.cursor ?? null,
        hasMore: st.hasMore,
        page: st.page,
        ts: Date.now(),
      }),
    );
  }, []);

  const ensureRelations = useCallback(async (cards: Card[]) => {
    const mids = cards.map((c) => c.mid).filter((m): m is number => !!m && !relationsRef.current.has(m));
    if (!mids.length) return;
    try {
      const attrs = await getRelationAttrs(mids);
      const next = new Map(relationsRef.current);
      for (const [k, v] of Object.entries(attrs)) next.set(Number(k), v as number);
      relationsRef.current = next;
      setRelations(next);
    } catch {
      /* 未登录等，忽略 */
    }
  }, []);

  const showToast = useCallback((text: string, err = false, action?: ToastState['action']) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, err, action });
    toastTimer.current = setTimeout(() => setToast(null), action ? 5200 : 2400);
  }, []);
  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const loadPgc = useCallback(
    async (key: SecKey, cfg: PgcCfg, reset: boolean) => {
      const cur = () => sectionsRef.current[key] ?? newSection();
      if (!reset) {
        const idx = await getBangumiIndex(cfg.seasonType, cur().page);
        patch(key, { items: [...cur().items, ...idx.items], hasMore: idx.hasMore, page: cur().page + 1 });
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
      patch(key, {
        follow: follow.items,
        items: idx.items,
        hasMore: idx.hasMore,
        rank: mods.rank,
        rankTitle: mods.rankTitle,
        column: mods.column,
        columnTitle: mods.columnTitle,
        timeline,
        page: 2,
      });
    },
    [patch],
  );

  const load = useCallback(
    async (key: SecKey, reset: boolean) => {
      const st0 = sectionsRef.current[key] ?? newSection();
      if (st0.loading) return;
      if (reset) patch(key, { page: 1, cursor: undefined, hasMore: true, error: '' });
      patch(key, { loading: true });
      try {
        const cur = () => sectionsRef.current[key] ?? newSection();
        if (isPin(key)) {
          const p = pinnedRef.current.find((x) => `pin:${x.id}` === key);
          if (!p) throw new Error('频道已移除');
          if (p.kind === 'region') {
            if (!reset) return;
            patch(key, { items: await getRegionRank(Number(p.ref)), hasMore: false });
          } else {
            const preset = PGC_PRESETS[p.ref];
            if (!preset) throw new Error('未知频道');
            await loadPgc(
              key,
              { seasonType: preset.seasonType, page: p.ref, v3: preset.v3, timeline: preset.timeline, followType: preset.followType },
              reset,
            );
          }
        } else if (key === 'recommend') {
          const p = await getRecommend(cur().page);
          patch(key, { items: reset ? p.items : [...cur().items, ...p.items], hasMore: p.hasMore, page: cur().page + 1 });
        } else if (key === 'follow') {
          const p = await getFollowFeed(reset ? undefined : (cur().cursor as string | undefined));
          patch(key, { items: reset ? p.items : [...cur().items, ...p.items], hasMore: p.hasMore, cursor: p.cursor });
        } else if (key === 'toview') {
          patch(key, { hasMore: false });
          if (reset) patch(key, { items: await getWatchLater() });
        } else if (PGC[key as StaticKey]) {
          await loadPgc(key, PGC[key as StaticKey]!, reset);
        } else if (key === 'history') {
          const p = await getHistory(reset ? undefined : (cur().cursor as HistoryCursor | undefined));
          patch(key, { items: reset ? p.items : [...cur().items, ...p.items], hasMore: p.hasMore, cursor: p.next });
        } else if (key === 'message') {
          if (reset) {
            setMsg((m) => ({ ...m, loading: true }));
            const [counts, items] = await Promise.all([
              getMessageCounts().catch(() => null),
              getMessages().catch(() => []),
            ]);
            setMsg((m) => ({ counts: counts ?? m.counts, items, loading: false }));
          }
        } else if (key === 'profile') {
          if (reset) {
            setProfile((p) => ({ data: p.data, loading: true, error: '' }));
            try {
              const d = await getSelfProfile();
              setProfile({ data: d, loading: false, error: '' });
            } catch (e) {
              setProfile((p) => ({ data: p.data, loading: false, error: errMsg(e) }));
              throw e;
            }
          }
        } else if (key === 'search') {
          const kw = searchRef.current;
          if (!kw) throw new Error('请输入关键词');
          const p = await searchVideos(kw, cur().page);
          patch(key, { items: reset ? p.items : [...cur().items, ...p.items], hasMore: p.hasMore, page: cur().page + 1 });
        }
        patch(key, { loaded: true });
        saveCache(key);
        if (['recommend', 'follow', 'toview', 'history', 'search'].includes(key) || isPin(key) || PGC[key as StaticKey]) {
          const s = sectionsRef.current[key];
          if (s) void ensureRelations([...s.follow, ...s.items]);
        }
      } catch (e) {
        patch(key, { error: errMsg(e) });
      } finally {
        patch(key, { loading: false });
      }
    },
    [patch, saveCache, ensureRelations, loadPgc],
  );

  const selectSec = useCallback(
    (key: SecKey) => {
      secRef.current = key;
      setSecState(key);
      if (key !== 'search') ssSet(K_SECTION, key);
      void load(key, true);
      window.scrollTo(0, 0);
    },
    [load],
  );

  const loadMore = useCallback(
    (key: SecKey) => {
      const s = sectionsRef.current[key];
      if (!s || s.loading || !s.hasMore || s.error) return;
      void load(key, false);
    },
    [load],
  );

  const doSearch = useCallback(
    (kw: string) => {
      const k = kw.trim();
      if (!k) return;
      searchRef.current = k;
      setSearch(k);
      patch('search', newSection());
      selectSec('search');
    },
    [patch, selectSec],
  );

  const updatePinned = useCallback((next: PinnedChannel[]) => {
    pinnedRef.current = next;
    setPinnedState(next);
    postSetting('pinnedChannels', next);
  }, []);
  const addPin = useCallback(
    (p: PinnedChannel) => {
      if (pinnedRef.current.some((x) => x.id === p.id)) return;
      updatePinned([...pinnedRef.current, p]);
    },
    [updatePinned],
  );
  const removePin = useCallback(
    (id: string) => {
      const key: SecKey = `pin:${id}`;
      updatePinned(pinnedRef.current.filter((p) => p.id !== id));
      if (secRef.current === key) selectSec('follow');
    },
    [updatePinned, selectSec],
  );
  const movePin = useCallback(
    (id: string, dir: number) => {
      const list = [...pinnedRef.current];
      const i = list.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return;
      const a = list[i]!;
      list[i] = list[j]!;
      list[j] = a;
      updatePinned(list);
    },
    [updatePinned],
  );

  const navKeys = useCallback(
    (): SecKey[] => [...SECTIONS.map((s) => s.key), ...pinnedRef.current.map((p) => `pin:${p.id}` as SecKey)],
    [],
  );
  const labelOf = useCallback((k: SecKey): string => {
    const s = SECTIONS.find((x) => x.key === k);
    if (s) return s.label;
    return pinnedRef.current.find((p) => `pin:${p.id}` === k)?.name ?? '频道';
  }, []);

  const doRelation = useCallback(
    async (c: Card, act: 1 | 2 | 5 | 6, okMsg: string) => {
      if (!c.mid) return;
      try {
        await modifyRelation(c.mid, act);
        const next = new Map(relationsRef.current);
        next.set(c.mid, act === 1 ? 2 : act === 5 ? 128 : 0);
        relationsRef.current = next;
        setRelations(next);
        showToast(okMsg);
      } catch (e) {
        showToast('操作失败：' + errMsg(e), true);
      }
    },
    [showToast],
  );

  const doDislike = useCallback(
    async (c: Card, reasonId: number) => {
      try {
        await dislikeVideo(c, reasonId);
        setHidden((h) => new Set(h).add(c.id));
        showToast('已减少此类推荐', false, {
          label: '撤销',
          onClick: async () => {
            try {
              await cancelDislike(c, reasonId);
              setHidden((h) => {
                const n = new Set(h);
                n.delete(c.id);
                return n;
              });
              showToast('已撤销');
            } catch (e) {
              showToast('撤销失败：' + errMsg(e), true);
            }
          },
        });
      } catch (e) {
        showToast('操作失败：' + errMsg(e), true);
      }
    },
    [showToast],
  );

  // 首次进入：刷新当前栏目 + 拉未读角标
  const booted = useRef(false);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void load(secRef.current, true);
    void getMessageCounts()
      .then((c) => setMsg((m) => ({ ...m, counts: c })))
      .catch(() => {});
  }, [load]);

  return {
    sec,
    sections,
    pinned,
    search,
    msg,
    profile,
    toast,
    relations,
    hidden,
    navKeys,
    labelOf,
    selectSec,
    load,
    loadMore,
    doSearch,
    addPin,
    removePin,
    movePin,
    showToast,
    dismissToast,
    ensureRelations,
    doRelation,
    doDislike,
    onExit,
  };
}

const Ctx = createContext<Store | null>(null);
export const StoreProvider = Ctx.Provider;
export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export { postSetting };
