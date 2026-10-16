/** 共享类型定义 */

/** 用户 pin 到侧栏的自定义频道 */
export interface PinnedChannel {
  id: string;
  kind: 'pgc' | 'region';
  name: string;
  /** pgc: slug（anime/tv/…）；region: rid */
  ref: string;
  icon?: string;
}

export type VideoRef =
  | { kind: 'ep'; id: string }
  | { kind: 'ss'; id: string };

export interface Episode {
  aid: number;
  cid: number;
  epId: number;
  duration: number; // 毫秒
  title: string;
  /** 归属季，收集后补全 */
  seasonId?: number;
  seasonType?: number;
}

export interface SeasonRef {
  seasonId: number;
  title: string;
  type: number;
}

export interface SeasonInfo {
  /** 当前所在的季 */
  seasonId: number;
  type: number;
  title: string;
  /** 当前季的剧集 */
  episodes: Episode[];
  /** 全剧所有季（含当前季，当前季在最前） */
  seasons: SeasonRef[];
}

export interface SeasonGroup {
  seasonId: number;
  title: string;
  type: number;
  episodes: Episode[];
}

export type ResetProgress =
  | { type: 'meta'; total: number; seasons: number }
  | { type: 'season-start'; seasonTitle: string; index: number; total: number }
  | { type: 'item'; seasonTitle: string; title: string; ok: boolean; error?: string; index: number; total: number }
  | { type: 'season-last'; seasonTitle: string; title: string }
  | { type: 'done'; ok: number; fail: number };

export interface ResetSummary {
  ok: number;
  fail: number;
}

/* -------------------- popup <-> content 消息协议 -------------------- */

export interface RpcRequest {
  __bpr: 'req';
  id: number;
  cmd: 'getSeason' | 'startReset' | 'settings' | 'getSettings' | 'setSetting';
  payload?: unknown;
}

export interface RpcResponse {
  __bpr: 'res';
  id: number;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface RpcEvent {
  __bpr: 'event';
  event: 'progress';
  data: ResetProgress;
}

export type MainMessage = RpcRequest | RpcResponse | RpcEvent;
