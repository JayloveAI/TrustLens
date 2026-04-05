// ─────────────────────────────────────────────────────────────
//  TrustLens — Scoring Engine (shared with frontend data.js)
//  No DOM dependency — usable in both browser and Node.js CLI
// ─────────────────────────────────────────────────────────────

const DIMENSIONS = [
  { id: 'D1', name: '身份认证与访问控制', icon: '🔐', weight: 0.15, color: '#6366f1',
    description: '评估 AI 工具的身份认证强度，包括支持的认证协议、多因素认证、Token 管理等。',
    checks: [
      { name: '支持 OAuth 2.0 / PKCE', weight: 1.5 },
      { name: 'Token 自动续期机制',    weight: 1.0 },
      { name: '认证凭证无明文本地存储', weight: 1.5 },
      { name: '支持 MFA',             weight: 1.5 },
      { name: '支持企业 SSO / SAML',   weight: 2.0 },
      { name: '支持 API Key 权限范围限制', weight: 1.0 },
      { name: '支持集中式身份管理(AD)', weight: 1.0 },
      { name: 'Bearer Token 传输安全', weight: 0.5 },
    ] },
  { id: 'D2', name: '权限最小化与操作授权', icon: '🛡️', weight: 0.20, color: '#10b981',
    description: '评估 AI 工具对文件系统、命令执行等高危操作的权限控制精度。',
    checks: [
      { name: '多级权限模型（非仅允许/拒绝）',  weight: 2.0 },
      { name: '支持禁用命令执行（ReadOnly模式）', weight: 2.0 },
      { name: '文件操作范围可限制到目录',         weight: 1.5 },
      { name: '未知操作默认最高权限要求',          weight: 1.5 },
      { name: '危险操作有二次确认机制',            weight: 1.5 },
      { name: '沙箱默认开启且不易关闭',            weight: 2.0 },
      { name: '操作有执行时间超时控制',            weight: 1.0 },
      { name: '权限配置可集中推送给所有用户',       weight: 1.5 },
    ] },
  { id: 'D3', name: '数据流向与主权控制', icon: '🌐', weight: 0.18, color: '#f59e0b',
    description: '评估代码数据发送到哪里、是否可以通过企业安全网关拦截、是否支持私有化部署。',
    checks: [
      { name: '支持 HTTPS 企业代理', weight: 2.0 },
      { name: '代理设置传播到子进程（bash等）', weight: 1.5 },
      { name: '支持自定义 API 端点（企业网关）', weight: 1.5 },
      { name: '支持企业 CA 证书替换', weight: 1.0 },
      { name: '无后台遥测/分析数据',  weight: 2.0 },
      { name: '支持私有化本地部署',   weight: 2.0 },
      { name: '数据不用于模型训练',   weight: 1.5 },
      { name: '代码数据边界文档明确', weight: 0.5 },
    ] },
  { id: 'D4', name: '审计日志与可追溯性', icon: '📋', weight: 0.15, color: '#3b82f6',
    description: '评估 AI 工具的操作记录完整性，包括工具调用日志、会话持久化和 SIEM 集成能力。',
    checks: [
      { name: '每次工具调用有日志记录',   weight: 2.0 },
      { name: '日志含工具名称与输入参数', weight: 2.0 },
      { name: '日志含时间戳',            weight: 1.0 },
      { name: '日志自动持久化（不依赖用户）', weight: 1.5 },
      { name: '会话可完整导出/存档',     weight: 1.0 },
      { name: 'SIEM 集成（Splunk/ELK）', weight: 2.0 },
      { name: '日志防篡改机制',          weight: 1.5 },
      { name: '日志保留期可配置',        weight: 1.0 },
    ] },
  { id: 'D5', name: 'Prompt Injection 防御', icon: '🧠', weight: 0.12, color: '#ef4444',
    description: '评估 AI 工具对外部内容中嵌入恶意指令的抵御能力。',
    checks: [
      { name: '系统提示含注入防御指令',    weight: 2.0 },
      { name: '外部文件内容有长度上限',    weight: 1.5 },
      { name: '用户配置无法覆盖安全指令',  weight: 2.0 },
      { name: 'AI 会主动警告可疑注入',     weight: 2.0 },
      { name: 'PreToolUse 钩子可拦截',    weight: 1.5 },
      { name: '注入测试场景1通过（文件内容）', weight: 1.5 },
      { name: '注入测试场景2通过（角色扮演）', weight: 1.5 },
      { name: '注入测试场景3通过（间接URL）',  weight: 1.0 },
    ] },
  { id: 'D6', name: '第三方扩展（MCP/插件）安全', icon: '🔌', weight: 0.08, color: '#8b5cf6',
    description: '评估 AI 工具的插件/扩展生态系统安全机制，防止供应链攻击。',
    checks: [
      { name: 'MCP 在独立进程中运行',  weight: 2.0 },
      { name: 'MCP 白名单/黑名单机制', weight: 2.0 },
      { name: 'MCP 配置有签名保护',    weight: 1.5 },
      { name: '远程 MCP 支持 OAuth',   weight: 1.5 },
      { name: 'MCP 受主权限模型约束',  weight: 2.0 },
      { name: '管理员可禁止用户添加 MCP', weight: 2.0 },
    ] },
  { id: 'D7', name: '配置治理与集中管控', icon: '⚙️', weight: 0.06, color: '#06b6d4',
    description: '评估企业管理员能否集中推送配置，防止用户绕过安全策略。',
    checks: [
      { name: '支持项目级统一配置',    weight: 2.0 },
      { name: '管理员策略不可被用户覆盖', weight: 2.5 },
      { name: '配置支持继承与深度合并', weight: 1.5 },
      { name: '有管理后台推送配置',    weight: 2.0 },
      { name: '配置变更有版本历史',    weight: 1.5 },
      { name: '支持环境变量强制覆盖',  weight: 0.5 },
    ] },
  { id: 'D8', name: '成本控制与使用监控', icon: '💰', weight: 0.04, color: '#84cc16',
    description: '评估 Token 用量可见性、预算控制和费用异常告警能力。',
    checks: [
      { name: '实时 Token 用量显示',  weight: 2.0 },
      { name: '实时费用估算',         weight: 1.5 },
      { name: '上下文自动压缩机制',   weight: 1.5 },
      { name: '团队/项目预算硬限制',  weight: 2.0 },
      { name: '异常用量告警',         weight: 2.0 },
      { name: '按用户/项目分账报告',  weight: 1.0 },
    ] },
  { id: 'D9', name: '合规与法规对齐', icon: '📜', weight: 0.02, color: '#f43f5e',
    description: '评估工具与主要数据保护法规（GDPR/PIPL/SOC2）的对齐程度。',
    checks: [
      { name: 'DPA 数据处理协议可签署', weight: 2.0 },
      { name: 'SOC 2 Type II 认证',    weight: 2.0 },
      { name: '数据主体删除权技术支持', weight: 2.0 },
      { name: '数据存储地域可选(PIPL)', weight: 2.0 },
      { name: 'AI 内容标注/溯源能力',  weight: 1.0 },
      { name: '供应商安全事件通知流程', weight: 1.0 },
    ] },
];

