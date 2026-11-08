/**
 * r5/race-guard.mjs — 注入到赛车构建产物里的守卫入口
 *
 * 必须在游戏主模块之前执行（见 r5/apply-patch.mjs）。
 * 首屏是**同步**判断：没有有效过闸凭证就立刻退回入口页，游戏模块不会有机会跑起来。
 */
import { createR5Gate, R5Session } from './r5-online.mjs?v=selftest1';
import { R5_CONFIG, learnUrl } from './config.mjs?v=selftest1';
import { entryUrl } from './paths.mjs';
import { getDevice, readGrant, refreshGrant } from './grant.mjs?v=selftest1';
import { createGuard } from './guard-core.mjs?v=1.6.3';

const device = getDevice();
const grant = readGrant(device);

if (!device || !grant.ok) {
  // 同步 fail-closed：先遮住页面，再退回入口页（入口页会去云端确认）
  try { document.documentElement.style.visibility = 'hidden'; } catch { /* ignore */ }
  const reason = !device ? 'NO_DEVICE' : grant.reason;
  console.info('[r5] 未通过闸门，退回入口页：', reason);
  location.replace(entryUrl() + '?r5=' + encodeURIComponent(reason));
  throw new Error('R5_ENTRY_REDIRECT:' + reason);
}

const gate = createR5Gate({
  base: R5_CONFIG.base,
  familyId: R5_CONFIG.familyId,
  device,
});

const session = new R5Session(gate, {
  heartbeatSeconds: R5_CONFIG.heartbeatSeconds,
  onPaused: () => console.info('[r5] 切到后台，计时已暂停'),
});

const guard = createGuard({
  doc: document,
  gate,
  session,
  learnUrl: learnUrl(),
  entryUrl: entryUrl(),
  onGrantRefresh: () => refreshGrant(R5_CONFIG.grantTtlSeconds),
});

// 捕获阶段拦截：剧情 / 普通比赛 / 赛道直达 / 再来一局 全部走这里
document.addEventListener('click', (ev) => {
  const blocked = guard.intercept(ev.target);
  if (blocked) {
    ev.preventDefault();
    ev.stopPropagation();
  }
}, true);

// 退出（页面隐藏 / 关闭）：停止计时，不把后台时间算进 30 分钟
window.addEventListener('pagehide', () => { session.end('pagehide'); });

window.addEventListener('pageshow', (event) => {
  if (event.persisted) guard.boot();
});

window.__R5_GUARD__ = guard;

guard.boot().then((r) => {
  if (!r.ok) console.info('[r5] 本次未放行：', r.reason || r.error);
}).catch((e) => {
  console.error('[r5] 守卫异常：', e);
  guard.lockDown('net', 'R5_GATEWAY_ERROR');
});
