/**
 * r5/r5-online.mjs — R5 学习闸门 · 浏览器端 SDK（零依赖、零密钥）
 *
 * 与第三阶段交付的 client/r5-online.mjs 接口一致，仅补充了两个 reason 文案，
 * 以便赛车测试站直接引用，不再依赖 ../r5-cloudbase 目录。
 */

export const R5_DEFAULT_BASE = 'https://normal-goose-d5g4qyzr8bb389a4a.service.tcloudbase.com/r5';
export const R5_DEFAULT_FAMILY = 'little-growth-family-001';

/** 业务原因 → 给孩子看的话（5 岁，短句、不吓人） */
export const R5_MESSAGES = {
  STUDY_PASSED: '学习完成啦，去赛车吧！',
  STUDY_INCOMPLETE_OR_SCORE_UNVERIFIED: '今天的两个学习任务还没完成，先去学习吧～',
  NO_TASKS_TODAY: '今天是休息日，可以放心玩！',
  PLAN_UNPUBLISHED: '今天的学习计划还没安排，先请爸爸妈妈看一下～',
  TIME_LIMIT_REACHED: '今天的 30 分钟用完啦，明天再来！',
  PARENT_CONTROL_DISABLED: '今天爸爸妈妈关掉了赛车，休息一下吧～',
  PARENT_DISABLED: '今天爸爸妈妈关掉了赛车，休息一下吧～',
  R5_MEMBER_DENIED: '这台设备还没绑定，请让爸爸妈妈帮你绑定一下。',
  R5_DEVICE_REQUIRED: '没有找到设备号，请用爸爸妈妈给你的链接打开。',
  R5_INVALID_DEVICE: '设备号看起来不对，请用爸爸妈妈给你的链接打开。',
  R5_TIME_UP: '今天的 30 分钟用完啦，明天再来！',
  R5_FAMILY_NOT_ALLOWED: '这台设备没有加入家庭。',
  R5_GATEWAY_ERROR: '网络有点忙，等一下再试试。',
  R5_NETWORK: '网络连不上，先检查一下 WiFi 哦。',
  R5_BAD_RESPONSE: '服务回应看不懂，等一下再试试。',
  R5_TIMEOUT: '等太久了，再试一次吧。',
};

export function messageFor(reason) {
  return R5_MESSAGES[reason] || R5_MESSAGES.R5_GATEWAY_ERROR;
}

export class R5Error extends Error {
  constructor(code, status, payload) {
    super(code || 'R5_ERROR');
    this.code = code || 'R5_ERROR';
    this.status = status;
    this.payload = payload;
  }
}

export function createR5Gate(options = {}) {
  const base = String(options.base || R5_DEFAULT_BASE).replace(/\/$/, '');
  const familyId = options.familyId || R5_DEFAULT_FAMILY;
  const device = options.device || '';
  const fetchImpl = options.fetch || globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs || 15000;

  async function post(path, body) {
    if (!device) throw new R5Error('R5_DEVICE_REQUIRED', 0, null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res, text;
    try {
      res = await fetchImpl(base + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-r5-device': device },
        body: JSON.stringify({ family_id: familyId, ...body }),
        signal: ctrl.signal,
      });
      text = await res.text();
    } catch (e) {
      const aborted = e && (e.name === 'AbortError' || /aborted/i.test(String(e.message)));
      throw new R5Error(aborted ? 'R5_TIMEOUT' : 'R5_NETWORK', 0, String(e && e.message));
    } finally {
      clearTimeout(timer);
    }
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep null */ }
    if (!json) throw new R5Error('R5_BAD_RESPONSE', res.status, text);
    if (json.error) throw new R5Error(json.error, res.status, json);
    return json;
  }

  return {
    base, familyId, device,
    status: () => post('/v1/child/entry', {}),
    start: () => post('/v1/game/action', { action: 'start' }),
    tick: () => post('/v1/game/action', { action: 'tick' }),
    stop: () => post('/v1/game/action', { action: 'stop' }),
    messageFor,
  };
}

/**
 * 计时会话：10 秒心跳、切后台暂停、归零回调、退出停止。
 * 服务端是唯一真相：前端永远不自己算剩余时间，也不做「每天重置」。
 */
export class R5Session {
  constructor(gate, handlers = {}) {
    this.gate = gate;
    this.onUpdate = handlers.onUpdate || (() => {});
    this.onEnded = handlers.onEnded || (() => {});
    this.onPaused = handlers.onPaused || (() => {});
    this.onError = handlers.onError || (() => {});
    this.heartbeatMs = (handlers.heartbeatSeconds || 10) * 1000;
    this.active = false;
    this.state = null;
    this._timer = null;
    this._visBound = this._onVisibility.bind(this);
  }

  _emit(st) { this.state = st; this.onUpdate(st); }

  _schedule() {
    clearInterval(this._timer);
    if (!this.active) return;
    this._timer = setInterval(() => { this.beat(); }, this.heartbeatMs);
  }

  async begin() {
    const st = await this.gate.start();
    this._emit(st);
    if (!st.allowed) {
      this.active = false;
      if (st.reason === 'TIME_LIMIT_REACHED') this.onEnded(st);
      return st;
    }
    this.active = true;
    this._schedule();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._visBound);
    }
    return st;
  }

  async beat() {
    if (!this.active) return this.state;
    try {
      const st = await this.gate.tick();
      this._emit(st);
      if (!st.active || Number(st.remaining_seconds) <= 0) {
        await this.end('TIME_LIMIT_REACHED');
        this.onEnded(st);
      }
      return st;
    } catch (e) {
      this.onError(e);
      return this.state;
    }
  }

  async end(reason) {
    if (!this.active && this.state && this.state.active === false) return this.state;
    this.active = false;
    clearInterval(this._timer);
    this._timer = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visBound);
    }
    try {
      const st = await this.gate.stop();
      this._emit(st);
      if (reason === 'TIME_LIMIT_REACHED') this.onEnded(st);
      return st;
    } catch (e) {
      this.onError(e);
      return this.state;
    }
  }

  async _onVisibility() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden' && this.active) {
      const st = await this.end('PAUSED');
      this.onPaused(st);
    }
  }

  destroy() {
    clearInterval(this._timer);
    this._timer = null;
    this.active = false;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visBound);
    }
  }
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}
