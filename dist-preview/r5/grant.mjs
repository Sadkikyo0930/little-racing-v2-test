/**
 * r5/grant.mjs — 设备令牌与「过闸凭证」的本地存储
 *
 * 设计要点：
 *  1. 设备令牌只存在孩子这台设备的 localStorage，绝不出现在源码/URL 之外的地方；
 *  2. 「过闸凭证」存在 sessionStorage，5 分钟滑动过期，心跳成功就续期；
 *  3. 凭证只代表「刚刚云端说过可以玩」，剩余时间永远以云端返回为准，
 *     所以刷新/重开页面不会重置时间，也拿不到额外时间。
 */

const DEVICE_KEY = 'r5_device';
const GRANT_KEY = 'r5.grant';

/** 从 URL 的 ?d= 读设备令牌（家长给孩子的链接），并落到 localStorage */
export function captureDeviceFromUrl(search = location.search) {
  const fromQuery = new URLSearchParams(search).get('d');
  if (fromQuery && fromQuery !== 'r5-demo-device-0001' && /^[A-Za-z0-9_-]{8,80}$/.test(fromQuery)) {
    try { localStorage.setItem(DEVICE_KEY, fromQuery); } catch { /* 隐私模式：仅本次有效 */ }
    return fromQuery;
  }
  return null;
}

export function getDevice() {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    return v && v !== 'r5-demo-device-0001' && /^[A-Za-z0-9_-]{8,80}$/.test(v) ? v : '';
  } catch {
    return '';
  }
}

export function setDevice(device) {
  try { localStorage.setItem(DEVICE_KEY, device); } catch { /* ignore */ }
}

export function clearDevice() {
  try { localStorage.removeItem(DEVICE_KEY); } catch { /* ignore */ }
}

/** 云端确认「可以玩」后签发凭证（仅内存/会话级，不写 localStorage） */
export function issueGrant(device, ttlSeconds = 300, extra = {}) {
  const grant = { device, at: Date.now(), exp: Date.now() + ttlSeconds * 1000, ...extra };
  try { sessionStorage.setItem(GRANT_KEY, JSON.stringify(grant)); } catch { /* ignore */ }
  return grant;
}

export function refreshGrant(ttlSeconds = 300) {
  const g = readGrantRaw();
  if (!g) return null;
  const next = { ...g, exp: Date.now() + ttlSeconds * 1000 };
  try { sessionStorage.setItem(GRANT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  return next;
}

export function readGrantRaw() {
  try {
    const raw = sessionStorage.getItem(GRANT_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    return g && typeof g === 'object' ? g : null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ok:boolean, reason?:string, grant?:object}}
 *  reason: 'NO_DEVICE' | 'NO_GRANT' | 'GRANT_EXPIRED' | 'GRANT_DEVICE_MISMATCH'
 */
export function readGrant(device = getDevice(), now = Date.now()) {
  if (!device) return { ok: false, reason: 'NO_DEVICE' };
  const g = readGrantRaw();
  if (!g) return { ok: false, reason: 'NO_GRANT' };
  if (g.device !== device) return { ok: false, reason: 'GRANT_DEVICE_MISMATCH' };
  if (!(Number(g.exp) > now)) return { ok: false, reason: 'GRANT_EXPIRED' };
  return { ok: true, grant: g };
}

export function clearGrant() {
  try { sessionStorage.removeItem(GRANT_KEY); } catch { /* ignore */ }
}