const INDUSTRY_THRESHOLDS = {
  tech:       { min: 70, label: '互联网/科技', keyDims: ['D2','D4'] },
  finance:    { min: 85, label: '金融/银行',   keyDims: ['D2','D3','D4'] },
  healthcare: { min: 80, label: '医疗/生命科学', keyDims: ['D3','D5'] },
  gov:        { min: 90, label: '政府/军工',   keyDims: ['D3'] },
  startup:    { min: 60, label: '初创企业',    keyDims: [] },
};

function computeScore(dimScores) {
  return DIMENSIONS.reduce((sum, d) => {
    const ds = dimScores[d.id];
    return sum + (ds ? ds.score / 5 * 100 * d.weight : 0);
  }, 0);
}

function gradeFromScore(s) {
  if (s >= 90) return 'A+';
  if (s >= 80) return 'A';
  if (s >= 65) return 'B';
  if (s >= 50) return 'C';
  return 'D';
}

function scoreColor(s) {
  if (s >= 80) return '#10b981';
  if (s >= 65) return '#f59e0b';
  return '#ef4444';
}

function verdictText(g) {
  return {
    'A+': '✅ 企业级可信，推荐引入',
    'A':  '✅ 可引入，需监控特定风险',
    'B':  '⚠️ 有条件引入，需补偿控制',
    'C':  '❌ 高风险，不建议引入',
    'D':  '❌ 不适合企业使用',
  }[g];
}

export { DIMENSIONS, INDUSTRY_THRESHOLDS, computeScore, gradeFromScore, scoreColor, verdictText };
