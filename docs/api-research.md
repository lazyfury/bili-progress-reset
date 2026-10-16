# B 站接口调查存档

本文档记录本项目在开发过程中**逆向调查到的接口与协议结论**，供后续参考。
其中「内置播放器」相关的功能与 UI 已从代码中删除，但当时调查清楚的取流 / DASH / MSE 结论仍完整保留在这里。

> 所有请求都复用登录 Cookie，均为只读或对本人账号的常规操作，不涉及密码 / 隐私数据。

---

## 0. 通用前提：必须跑在页面主世界

实测结论：

- 从扩展源（`Origin: chrome-extension://…`）发起请求会被 B 站风控返回 **HTTP 412**；
- 在页面上下文（`Origin/Referer = https://www.bilibili.com`）发起请求才正常。

因此所有涉及 `api.bilibili.com` 的 `fetch` 引擎都放在 **`world: 'MAIN'`** 的内容脚本里
（`entrypoints/bilibili-main.content.ts`、`entrypoints/home.content.ts`），
通过 `window.postMessage` 与隔离世界的 `entrypoints/bridge.content.ts` 通信，再由桥接脚本转发给 popup。

接口统一使用 `fetch(url, { credentials: 'include' })`，自动携带登录 Cookie。

---

## 1. WBI 签名

`x/player/wbi/*`、`x/web-interface/wbi/*` 等接口需要 WBI 签名（query 追加 `wts` 与 `w_rid`）。

1. `GET https://api.bilibili.com/x/web-interface/nav`
   返回 `data.wbi_img.img_url` / `data.wbi_img.sub_url`；
2. 取两个 URL 的文件名（不含扩展名）拼接，按固定的 **混淆表 MIXIN_TAB**（64 项）重排后取前 32 位，得到 `mixinKey`；
3. 参数按 key 字典序排列、URL 编码（其中 `!'()*` 需先剔除），拼成 query 后追加 `wts`；
4. `w_rid = md5(query + mixinKey)`。

`mixinKey` 按天变化，进程内缓存即可。实现见 `utils/wbi.ts`；MD5 见 `utils/md5.ts`
（`crypto.subtle` 不提供 MD5，故自带一份纯 JS 实现）。

---

## 2. 剧集信息

```
GET https://api.bilibili.com/pgc/view/web/season?ep_id=<epid>
GET https://api.bilibili.com/pgc/view/web/season?season_id=<ssid>
```

- `result.episodes[]`：每集含 `aid` / `cid` / `ep_id` / `id` / `duration`(ms) / `title` / `long_title` / `show_title`；
- `result.seasons[]`：全剧分季列表（`season_id` / `season_title` / `season_type`）；
- 单个 season 接口总是返回该季的集数，因此跨季重置时按季逐个拉取。

---

## 3. 进度重置（核心）

B 站的「上次看到 xx:xx / 播放中」不是本地缓存，而是播放器定时上报到服务端：

```
POST https://api.bilibili.com/x/click-interface/web/heartbeat
Content-Type: application/x-www-form-urlencoded
```

query 需 WBI 签名，body 的关键字段：

| 字段 | 值 | 说明 |
|---|---|---|
| `aid` / `cid` | 剧集 | |
| `type` | `4` | PGC 番剧/影视 |
| `sub_type` | `1`=番剧 `5`=电视剧 | |
| `played_time` | `0` | |
| `last_play_progress_time` | `0` | **上次播放位置**（关键） |
| `max_play_progress_time` | `0` | |
| `video_duration` | 秒 | |
| `sid` / `epid` | 季 / 集 | |
| `session` | 随机 32 位 hex | |
| `csrf` | `bili_jct` cookie | |

把每一集都发一次 `last_play_progress_time=0 & max_play_progress_time=0`，等于手动把每集拖到 `00:00`。

- 每季的「继续观看 / 上次播放」由该季**最后一次**心跳决定；
- 因此每季按 **最后一集 → 第 1 集** 倒序下发，最后再补发一次第 1 集，
  使每季「上次播放」落在第 1 集、进度 `00:00`；
- 每集约 280ms，控制频率避免风控。

实现见 `utils/engine.ts`（`resetEpisode` / `runReset`）。

> 逐集进度**查询**没有公开接口：`x/player/wbi/v2` 的 `last_play_time` 对 OGV 恒为 0，
> 任何「只重置有进度的集」的过滤都会误判，所以默认重置选中季的全部剧集。

---

## 4. 视频信息（UGC）

```
GET https://api.bilibili.com/x/web-interface/wbi/view?bvid=<bvid>   （WBI 签名）
```

返回 `data.aid` / `data.cid` / `data.title` / `data.duration`(秒) / `data.pages[]`（分P 的 `cid`、`part`）。

---

## 5. 取流：playurl（DASH）

```
GET https://api.bilibili.com/x/player/wbi/playurl
    ?avid=<aid>&cid=<cid>&qn=<quality>
    &fnval=4048&fnver=0&fourk=1&platform=pc&high_quality=1&otype=json
    &web_location=1315873
    （WBI 签名）
```

- `fnval=4048` 请求 DASH；
- `fnval=1` 仍能拿到单文件渐进 MP4（faststart，原生播放约 0.9s 起播），但**只有单档、不支持切清晰度**；
- `data.dash.video[]` / `data.dash.audio[]`：每轨含 `id`(清晰度) / `baseUrl` / `bandwidth` / `mimeType` / `codecs` / `width` / `height`；
- `data.quality`：服务端**实际授予**的清晰度 id（可能因会员/登录被降级，如 `32`=480p）；
- `data.support_formats[]`：可选清晰度列表与中文名；
- `data.last_play_time`：上次播放秒数（UGC 有效，OGV 恒 0）。

