# B站剧集/电视剧 进度重置 (00:00)

一键把 **番剧 / 电视剧 / 国创** 等 PGC 内容的播放进度重置为 `00:00`，解决二刷时选集里每集都带“播放中”进度条的问题。
支持一次性清空整部剧的**全部分季**，分季可选，并把**每季的“上次播放”重置到第 1 集**。

技术栈：**WXT + TypeScript + React**（Chrome MV3）。

## 原理

B 站的“上次看到 xx:xx / 播放中”不是本地缓存，而是播放器定时上报到服务端的：

```
POST https://api.bilibili.com/x/click-interface/web/heartbeat
```

关键字段 `last_play_progress_time`（上次播放位置）。插件对每一集都发一次
`last_play_progress_time=0 & max_play_progress_time=0`，等于把每集手动拖到 `00:00`。

每季的“继续观看/上次播放”由该季**最后一次**心跳决定，因此每季按 **最后一集 → 第 1 集** 倒序下发，
最后再补发一次第 1 集，使每季“上次播放”落在第 1 集、进度 `00:00`。

### 为什么引擎必须跑在页面主世界

实测：带 `Origin: chrome-extension://…` 调心跳接口会被 B 站风控返回 **HTTP 412**；
页面上下文（`Origin/Referer = www.bilibili.com`）才正常。所以引擎放在 `world: 'MAIN'` 内容脚本里。

## 架构

```
entrypoints/
  bilibili-main.content.ts   world:MAIN —— 播放页引擎 + 可选悬浮窗 + RPC
  home.content.ts            world:MAIN —— 首页重构（稍后再看 + 关注新视频）
  bridge.content.ts          ISOLATED —— popup ↔ 主世界 转发，同步设置
  popup/                     React 主界面（index.html / main.tsx / App.tsx / style.css）
utils/
  engine.ts                  业务引擎：取季、收集剧集、心跳归零、进度回调
  home.ts                    首页数据源（稍后再看 / 关注动态，只读）
  home-view.ts               首页自定义 UI
  wbi.ts                     WBI 签名（w_rid / wts）
  md5.ts                     纯 JS MD5（crypto.subtle 无 MD5）
  floating.ts                播放页悬浮窗（可选）
  settings.ts                storage 设置
  types.ts                   共享类型 + 消息协议
wxt.config.ts                manifest / 权限
legacy/                      早期单文件版本，仅作参考
debug-chrome.sh              可选：带 CDP 的独立调试 Chrome
```

数据流：`popup --(chrome port)--> bridge --(window.postMessage)--> MainWorld 引擎`。

## 开发

```bash
npm install
npm run dev        # 启动带热更新的开发浏览器
npm run compile    # tsc --noEmit 类型检查
npm run build      # 产出 .output/chrome-mv3
npm run zip        # 打包发布 zip
```

## 安装构建产物

1. `npm install && npm run build`
2. 打开 `chrome://extensions/`，开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择 `.output/chrome-mv3`

## 使用

- 打开番剧/电视剧播放页（`/bangumi/play/ep…` 或 `/bangumi/play/ss…`）
- **点扩展图标** 打开 popup 主界面：
  - 「包含全部分季」勾选后可逐季勾选（默认只处理当前季）
  - 「开始重置」；日志逐集显示，结束后可「刷新页面」
  - 「播放页右下角悬浮窗」开关控制是否在播放页注入悬浮按钮
- 悬浮窗（可选）功能与 popup 一致，直接在主世界运行。

## 首页重构（可选）

把 B 站首页信息流替换成一个 **YouTube 风格的自定义首页**：左侧栏 + 视频网格。

栏目（全部只读，复用登录 Cookie）：

| 栏目 | 接口 | 分页 |
|---|---|---|
| **关注**（默认） | `x/polymer/web-dynamic/v1/feed/all?type=video` | offset 翻页 |
| **推荐** | `x/web-interface/wbi/index/top/feed/rcmd`（需 WBI） | `fresh_idx` 翻页 |
| 稍后再看 | `x/v2/history/toview` | 无 |
| 动画 | `pgc/season/index/result?season_type=1`（同 `/anime/`） | page 翻页 |
| 电视剧 | `pgc/season/index/result?season_type=5`（同 `/tv/`） | page 翻页 |
| 历史记录 | `x/web-interface/history/cursor` | `max`/`view_at` 游标 |
| 消息 | `x/msgfeed/unread` + `reply/at/like` | 未读角标 + 最近消息 |

> 「动画 / 电视剧」展示的是**官方频道内容**（与 `/anime/`、`/tv/` 落地页同源），
> 并把你的**追番 / 追剧单独做成一排**放在顶部：默认一行横向滚动，点「展开全部」换行铺开；
> 标题旁有「N 部有更新」badge（有更新的项用粉色角标）。未登录时追番/追剧拉不到，仅显示频道内容。
> 封面右上角显示评分（`score`）。

### 卡片操作（关注 / 取关 / 拉黑）

鼠标移到卡片封面上，右上角出现「⋯」菜单：

- 打开 UP 空间
- **关注 / 取消关注**
- **拉黑 UP / 取消拉黑**（拉黑有二次确认）
- **不再推荐**（仅推荐流）：内容不感兴趣 / 不想看此 UP 主，操作后可 **撤销**

接口：
- 关注/取关/拉黑：`x/relation/modify`（`act`: 1/2/5/6）；关系态用 `x/relation/relations?fids=` 批量查（`attribute`: 0未关注 1悄悄 2单向 6互关 128已拉黑）。
- 不再推荐：`x/web-interface/feedback/dislike`（`reason_id` 1=内容不感兴趣 4=不想看此UP主），撤销用 `.../dislike/cancel`。

