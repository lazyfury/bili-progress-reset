/*
 * B站剧集/电视剧 进度重置 (00:00)
 * ------------------------------------------------------------------
 * 原理：B站播放进度由播放器定时调用
 *   POST https://api.bilibili.com/x/click-interface/web/heartbeat
 * 上报，其中 last_play_progress_time 就是“上次看到的位置”。
 * 本插件对每一集都用 last_play_progress_time=0 / max_play_progress_time=0
 * 上报一次，等于把每一集都“拖到 00:00”。
 *
 * 关于“上次播放的剧集”：
 *   每季的“继续观看/上次播放”由该季最后一次心跳决定。
 *   因此每季按【最后一集 → 第 1 集】倒序下发，最后再补发一次第 1 集，
 *   使每季的“上次播放”落在第 1 集、进度 00:00。
 *
 * 支持：番剧 / 电视剧 / 国创等所有 pgc（bangumi/play/ep* 与 ss*），
 *       可一次性处理整部剧的全部分季。
 * 运行在页面主世界（manifest world: MAIN），直接复用登录 Cookie。
 */
(function () {
  'use strict';
  if (window.__BPR_LOADED__) return;
  window.__BPR_LOADED__ = true;

  /* ============================ MD5 ============================ */
  function md5(str) {
    const bytes = new TextEncoder().encode(str);
    const len = bytes.length, bitLen = len * 8, withOne = len + 1;
    const padLen = ((56 - (withOne % 64)) + 64) % 64, total = withOne + padLen + 8;
    const buf = new Uint8Array(total); buf.set(bytes); buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, bitLen >>> 0, true);
    dv.setUint32(total - 4, Math.floor(bitLen / 0x100000000), true);

    const s = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
      5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
      4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
      6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
    ];
    const K = new Uint32Array(64);
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;

    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Uint32Array(16);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + M[g]) >>> 0;
        A = D; D = C; C = B;
        B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16), odv = new DataView(out.buffer);
    odv.setUint32(0, a0, true); odv.setUint32(4, b0, true);
    odv.setUint32(8, c0, true); odv.setUint32(12, d0, true);
    return Array.from(out).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ============================ WBI 签名 ============================ */
  const MIXIN_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
  ];

  let _mixinKey = null;
  async function getMixinKey() {
    if (_mixinKey) return _mixinKey;
    const res = await fetch('https://api.bilibili.com/x/web-interface/nav', { credentials: 'include' });
    const j = await res.json();
    const img = j.data.wbi_img.img_url, sub = j.data.wbi_img.sub_url;
    const imgKey = img.slice(img.lastIndexOf('/') + 1).split('.')[0];
    const subKey = sub.slice(sub.lastIndexOf('/') + 1).split('.')[0];
    const orig = imgKey + subKey;
    _mixinKey = MIXIN_TAB.map(i => orig[i]).join('').slice(0, 32);
    return _mixinKey;
  }
  function wbiSign(params, mixinKey) {
    const p = Object.assign({}, params, { wts: String(Math.floor(Date.now() / 1000)) });
    const query = Object.keys(p).sort().map(k =>
      encodeURIComponent(k) + '=' + encodeURIComponent(String(p[k]).replace(/[!'()*]/g, ''))
    ).join('&');
    p.w_rid = md5(query + mixinKey);
    return p;
  }
  function toQuery(obj) {
    return Object.keys(obj).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k])).join('&');
  }

  /* ============================ 工具 ============================ */
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function randHex(n) {
    const a = new Uint8Array(n / 2); crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // 当前页面定位：/bangumi/play/ep468227 或 /bangumi/play/ss38729
  function getVideoRef() {
    let m = location.pathname.match(/\/bangumi\/play\/ep(\d+)/);
    if (m) return { kind: 'ep', id: m[1] };
    m = location.pathname.match(/\/bangumi\/play\/ss(\d+)/);
    if (m) return { kind: 'ss', id: m[1] };
    return null;
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ============================ API ============================ */
  function normalizeEpisodes(result) {
    return (result.episodes || []).map(e => ({
      aid: e.aid,
      cid: e.cid,
      epId: e.ep_id || e.id,
      duration: e.duration,
      title: e.show_title || e.long_title || ('第' + e.title + '集')
    }));
  }

  async function fetchSeasonByRef(ref) {
    const key = ref.kind === 'ep' ? 'ep_id' : 'season_id';
    const res = await fetch(
      'https://api.bilibili.com/pgc/view/web/season?' + key + '=' + encodeURIComponent(ref.id),
      { credentials: 'include' }
    );
    const j = await res.json();
    if (j.code !== 0 || !j.result) throw new Error('获取剧集失败：code=' + j.code + ' ' + j.message);
    const r = j.result;
    let seasons = (r.seasons || []).map(s => ({
      seasonId: s.season_id, title: s.season_title || s.title, type: s.season_type
    }));
    if (!seasons.length) seasons = [{ seasonId: r.season_id, title: r.title, type: r.type }];
    const seen = new Set();
    seasons = seasons.filter(s => (seen.has(s.seasonId) ? false : (seen.add(s.seasonId), true)));
    seasons.sort((a, b) => (a.seasonId === r.season_id ? -1 : b.seasonId === r.season_id ? 1 : 0));
    return { seasonId: r.season_id, type: r.type, title: r.title, episodes: normalizeEpisodes(r), seasons };
  }

  const _seasonCache = new Map();
  async function fetchSeasonEpisodes(seasonId) {
    if (_seasonCache.has(seasonId)) return _seasonCache.get(seasonId);
    const res = await fetch(
      'https://api.bilibili.com/pgc/view/web/season?season_id=' + encodeURIComponent(seasonId),
      { credentials: 'include' }
    );
    const j = await res.json();
    if (j.code !== 0 || !j.result) throw new Error('取季失败：code=' + j.code);
    const val = { type: j.result.type, episodes: normalizeEpisodes(j.result) };
    _seasonCache.set(seasonId, val);
    return val;
  }

  // 把一集进度重置为 00:00
  async function resetEpisode(ep, mixinKey) {
    const dur = Math.max(0, Math.round((ep.duration || 0) / 1000));
    const startTs = Math.floor(Date.now() / 1000);
    const signed = wbiSign({
      w_start_ts: startTs, w_aid: ep.aid, w_dt: 2, w_realtime: 0, w_played_time: 0,
      w_real_played_time: 0, w_video_duration: dur, w_last_play_progress_time: 0,
      web_location: 1315873
    }, mixinKey);

    const body = new URLSearchParams();
    const put = (k, v) => body.set(k, String(v));
    put('start_ts', startTs);
    put('aid', ep.aid);
    put('cid', ep.cid);
    put('type', 4);
    put('sub_type', ep.seasonType || 5);
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
    put('sid', ep.seasonId);
    put('epid', ep.epId);
    put('spmid', '666.25');
    put('from_spmid', '');
    put('session', randHex(32));
    put('extra', JSON.stringify({ player_version: '4.10.1' }));
    put('csrf', getCookie('bili_jct'));

    const res = await fetch(
      'https://api.bilibili.com/x/click-interface/web/heartbeat?' + toQuery(signed),
      { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() }
    );
    const j = await res.json();
    if (j.code !== 0) throw new Error('code=' + j.code + ' ' + (j.message || ''));
    return j;
  }

  /* ============================ UI ============================ */
  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; }
    .fab { position: fixed; right: 20px; bottom: 96px; z-index: 2147483000; display: flex; align-items: center; gap: 6px;
      padding: 10px 14px; border: none; border-radius: 22px; background: #fb7299; color: #fff; font-size: 13px; font-weight: 600;
      cursor: pointer; box-shadow: 0 4px 14px rgba(251,114,153,.5); }
    .fab:hover { filter: brightness(1.05); } .fab:disabled { opacity: .6; cursor: default; }
    .panel { position: fixed; right: 20px; bottom: 150px; z-index: 2147483000; width: 380px; max-width: calc(100vw - 40px);
      max-height: 70vh; display: none; flex-direction: column; background: #1f1f27; color: #e8e8ee; border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,.55); overflow: hidden; }
    .panel.open { display: flex; }
    .head { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #2a2a35; font-size: 14px; font-weight: 600; }
    .x { background: none; border: none; color: #9a9aa8; font-size: 18px; cursor: pointer; line-height: 1; padding: 0 4px; }
    .x:hover { color: #fff; }
    .body { padding: 12px 14px; overflow-y: auto; font-size: 12px; }
    .desc { color: #a9a9b8; line-height: 1.6; margin-bottom: 10px; }
    .desc b { color: #ff9db8; }
    .opts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
    .opts label { display: flex; align-items: center; gap: 8px; cursor: pointer; color: #cfcfda; font-size: 12px; }
    .opts input { accent-color: #fb7299; }
    .seasons { border: 1px solid #3a3a48; border-radius: 8px; padding: 8px; margin-bottom: 12px; display: none; }
    .seasons.show { display: block; }
    .seasons .bar2 { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; color: #a9a9b8; }
    .seasons .bar2 button { background: #3a3a48; color: #dcdce6; border: none; border-radius: 6px; padding: 3px 8px; font-size: 11px; cursor: pointer; }
    .seasons .list { max-height: 150px; overflow-y: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 10px; }
    .seasons .list label { display: flex; align-items: center; gap: 6px; cursor: pointer; color: #cfcfda; padding: 2px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .seasons .list input { accent-color: #fb7299; }
    .actions { display: flex; gap: 8px; margin-bottom: 10px; }
    .actions button { flex: 1; padding: 9px 10px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    #run { background: #fb7299; color: #fff; } #run:disabled { background: #5a3a46; cursor: default; }
    #reload { background: #3a3a48; color: #dcdce6; } #reload:disabled { opacity: .5; cursor: default; }
    .bar { height: 6px; border-radius: 3px; background: #3a3a48; overflow: hidden; margin-bottom: 10px; }
    .bar > i { display: block; height: 100%; width: 0; background: linear-gradient(90deg,#fb7299,#ff9db8); transition: width .2s; }
    .log { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; line-height: 1.7; color: #b9b9c8;
      white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; }
    .log .ok { color: #6ee7a8; } .log .err { color: #ff7b7b; } .log .info { color: #8fc7ff; } .log .dim { color: #7c7c8c; }
  `;

  const host = document.createElement('div');
  host.id = 'bpr-root';
  const sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = `
    <style>${CSS}</style>
    <button class="fab" id="bpr-fab">⏱ 重置本剧进度</button>
    <div class="panel" id="bpr-panel">
      <div class="head"><span>重置剧集进度为 00:00</span><button class="x" id="bpr-x">✕</button></div>
      <div class="body">
        <div class="desc" id="bpr-desc">正在读取剧集信息…</div>
        <div class="opts">
          <label><input type="checkbox" id="bpr-allseason"> 包含全部分季（一次性清空整部剧）</label>
          <label><input type="checkbox" id="bpr-reload-auto" checked> 完成后自动刷新页面</label>
        </div>
        <div class="seasons" id="bpr-seasons">
          <div class="bar2"><span id="bpr-seasons-label">选择分季</span><span><button id="bpr-selall">全选</button> <button id="bpr-selnone">清空</button></span></div>
          <div class="list" id="bpr-seasons-list"></div>
        </div>
        <div class="actions">
          <button id="bpr-run" disabled>开始重置</button>
          <button id="bpr-reload" disabled>刷新页面</button>
        </div>
        <div class="bar"><i id="bpr-bar"></i></div>
        <div class="log" id="bpr-log"></div>
      </div>
    </div>`;

  const $ = id => sh.getElementById(id);
  const fab = $('bpr-fab'), panel = $('bpr-panel'), logEl = $('bpr-log'), descEl = $('bpr-desc');
  const runBtn = $('bpr-run'), reloadBtn = $('bpr-reload');
  const allSeasonCb = $('bpr-allseason'), autoCb = $('bpr-reload-auto');
  const barEl = $('bpr-bar'), seasonsBox = $('bpr-seasons'), seasonsList = $('bpr-seasons-list');

  function log(msg, cls) {
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.textContent = msg;
    logEl.appendChild(line); logEl.scrollTop = logEl.scrollHeight;
  }
  function setBar(done, total) { barEl.style.width = total ? (done / total * 100) + '%' : '0%'; }

  let current = null;
  let running = false;
  const seasonChecks = [];

  function renderSeasons(seasons, currentId) {
    seasonsList.innerHTML = '';
    seasonChecks.length = 0;
    if (seasons.length <= 1) return;
    seasons.forEach(s => {
      const lab = document.createElement('label');
      lab.title = s.title || '';
      const inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.checked = s.seasonId === currentId;
      inp.disabled = !allSeasonCb.checked;
      inp.addEventListener('change', updateDesc);
      const span = document.createElement('span');
      span.textContent = s.title || ('季 ' + s.seasonId);
      lab.appendChild(inp); lab.appendChild(span);
      seasonsList.appendChild(lab);
      seasonChecks.push({ seasonId: s.seasonId, title: s.title, input: inp });
    });
    seasonsBox.classList.add('show');
  }

  function selectedSeasons() {
    if (!allSeasonCb.checked) return [current.seasonId];
    const picked = seasonChecks.filter(s => s.input.checked).map(s => s.seasonId);
    return picked.length ? picked : [current.seasonId];
  }

  function updateDesc() {
    if (!current) return;
    const n = selectedSeasons().length;
    const multi = current.seasons.length > 1;
    descEl.innerHTML = `《${current.title}》本季 <b>${current.episodes.length}</b> 集` +
      (multi ? `，全剧共 <b>${current.seasons.length}</b> 季。当前将处理 <b>${n}</b> 季。` : '。') +
      ` 会把每集进度归零，并把每季“上次播放”重置到第 1 集。`;
  }

  async function loadSeasonInfo() {
    const ref = getVideoRef();
    if (!ref) { descEl.textContent = '当前页面不是番剧/电视剧播放页。'; return; }
    try {
      current = await fetchSeasonByRef(ref);
      renderSeasons(current.seasons, current.seasonId);
      updateDesc();
      runBtn.disabled = false;
    } catch (e) {
      descEl.textContent = '读取剧集失败：' + e.message;
    }
  }

  // 按季分组收集剧集（保持第 1 集在最前）
  async function collectGroups(seasonIds) {
    const groups = [];
    for (const sid of seasonIds) {
      const season = sid === current.seasonId
        ? { type: current.type, episodes: current.episodes }
        : await fetchSeasonEpisodes(sid);
      const type = season.type || 5;
      const title = (seasonChecks.find(s => s.seasonId === sid) || {}).title ||
        (sid === current.seasonId ? current.title : ('季 ' + sid));
      const episodes = season.episodes.map(ep => Object.assign({}, ep, { seasonId: sid, seasonType: type }));
      groups.push({ seasonId: sid, title, episodes });
    }
    return groups;
  }

  async function run() {
    if (running || !current) return;
    running = true; runBtn.disabled = true; reloadBtn.disabled = true;
    logEl.innerHTML = ''; setBar(0, 1);

    let okCount = 0, failCount = 0;

    try {
      const seasonIds = selectedSeasons();
      log('获取 WBI 签名密钥…', 'info');
      const mixinKey = await getMixinKey();

      log(`拉取 ${seasonIds.length} 季的剧集列表…`, 'info');
      const groups = await collectGroups(seasonIds);
      const total = groups.reduce((n, g) => n + g.episodes.length, 0);
      log(`共 ${seasonIds.length} 季 / ${total} 集待处理（每季倒序下发，末次落到第 1 集）。`, 'info');
      setBar(0, total);

      let done = 0;
      for (const g of groups) {
        // 倒序：最后一集 → 第 1 集，使该季“上次播放”最终停在前面
        const desc = g.episodes.slice().reverse();
        for (const ep of desc) {
          try {
            await resetEpisode(ep, mixinKey);
            okCount++;
            log(`✓ [${g.title}] ${ep.title} → 00:00`, 'ok');
          } catch (e) {
            failCount++;
            log(`✗ [${g.title}] ${ep.title} 失败：${e.message}`, 'err');
          }
          done++; setBar(done, total);
          await sleep(280);
        }
        // 补发第 1 集，确保该季“上次播放” = 第 1 集
        const first = g.episodes[0];
        if (first) {
          try {
            await resetEpisode(first, mixinKey);
            log(`↩ [${g.title}] 上次播放 → ${first.title}`, 'info');
          } catch (e) {
            failCount++;
            log(`✗ [${g.title}] 设置上次播放到第 1 集失败：${e.message}`, 'err');
          }
        }
      }

      log(`完成：成功 ${okCount}，失败 ${failCount}。`, 'info');
      reloadBtn.disabled = false;
      if (autoCb.checked) setTimeout(() => location.reload(), 1200);
    } catch (e) {
      log('中断：' + e.message, 'err');
    } finally {
      running = false; runBtn.disabled = false;
    }
  }

  fab.addEventListener('click', () => panel.classList.toggle('open'));
  $('bpr-x').addEventListener('click', () => panel.classList.remove('open'));
  allSeasonCb.addEventListener('change', () => {
    seasonsBox.style.opacity = allSeasonCb.checked ? '1' : '.45';
    seasonChecks.forEach(s => { s.input.disabled = !allSeasonCb.checked; });
    updateDesc();
  });
  $('bpr-selall').addEventListener('click', () => { seasonChecks.forEach(s => s.input.checked = true); updateDesc(); });
  $('bpr-selnone').addEventListener('click', () => { seasonChecks.forEach(s => s.input.checked = false); updateDesc(); });
  runBtn.addEventListener('click', run);
  reloadBtn.addEventListener('click', () => location.reload());

  (document.body || document.documentElement).appendChild(host);
  seasonsBox.style.opacity = '.45';
  loadSeasonInfo();
})();
