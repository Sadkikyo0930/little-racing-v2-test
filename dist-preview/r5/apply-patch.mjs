#!/usr/bin/env node
/**
 * r5/apply-patch.mjs — 给赛车构建产物注入 / 撤销 R5 守卫
 *
 * 赛车两个仓库（little-racing-v2 / little-racing-v2-test）都只有构建产物、没有源码，
 * 所以这里只做**最小注入**：在 dist-preview/index.html 的游戏主模块前加一行 script。
 * 不修改任何资源、章节、配音、存档逻辑，随时可以用 --revert 还原。
 *
 * 用法（在 little-racing-v2-test 仓库根目录执行）：
 *   node dist-preview/r5/apply-patch.mjs            # 注入（幂等）
 *   node dist-preview/r5/apply-patch.mjs --check    # 只检查
 *   node dist-preview/r5/apply-patch.mjs --revert   # 还原
 *   node dist-preview/r5/apply-patch.mjs --file <path>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');  // r5/ 在 dist-preview/ 里，仓库根在两级之上

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const file = path.resolve(opt('--file', path.join(REPO, 'dist-preview', 'index.html')));
const MARK = '<!-- r5-guard -->';
const TAG = `<script type="module" src="./r5/race-guard.mjs?v=selftest1"></script>${MARK}`;

if (!fs.existsSync(file)) {
  console.error(`[r5] 找不到 ${file}`);
  process.exit(2);
}

const before = fs.readFileSync(file, 'utf8');
const has = before.includes(MARK);
const oldTag = before.match(/<script type="module" src="\.\/r5\/race-guard\.mjs(?:\?[^"]*)?"><\/script><!-- r5-guard -->/)?.[0];

if (flag('--check')) {
  console.log(has ? 'PATCHED' : 'UNPATCHED');
  process.exit(has ? 0 : 1);
}

if (flag('--revert')) {
  if (!has) { console.log('[r5] 未注入，无需还原'); process.exit(0); }
  // 注入时写的是 TAG + "\n    " + 原 script，这里按同样的字面量精确还原
  const reverted = before.includes(`${oldTag}\n    `)
    ? before.split(`${oldTag}\n    `).join('')
    : before.replace(oldTag, '');
  fs.writeFileSync(file, reverted);
  console.log('[r5] 已还原', path.relative(REPO, file));
  process.exit(0);
}

if (has) {
  if (!oldTag) throw new Error('Unknown R5 guard tag');
  if (oldTag !== TAG) fs.writeFileSync(file, before.replace(oldTag, TAG));
  console.log('[r5] 已经注入过，跳过（幂等）');
  process.exit(0);
}

// 找游戏主模块：<script type="module" ... src=".../assets/index-*.js"></script>
const appScript = before.match(/<script\s+type="module"[^>]*src="[^"]*\/assets\/index-[^"]+\.js"[^>]*>\s*<\/script>/i);
if (!appScript) {
  console.error('[r5] 没有找到游戏主模块 script 标签，已中止（不做猜测性注入）');
  process.exit(3);
}

const out = before.replace(appScript[0], `${TAG}\n    ${appScript[0]}`);
fs.writeFileSync(file, out);
console.log('[r5] 已注入守卫 →', path.relative(REPO, file));
console.log('[r5] 注入位置：游戏主模块之前（模块脚本按顺序执行，守卫先跑）');
