/**
 * r5/guard-core.mjs — 赛车页内的资格守卫（可测试核心）
 *
 * 职责：
 *  1. 首屏同步校验「过闸凭证」：没有凭证 → 立刻退回入口页，游戏模块根本不启动；
 *  2. 用云端 start/tick/stop 计时，前端只展示 remaining_seconds；
 *  3. 时间归零：允许跑完当前这一场，但禁止开始下一场；
 *  4. 断网 / 接口异常：不放行（fail-closed），只允许回学习平台。
 *
 * 只做 DOM 操作与状态机，不发网络请求（gate 注入），所以可以在 jsdom 里直接测。
 */

const ENTRY_SELECTORS = [
  '#playBtn',        // 普通比赛
  '#storyBtn',       // 故事冒险 · 第一章
  '#storyBtn2',      // 故事冒险 · 第二章
  '#againBtn',       // 再来一局
  '#courseGrid button', // 赛道直达
  '#charGrid button',   // 选赛车手（进入比赛前的最后一步）
];

const STYLE = `
#r5-hud{position:fixed;top:calc(env(safe-area-inset-top,0px) + 10px);right:12px;z-index:2147483000;
  display:flex;align-items:center;gap:6px;padding:7px 12px;border-radius:999px;
  background:rgba(8,20,38,.78);color:#fff;font:700 15px/1 -apple-system,"PingFang SC",sans-serif;
  box-shadow:0 6px 18px rgba(0,0,0,.35);backdrop-filter:blur(6px);pointer-events:none}
#r5-hud.low{background:rgba(226,59,46,.9)}
#r5-hud .dot{width:8px;height:8px;border-radius:50%;background:#2fae6a}
#r5-hud.low .dot{background:#fff}
#r5-banner{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 64px);transform:translateX(-50%);
  z-index:2147483001;padding:12px 18px;border-radius:16px;background:rgba(226,59,46,.95);color:#fff;
  font:600 15px/1.5 -apple-system,"PingFang SC",sans-serif;box-shadow:0 10px 26px rgba(0,0,0,.35);
  max-width:86vw;text-align:center;pointer-events:none}
#r5-veil{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;
  padding:22px;background:radial-gradient(1200px 600px at 50% -10%,#1d3f6b 0%,#0a1c33 60%,#06101f 100%);
  font-family:-apple-system,"PingFang SC",sans-serif;color:#12243d}
#r5-veil .box{width:100%;max-width:460px;background:#fff;border-radius:24px;padding:24px 20px;
  box-shadow:0 24px 60px rgba(0,0,0,.45);text-align:center}
#r5-veil .emoji{font-size:46px;line-height:1;margin-bottom:10px}
#r5-veil h2{margin:0 0 8px;font-size:19px}
#r5-veil p{margin:0 0 16px;color:#5b7290;font-size:14px;line-height:1.65}
#r5-veil button{display:block;width:100%;border:0;border-radius:14px;padding:15px;font:700 16px inherit;
  cursor:pointer;margin-top:9px;font-family:inherit}
#r5-veil .primary{background:#e23b2e;color:#fff}
#r5-veil .ghost{background:#eef4fb;color:#12243d}
#r5-veil .spin{width:44px;height:44px;border-radius:50%;border:4px solid #e6eef7;border-top-color:#e23b2e;
  margin:6px auto 12px;animation:r5spin .9s linear infinite}
@keyframes r5spin{to{transform:rotate(360deg)}}
.r5-blocked{filter:grayscale(.55) brightness(.72);pointer-events:none}
`;

function ensureStyle(doc) {
  if (doc.getElementById('r5-style')) return;
  const s = doc.createElement('style');
  s.id = 'r5-style';
  s.textContent = STYLE;
  (doc.head || doc.documentElement).appendChild(s);
}

export function isInRace(doc = document) {
  const hud = doc.getElementById('hud');
  return !!hud && !hud.classList.contains('hidden');
}

