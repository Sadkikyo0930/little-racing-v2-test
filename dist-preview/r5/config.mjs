/**
 * r5/config.mjs — 赛车测试站 R5 闸门配置
 *
 * 这里只有「公开信息」：云函数 HTTPS 地址、家庭 ID、学习平台地址。
 * 绝不能放：SecretId/SecretKey、数据库密码、service_role、家长密钥、真实设备令牌。
 */
export const R5_CONFIG = {
  // CloudBase 云函数（第三阶段已部署并通过 32/32 验收）
  base: 'https://normal-goose-d5g4qyzr8bb389a4a.service.tcloudbase.com/r5',
  familyId: 'r5-selftest-family',

  // 未完成学习时「返回 V6 学习平台」的入口
  learnUrl: 'https://sadkikyo0930.github.io/little-growth-workbench/v6-selftest/',

  // 游戏构建产物目录（相对站点根）
  gamePath: 'dist-preview/index.html',

  // 授权票据有效期（秒）。云端才是计时真相，这里只决定刷新后是否需要重新过闸门。
  grantTtlSeconds: 300,

  // 心跳间隔上限，实际以服务端返回 heartbeat_seconds 为准
  heartbeatSeconds: 10,
};

/** 读取当前站点路径前缀：GitHub Pages 项目页是 /little-racing-v2-test/，本地是 / */
export function siteRoot() {
  const parts = location.pathname.split('/').filter(Boolean);
  // dist-preview/index.html → 去掉最后两段
  if (parts.length >= 2 && parts[parts.length - 1].endsWith('.html')) parts.length -= 1;
  if (parts[parts.length - 1] === 'dist-preview') parts.pop();
  return parts.length ? '/' + parts.join('/') + '/' : '/';
}

/** 入口页地址（用于守卫在票据缺失时退回） */
export function entryUrl() {
  return siteRoot();
}

/** 游戏页地址 */
export function gameUrl() {
  return siteRoot() + R5_CONFIG.gamePath;
}

/** 学习平台地址（每次打开时可被 ?learn= 覆盖） */
export function learnUrl() {
  return R5_CONFIG.learnUrl;
}