清晰度 id 对照（常用）：`16`=360p、`32`=480p、`64`=720p、`80`=1080p、`112`=1080p+、`116`=1080p60、`120`=4K。

---

## 6. DASH 流结构（bilibili UGC m4s）

B 站 **VOD 已从 FLV 改为 DASH(fMP4)/MSE**（flv.js 现在主要用于直播）。其 `.m4s` 结构：

```
ftyp + moov + sidx + moof/mdat + moof/mdat + ...
```

- 没有 `SegmentBase`，无法直接从 manifest 拿到分片表；
- 但 **`sidx`（Segment Index Box）** 里带了每个分片的字节大小与时长，
  可据此算出每段的 `[start, end]` 字节区间与起始时间，按 HTTP `Range` 边下边播；
- `moov`（初始化段）在文件头部，先拉 `~512KB` 即可解析出 `sidx`；
- `sidx` 的解析：`version/flags → reference_ID → timescale → firstOffset（v0: 4B / v1: 8B）→ count → [size(4B) | duration(4B) | SAP(4B)]×count`。

---

## 7. MSE 播放结论（已删除的功能，仅存档）

当年内置播放器（`utils/dash.ts` / `utils/player-view.ts`）的实测设计：

- **360p 秒开 → 无缝切目标清晰度**：先用最低档头部（~512KB）起播；目标档 init + 分片准备好后，
  在**分片边界**处 `changeType` 换轨，`SourceBuffer.remove()` 清掉低清重叠缓存再接上高清
  （不闪屏、不重开 `MediaSource`）；
- **并发预取**：分片 4 并发下载、`appendBuffer` 串行（避免「一段一个 RTT」）；
- **背压**：缓冲领先超过 120s（暂停）/ 30s（播放）时暂停拉流；
- 手写 MSE，清晰度切换 / 倍速 0.5–2x / 上次位置续播 / 进度上报（每 15s + 关闭时，`heartbeat` `type=3`）；
- 实测：`1.21s` 出首帧（360p）→ `5.1s` 处无缝切到 480p，卡顿 0 次；
- 限制：番剧不支持（走原生）；无弹幕/字幕；不做 DRM/付费、不做去广告。

UGC 进度上报用 `heartbeat` 的 `type=3`（与 PGC 的 `type=4` 不同），字段同上，
`played_time = last_play_progress_time = 当前秒数`。

---

## 8. 首页/信息流相关接口汇总

全部只读，复用登录 Cookie。

| 栏目 | 接口 | 签名/分页 |
|---|---|---|
| 关注动态（视频） | `x/polymer/web-dynamic/v1/feed/all?type=video` | `offset` 翻页 |
| 首页推荐 | `x/web-interface/wbi/index/top/feed/rcmd` | WBI，`fresh_idx` 翻页 |
| 稍后再看 | `x/v2/history/toview` | 无 |
| 追番 / 追剧 | `x/space/bangumi/follow/list?type=1|2&follow_type=1&vmid=<mid>` | `pn` 翻页（仅 `type=1/2`） |
| 动画 / 电视剧 / 纪录片 / 电影频道 | `pgc/season/index/result?season_type=1|5|3|2` | `page` 翻页（同 `/anime/`、`/tv/` 等） |
| 游戏区排行 / 分区排行 | `x/web-interface/ranking/v2?rid=4&type=all` | 无（不可翻页；**已需 WBI 签名**） |
| 专题页版式 | `pgc/page/web/v2?name=tv|movie|documentary|variety`、`v3?name=anime|guochuang` | 整页 `modules[]`（banner/index/hot/rank/column/operation/feed） |
| 专题页 feed | `pgc/page/web/feed`、`pgc/page/web/v3/feed` | `coursor` 翻页 |
| 新番时间表 | `pgc/web/timeline?types=1,2,3,4,5,7` | 按天 |
| 历史记录 | `x/web-interface/history/cursor` | `max` / `view_at` 游标 |
| 消息数 | `x/msgfeed/unread` | 无 |
| 消息列表 | `x/msgfeed/reply`、`x/msgfeed/at`、`x/msgfeed/like` | `pn`/`ps` |
| 当前账号 | `x/web-interface/nav` | 无 |

### 卡片操作（本人手动、单次）

| 操作 | 接口 |
|---|---|
| 关注 / 取关 / 拉黑 / 取消拉黑 | `x/relation/modify`（`act`: 1=关注 2=取关 5=拉黑 6=取消拉黑，需 `csrf`） |
| 批量查关系态 | `x/relation/relations?fids=`（`attribute`: 0 未关注 / 1 悄悄 / 2 单向 / 6 互关 / 128 已拉黑） |
| 不再推荐 / 撤销 | `x/web-interface/feedback/dislike`（`reason_id` 1=内容不感兴趣 4=不想看此 UP 主）、`.../dislike/cancel` |

---

## 9. 其他注意

- 会员集无权限时 `code != 0`，需要单独处理；
- 心跳接口成功以 `code === 0` 判定；
- 未登录时多为 `code === -101`；
- 只影响「播放进度」，不影响弹幕、评论、收藏、追番状态。