/**
 * @param {object} opts
 * @param {Document} opts.doc
 * @param {{start:Function,tick:Function,stop:Function,messageFor:Function}} opts.gate
 * @param {(st:object)=>void} [opts.onUpdate]
 * @param {(st:object)=>void} [opts.onEnded]
 * @param {(ms:number)=>void} [opts.onGrantRefresh]
 * @param {object} [opts.session] 可注入假的计时器（测试用）
 */
export function createGuard(opts) {
  const doc = opts.doc || document;
  const gate = opts.gate;
  const session = opts.session;
  const learnUrl = opts.learnUrl || 'https://sadkikyo0930.github.io/little-growth-workbench/v6/';
  const entryUrl = opts.entryUrl || '/';

  const state = {
    phase: 'boot',      // boot | playing | expired | blocked
    expired: false,
    locked: false,
    last: null,
    failures: 0,
  };

  ensureStyle(doc);

  const el = (tag, id, cls) => {
    const n = doc.createElement(tag);
    if (id) n.id = id;
    if (cls) n.className = cls;
    return n;
  };

  function hud() {
    let n = doc.getElementById('r5-hud');
    if (n) return n;
    n = el('div', 'r5-hud');
    n.innerHTML = '<span class="dot"></span><span id="r5-clock">--:--</span>';
    doc.body.appendChild(n);
    return n;
  }

  function setClock(seconds) {
    const n = doc.getElementById('r5-clock');
    if (!n) return;
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    n.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    const box = doc.getElementById('r5-hud');
    if (box) box.classList.toggle('low', s <= 120);
  }

  function banner(text) {
    let n = doc.getElementById('r5-banner');
    if (!n) {
      n = el('div', 'r5-banner');
      n.id = 'r5-banner';
      doc.body.appendChild(n);
    }
    n.textContent = text;
    return n;
  }

  function clearBanner() {
    const n = doc.getElementById('r5-banner');
    if (n) n.remove();
  }

  function veil(html, buttons) {
    let v = doc.getElementById('r5-veil');
    if (v) v.remove();
    v = el('div', 'r5-veil');
    v.id = 'r5-veil';
    const box = el('div', 'r5-box');
    box.className = 'box';
    box.innerHTML = html;
    v.appendChild(box);
    (buttons || []).forEach((b) => {
      const btn = el('button', null, b.cls || 'ghost');
      btn.type = 'button';
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      box.appendChild(btn);
    });
    doc.body.appendChild(v);
    return v;
  }

  function removeVeil() {
    const v = doc.getElementById('r5-veil');
    if (v) v.remove();
  }

  function blockEntries(on) {
    state.locked = !!on;
    (opts.entrySelectors || ENTRY_SELECTORS).forEach((sel) => {
      doc.querySelectorAll(sel).forEach((node) => {
        node.classList.toggle('r5-blocked', !!on);
        if ('disabled' in node && /^(BUTTON)$/.test(node.tagName)) node.disabled = !!on;
      });
    });
  }

  /** 点击拦截：有效期外/已锁定时，拦截所有「开始比赛」类入口 */
  function intercept(target) {
    if (!target || (!state.expired && !state.locked)) return false;
    const sel = (opts.entrySelectors || ENTRY_SELECTORS).join(',');
    const hit = target.closest ? target.closest(sel) : null;
    if (!hit) return false;
    banner(state.expired ? '今天的 30 分钟用完啦，明天再来！' : '网络不太好，先休息一下～');
    return true;
  }

  function lockDown(kind, reason) {
    state.locked = true;
    blockEntries(true);
    clearBanner();
    const isTime = kind === 'time';
    const title = isTime ? '今天的 30 分钟用完啦' : '暂时连不上学习记录';
    const body = isTime
      ? '今天的赛车时间用完了，存档都给你留着。明天学习完再来！'
      : `${gate.messageFor ? gate.messageFor(reason) : '网络有点忙'} 计时已经暂停，为了公平，先休息一下吧。`;
    veil(
      `<div class="emoji">${isTime ? '🌙' : '🛠️'}</div><h2>${title}</h2><p>${body}</p>`,
      [
        { label: '去学习（V6 学习平台）', cls: 'primary', onClick: () => { doc.location.href = learnUrl; } },
        isTime ? null : { label: '再试一次', cls: 'ghost', onClick: () => { doc.location.reload(); } },
      ].filter(Boolean),
    );
  }

  function expire() {
    if (state.expired) return;
    state.expired = true;
    state.phase = 'expired';
    state.raceOpen = isInRace(doc);   // 记下「用完的那一刻是否正在比赛」
    blockEntries(true);
    // 正在比赛：让孩子跑完这一场，回到结果页/首页再收网
    if (state.raceOpen) {
      banner('时间到啦，跑完这一场就结束哦～');
      return;
    }
    lockDown('time', 'TIME_LIMIT_REACHED');
  }

  function watchRace() {
    // 不依赖「边沿检测」：只判断「用完时在比赛，现在不在比赛了」→ 收网
    const check = () => {
      if (!state.expired || !state.raceOpen) return;
      if (!isInRace(doc)) {
        state.raceOpen = false;
        lockDown('time', 'TIME_LIMIT_REACHED');
      }
    };
    const target = doc.getElementById('hud');
    if (target && typeof MutationObserver !== 'undefined') {
      new MutationObserver(check).observe(target, { attributes: true, attributeFilter: ['class'] });
    }
    const timer = setInterval(check, 500);
    return () => clearInterval(timer);
  }

  async function boot() {
    state.phase = 'boot';
    veil('<div class="spin"></div><h2>正在确认学习资格…</h2><p>只要一秒，马上就好～</p>', []);
    let st;
    try {
      st = await gate.start();
    } catch (e) {
      state.phase = 'blocked';
      lockDown('net', e && e.code);
      return { ok: false, error: e && e.code };
    }
    state.last = st;
    if (!st.allowed || Number(st.remaining_seconds) <= 0) {
      state.phase = 'blocked';
      blockEntries(true);
      const reason = st.reason || 'TIME_LIMIT_REACHED';
      const isTime = reason === 'TIME_LIMIT_REACHED';
      veil(
        `<div class="emoji">${isTime ? '🌙' : '📚'}</div><h2>${isTime ? '今天的 30 分钟用完啦' : '先去学习再来赛车'}</h2>
         <p>${gate.messageFor ? gate.messageFor(reason) : '先去学习吧'}</p>`,
        [{ label: '去学习（V6 学习平台）', cls: 'primary', onClick: () => { doc.location.href = learnUrl; } }],
      );
      return { ok: false, reason };
    }
    removeVeil();
    state.phase = 'playing';
    hud();
    setClock(st.remaining_seconds);
    watchRace();
    if (session) {
      session.onUpdate((s) => {
        state.last = s;
        setClock(s.remaining_seconds);
        state.failures = 0;
        if (opts.onGrantRefresh) opts.onGrantRefresh(s.remaining_seconds);
        if (opts.onUpdate) opts.onUpdate(s);
        if (Number(s.remaining_seconds) <= 0) expire();
      });
      session.onError(() => {
        state.failures += 1;
        if (state.failures >= 3) {
          state.phase = 'blocked';
          if (isInRace(doc)) { blockEntries(true); banner('网络不太好，跑完这一场就休息一下吧'); }
          else lockDown('net', 'R5_NETWORK');
        }
      });
      session.onEnded(() => expire());
    }
    return { ok: true, status: st };
  }

  return {
    boot, expire, intercept, lockDown,
    state,
    isExpired: () => state.expired,
    isLocked: () => state.locked,
    entryUrl,
  };
}
