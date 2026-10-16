import { md5 } from './md5';

/** B 站 WBI 混淆表 */
const MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
  61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
  36, 20, 34, 44, 52,
];

let cached: { key: string; day: string } | null = null;

/** 从 nav 接口取 wbi 公钥并生成 mixinKey（按天变化，进程内缓存） */
export async function getMixinKey(force = false): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  if (!force && cached && cached.day === day) return cached.key;

  const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`获取 WBI 公钥失败：HTTP ${res.status}`);
  const j = (await res.json().catch(() => null)) as {
    data?: { wbi_img?: { img_url?: string; sub_url?: string } };
  } | null;
  const imgUrl = j?.data?.wbi_img?.img_url;
  const subUrl = j?.data?.wbi_img?.sub_url;
  if (!imgUrl || !subUrl) throw new Error('获取 WBI 公钥失败：返回结构异常');

  const imgKey = imgUrl.slice(imgUrl.lastIndexOf('/') + 1).split('.')[0] ?? '';
  const subKey = subUrl.slice(subUrl.lastIndexOf('/') + 1).split('.')[0] ?? '';
  const orig = imgKey + subKey;
  const key = MIXIN_TAB.map((i) => orig[i] ?? '').join('').slice(0, 32);
  cached = { key, day };
  return key;
}

export type WbiParams = Record<string, string | number | boolean>;

/** 给参数追加 wts 与 w_rid（WBI 签名） */
export function wbiSign(params: WbiParams, mixinKey: string): Record<string, string> {
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) p[k] = String(v);
  p.wts = String(Math.floor(Date.now() / 1000));
  const query = Object.keys(p)
    .sort()
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent((p[k] ?? '').replace(/[!'()*]/g, '')))
    .join('&');
  p.w_rid = md5(query + mixinKey);
  return p;
}

/** 普通对象转 query string */
export function toQuery(obj: Record<string, string | number>): string {
  return Object.keys(obj)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(obj[k])))
    .join('&');
}
