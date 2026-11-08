#!/usr/bin/env node
/**
 * tools/regen-preview-hash.mjs — 重新生成 dist-preview 校验清单
 *
 * 为什么需要：.github/workflows/r4-pages.yml 发布前会逐文件比对
 * preview-sha256.json，只要 dist-preview 里有任何改动就必须同步更新清单，
 * 否则 CI 会以 "Preview checksum mismatch" 失败。
 *
 * 我们这次只改了 dist-preview/index.html（加了一行守卫 script）并新增
 * dist-preview/gate.html 与 dist-preview/r5/*，所以必须重算。
 *
 * 用法（仓库根目录）：
 *   node tools/regen-preview-hash.mjs
 *   node tools/regen-preview-hash.mjs --check   # 只比对，不改文件
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const PREVIEW = path.join(ROOT, 'dist-preview');
const MANIFEST = path.join(ROOT, 'preview-sha256.json');

if (!fs.existsSync(PREVIEW)) {
  console.error('[regen] 找不到 dist-preview/，请在 little-racing-v2-test 仓库根目录执行');
  process.exit(2);
}

const walk = (dir, base = dir, out = {}) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, base, out);
    else out[path.relative(base, full).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
  return out;
};

const actual = walk(PREVIEW);
const expected = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};

const added = Object.keys(actual).filter((k) => !(k in expected));
const removed = Object.keys(expected).filter((k) => !(k in actual));
const changed = Object.keys(actual).filter((k) => k in expected && expected[k] !== actual[k]);

console.log(`文件数：${Object.keys(actual).length}（原 ${Object.keys(expected).length}）`);
if (added.length) console.log('新增：\n  ' + added.join('\n  '));
if (removed.length) console.log('删除：\n  ' + removed.join('\n  '));
if (changed.length) console.log('内容变化：\n  ' + changed.join('\n  '));

if (process.argv.includes('--check')) {
  const same = !added.length && !removed.length && !changed.length;
  console.log(same ? 'MATCH' : 'DIFF');
  process.exit(same ? 0 : 1);
}

fs.writeFileSync(MANIFEST, JSON.stringify(actual, null, 0) + '\n');
console.log('已写入 preview-sha256.json');