> 全部是**你自己账号的手动单次操作**，没有批量/自动。

### 自动加载

- 接近底部自动加载（`IntersectionObserver`，`rootMargin: 600px` 提前触发）；
- **节流**：最快 700ms 一次；且「加载中 / 无更多 / 出错」时不触发；只对当前栏目生效；
- 切栏或离开会断开 observer，不会误触；
- 保留「加载更多」按钮作为手动兜底；
- **切换栏目会强制刷新**：先用现有内容即时渲染，再后台重新拉取（SWR），不闪骨架屏；
- **消息栏**进入时会重新拉取列表与未读角标；角标请求失败时保留上一次的值（不清零）。

### 返回行为（已删除滚动恢复）

用 `performance.getEntriesByType('navigation')[0].type` 区分导航类型：

| 事件 | 行为 |
|---|---|
| 切换 tab | 滚动条回到顶部 |
| **刷新**（`reload`） | **清空数据缓存**，重新拉取 |
| **后退**（`back_forward`）/ 直接进入（`navigate`） | 先用缓存**秒开**，再后台刷新当前栏目；回到同一栏目、顶部 |

- 数据缓存 TTL = **5 分钟**（`CACHE_TTL`），仅用于「后退秒开」，随后仍会后台刷新；
- 切换栏目与后退都是**后台刷新**（SWR），不清空已有内容，也不恢复滚动位置；
- 已删除滚动位置保存/恢复（`saveScroll`/`restoreScroll`/`kScroll`），代码更干净；
- 注：若上一页是重定向页（如 `/video/...` 跳 `/bangumi/...`），`back_forward` 可能降级为 `navigate`，行为等效（同样用缓存），不影响。

- 图标来自 **Iconify（material-symbols）**，在构建期拉取并内联到 `utils/icons.ts`，运行时不请求 `api.iconify.dom`（避免 CSP/离线问题）。
- 在 popup 打开「重构首页」开关后自动进入；页面右下角常驻「我的首页」小圆钮可手动进入。
- 「还原首页」或关掉开关即可恢复。

特点：**纯只读**（不点赞/不投币/不关注），不产生任何写操作，封面 `loading=lazy`。
默认关闭。

### 入口与排障

- 首页右下角常驻小圆钮 **「我的首页」**：**能看到它就说明内容脚本在运行**，点它即可进入（无需设置）。
- 页面 Console 会输出 `[bpr-home]` 日志：`injected → settings → activate → loaded`。
- manifest 用 `https://www.bilibili.com/*` 宽匹配 + 运行时 `pathname` 判断，因为 `https://www.bilibili.com/` 匹配不到带 query 的首页。

### 防闪烁（document_start 遮罩）

直接等 `document_idle` 才隐藏旧首页会「先看到 B 站原版 → 再被替换」地闪一下。解决：

1. **桥接脚本**把设置镜像到页面 `localStorage['bpr_settings']`（`document_start` 起，变更时同步写入）；
2. **`home-boot.content.ts`**（`document_start`）同步读 localStorage，若已开启则立即注入 CSS 隐藏 `.bili-feed4` 并盖上全屏 loading 遮罩 `#bpr-boot`；
3. **`home.content.ts`** 挂载好视图后移除遮罩；未开启/还原时清理遮罩与隐藏样式。

遮罩带 8 秒兜底，避免意外卡死。

### 返回时保留栏目

点开视频再返回时，用 `sessionStorage`（同 tab 内跨导航）记住当前栏目：

- `bpr:home:section` 记住当前栏目，返回时自动回到该栏目；
- `bpr:home:cache:<栏目>` 缓存首屏数据（TTL 5 分钟），返回时**立即渲染**不白屏，随后在后台刷新；
- 激活时设 `history.scrollRestoration = 'manual'`；滚动位置**不恢复**（切栏/返回都回到顶部）。

### 设计说明（依据 frontend-design skill）

设计令牌：画布白 `#FFFFFF` / 墨黑 `#0F1115` / 次文 `#3D4148` / 弱文 `#7C828C` / 细线 `#EEF0F2` / 品牌粉 `#FB7299`（唯一强调色）。

- 用**细线分区**取代卡片阴影；缩略图用 `outline` 而非重圆角，卡片不叠同款阴影；
- 侧栏激活项用**粉色竖条**，不用圆角药丸；
- 卡片是**图像优先 + 频道头像**（YouTube 惯例）；
- 加载用**骨架屏**（结构而非文案）；空/错态用可操作文案（如「去登录」）；
- 仅保留悬浮的细节反馈，并尊重 `prefers-reduced-motion`。

## 接口调查存档

开发过程中逆向调查到的接口与协议结论（WBI 签名、心跳、playurl/DASH、首页各接口等）
统一记录在 [`docs/api-research.md`](docs/api-research.md)。

> 早期曾实现过一个「内置播放器」（手写 MSE + DASH 取流），现已**完全删除**（功能与 UI）。
> 相关的取流 / DASH / MSE 调查结论仍保留在上述文档中。

## 说明 / 注意

- 默认重置**选中的全部剧集**，不做“是否有进度”的过滤：
  B 站没有公开的逐集进度查询接口（`x/player/wbi/v2` 的 `last_play_time` 对 OGV 恒为 0），
  任何逐集过滤都会误判。
- 每集约 280ms，10 季 × 24 集约 1 分钟，控制频率避免风控。
- 使用与网页播放器完全相同的接口，复用登录 Cookie，不改密码/隐私数据。
- 会员集无权限时 `code != 0`，日志标红。
- 只影响“播放进度”，不影响弹幕、评论、收藏、追番状态。
