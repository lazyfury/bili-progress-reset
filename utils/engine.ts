import type {
  Episode,
  ResetProgress,
  ResetSummary,
  SeasonGroup,
  SeasonInfo,
  SeasonRef,
  VideoRef,
} from './types';
import { getMixinKey, toQuery, wbiSign } from './wbi';

const API = 'https://api.bilibili.com';
const WEB_LOCATION = 1315873; // 与番剧播放页一致

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 从 URL 解析当前页面对应的剧集/季 */
export function parseVideoRef(url: string): VideoRef | null {
  let m = url.match(/\/bangumi\/play\/ep(\d+)/);
  if (m && m[1]) return { kind: 'ep', id: m[1] };
  m = url.match(/\/bangumi\/play\/ss(\d+)/);
  if (m && m[1]) return { kind: 'ss', id: m[1] };
  return null;
}

function getCookie(name: string): string {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m && m[1] ? decodeURIComponent(m[1]) : '';
}

function randHex(n: number): string {
  const a = new Uint8Array(n / 2);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface RawEpisode {
  aid: number;
  cid: number;
  id: number;
  ep_id: number;
  duration: number;
  title: string;
  long_title?: string;
  show_title?: string;
}

interface RawSeasonResult {
  season_id: number;
  type: number;
  title: string;
  episodes?: RawEpisode[];
  seasons?: { season_id: number; season_title?: string; title?: string; season_type?: number }[];
}

function normalizeEpisodes(result: RawSeasonResult): Episode[] {
  return (result.episodes ?? []).map((e) => ({
    aid: e.aid,
    cid: e.cid,
    epId: e.ep_id || e.id,
    duration: e.duration ?? 0,
    title: e.show_title || e.long_title || `第${e.title}集`,
  }));
}

async function fetchSeason(params: Record<string, string | number>): Promise<RawSeasonResult> {
  const res = await fetch(`${API}/pgc/view/web/season?${toQuery(params)}`, {
    credentials: 'include',
  });
  const j = await res.json();
  if (j.code !== 0 || !j.result) throw new Error(`获取剧集失败：code=${j.code} ${j.message ?? ''}`);
  return j.result as RawSeasonResult;
}

/** 读取当前页面所属季 + 全剧分季列表 */
export async function getSeasonInfo(ref: VideoRef): Promise<SeasonInfo> {
  const key = ref.kind === 'ep' ? 'ep_id' : 'season_id';
  const r = await fetchSeason({ [key]: ref.id });

  let seasons: SeasonRef[] = (r.seasons ?? []).map((s) => ({
    seasonId: s.season_id,
    title: s.season_title || s.title || `季 ${s.season_id}`,
    type: s.season_type ?? r.type,
  }));
  if (seasons.length === 0) seasons = [{ seasonId: r.season_id, title: r.title, type: r.type }];

  const seen = new Set<number>();
  seasons = seasons.filter((s) => (seen.has(s.seasonId) ? false : (seen.add(s.seasonId), true)));
  seasons.sort((a, b) => (a.seasonId === r.season_id ? -1 : b.seasonId === r.season_id ? 1 : 0));

  return {
    seasonId: r.season_id,
    type: r.type,
    title: r.title,
    episodes: normalizeEpisodes(r),
    seasons,
  };
}

const seasonCache = new Map<number, { type: number; episodes: Episode[] }>();

async function fetchSeasonEpisodes(seasonId: number): Promise<{ type: number; episodes: Episode[] }> {
  const cached = seasonCache.get(seasonId);
  if (cached) return cached;
  const r = await fetchSeason({ season_id: seasonId });
  const val = { type: r.type, episodes: normalizeEpisodes(r) };
  seasonCache.set(seasonId, val);
  return val;
}

/** 按季收集剧集（第 1 集在最前） */
export async function collectGroups(
  info: SeasonInfo,
  seasonIds: number[],
): Promise<SeasonGroup[]> {
  const groups: SeasonGroup[] = [];
  for (const sid of seasonIds) {
    const season =
      sid === info.seasonId
        ? { type: info.type, episodes: info.episodes }
        : await fetchSeasonEpisodes(sid);
    const type = season.type || 5;
    const title = info.seasons.find((s) => s.seasonId === sid)?.title ?? `季 ${sid}`;
    const episodes = season.episodes.map((ep) => ({ ...ep, seasonId: sid, seasonType: type }));
    groups.push({ seasonId: sid, title, type, episodes });
  }
  return groups;
}

/** 把一集进度重置为 00:00（核心：心跳上报 last_play_progress_time=0） */
export async function resetEpisode(ep: Episode, mixinKey: string): Promise<void> {
  const dur = Math.max(0, Math.round((ep.duration || 0) / 1000));
  const startTs = Math.floor(Date.now() / 1000);
  const signed = wbiSign(
    {
      w_start_ts: startTs,
      w_aid: ep.aid,
      w_dt: 2,
      w_realtime: 0,
      w_played_time: 0,
      w_real_played_time: 0,
      w_video_duration: dur,
      w_last_play_progress_time: 0,
      web_location: WEB_LOCATION,
    },
    mixinKey,
  );

  const body = new URLSearchParams();
  const put = (k: string, v: string | number) => body.set(k, String(v));
  put('start_ts', startTs);
  put('aid', ep.aid);
  put('cid', ep.cid);
  put('type', 4);
  put('sub_type', ep.seasonType ?? 5);
  put('dt', 2);
  put('play_type', 0);
  put('realtime', 0);
  put('played_time', 0);
  put('real_played_time', 0);
  put('refer_url', '');
  put('bsource', '');
  put('quality', 32);
  put('is_auto_qn', 1);
  put('video_duration', dur);
  put('last_play_progress_time', 0);
  put('max_play_progress_time', 0);
  put('outer', 0);
  put('statistics', JSON.stringify({ appId: 100, platform: 5, abtest: '', version: '' }));
  put('mobi_app', 'web');
  put('device', 'web');
  put('platform', 'web');
  put('cur_language_vt', '{}');
  put('perfer_type', '{}');
  put('play_mode', 1);
  put('sid', ep.seasonId ?? 0);
  put('epid', ep.epId);
  put('spmid', '666.25');
  put('from_spmid', '');
  put('session', randHex(32));
  put('extra', JSON.stringify({ player_version: '4.10.1' }));
  put('csrf', getCookie('bili_jct'));

  const res = await fetch(`${API}/x/click-interface/web/heartbeat?${toQuery(signed)}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const j = await res.json();
  if (j.code !== 0) throw new Error(`code=${j.code} ${j.message ?? ''}`);
}

/** 对选中的季执行重置：每季倒序下发，最后补发第 1 集使“上次播放”停在第 1 集 */
export async function runReset(
  ref: VideoRef,
  seasonIds: number[],
  onProgress: (p: ResetProgress) => void,
  intervalMs = 280,
): Promise<ResetSummary> {
  const info = await getSeasonInfo(ref);
  const mixinKey = await getMixinKey();
  const groups = await collectGroups(info, seasonIds);
  const total = groups.reduce((n, g) => n + g.episodes.length, 0);

  onProgress({ type: 'meta', total, seasons: groups.length });

  let ok = 0;
  let fail = 0;
  let index = 0;

  for (const [gi, g] of groups.entries()) {
    onProgress({ type: 'season-start', seasonTitle: g.title, index: gi + 1, total: groups.length });

    // 倒序：最后一集 → 第 1 集
    for (const ep of [...g.episodes].reverse()) {
      index++;
      try {
        await resetEpisode(ep, mixinKey);
        ok++;
        onProgress({ type: 'item', seasonTitle: g.title, title: ep.title, ok: true, index, total });
      } catch (e) {
        fail++;
        onProgress({
          type: 'item',
          seasonTitle: g.title,
          title: ep.title,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
          index,
          total,
        });
      }
      await sleep(intervalMs);
    }

    // 补发第 1 集，确保该季“上次播放” = 第 1 集
    const first = g.episodes[0];
    if (first) {
      try {
        await resetEpisode(first, mixinKey);
        onProgress({ type: 'season-last', seasonTitle: g.title, title: first.title });
      } catch {
        fail++;
      }
    }
  }

  onProgress({ type: 'done', ok, fail });
  return { ok, fail };
}
