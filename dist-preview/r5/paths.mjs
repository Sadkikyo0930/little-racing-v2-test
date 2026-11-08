/**
 * r5/paths.mjs — 页面地址解析（唯一来源）
 *
 * GitHub Pages 发布的是 dist-preview/ 目录（见 .github/workflows/r4-pages.yml），
 * 所以线上：
 *   https://…/little-racing-v2-test/            → dist-preview/index.html（游戏）
 *   https://…/little-racing-v2-test/gate.html   → dist-preview/gate.html（通行证）
 * 本地仓库里两者都在 dist-preview/ 下 —— 永远同级。
 * 因此这里一律「相对当前页面」解析，仓库结构与线上结构都成立。
 */

/** 游戏页：与当前页面同级的 index.html */
export function gameUrl() {
  return new URL('./index.html', location.href).href;
}

/** 通行证页：与当前页面同级的 gate.html */
export function entryUrl() {
  return new URL('./gate.html', location.href).href;
}
