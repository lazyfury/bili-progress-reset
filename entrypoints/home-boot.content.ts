import { defineContentScript } from '#imports';
import { installBoot, readMirroredSettings } from '../utils/boot';

/**
 * 防闪烁启动脚本（document_start，主世界）。
 *
 * 背景：`document_idle` 才隐藏旧首页会导致「先看到 B 站原版 → 再被替换」的闪屏。
 * 这里在页面渲染信息流之前就注入 CSS 隐藏旧 main 并盖上全屏 loading。
 * home 内容脚本挂载好视图后会移除遮罩；未开启/还原时全部清理。
 *
 * 开关状态需要**同步**读取，所以用桥接脚本镜像到 localStorage 的值。
 */
export default defineContentScript({
  matches: ['https://www.bilibili.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const p = location.pathname;
    if (p !== '/' && p !== '/index.html') return;
    if (readMirroredSettings().homepageEnabled) installBoot();
  },
});
