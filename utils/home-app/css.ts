// 由 utils/home-view.ts 迁移而来，样式保持不变
export const APP_CSS = `
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

export const PILL_CSS = `
  :host { all: initial; }
  button { position: fixed; right: 20px; bottom: 90px; z-index: 2147483000; display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border: none; border-radius: 20px; background: #fb7299; color: #fff;
    font-size: 12px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 14px rgba(251,114,153,.5);
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  button:hover { filter: brightness(1.06); }
`;
