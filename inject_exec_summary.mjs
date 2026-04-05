import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DIMENSIONS } from './lib/scorer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHECK_COUNTS = { D1:8, D2:8, D3:8, D4:8, D5:8, D6:6, D7:6, D8:6, D9:6 };

// Executive summaries for all 9 tools
const SUMMARIES = {
  'CrowdStrike Falcon': {
    html: 'report_crowdstrike.html',
    marker: '九维度评分明细',
    dims: { D1:4.5, D2:4.3, D3:3.4, D4:4.7, D5:2.0, D6:3.3, D7:4.1, D8:2.7, D9:4.4 },
    tagline: '业界领先的云原生 EDR/XDR 平台，AI 驱动的实时威胁检测与自主响应',
    summary: 'CrowdStrike Falcon 作为业界领先的 EDR/XDR 平台，在威胁检测（D4: 4.7）和身份认证（D1: 4.5）方面表现卓越。云原生 AI 引擎提供实时端点保护，审计日志和 SIEM 集成能力突出。但纯云架构限制了数据主权控制（D3: 3.4），且 Prompt Injection 防御不适用（D5: 2.0）。适合安全成熟度较高的企业作为核心端点安全方案。',
    risks: [
      { sev:'high', title:'纯云架构无本地部署选项', desc:'所有端点遥测发送至 CrowdStrike 云，无法满足严格数据主权要求' },
      { sev:'medium', title:'威胁数据用于 ML 训练', desc:'隐私政策明确将威胁数据用于专有机器学习引擎' },
      { sev:'low', title:'成本可见性有限', desc:'按端点计费，缺乏精细化成本分配仪表板' }
    ],
    recs: [
      { dim:'D3', text:'对数据主权敏感场景，利用网络层控制限制遥测流向，协商 DPA 明确数据处理范围' },
      { dim:'D4', text:'部署 SIEM 集成导出完整审计日志，建立独立于云平台的安全事件追溯链' },
      { dim:'D1', text:'强制所有控制台用户启用 MFA，通过 SAML SSO 集成企业 IdP 集中身份治理' }
    ]
  },
  'Cursor': {
    html: 'report_cursor.html',
    marker: '九维度评分明细',
    dims: { D1:3.7, D2:3.0, D3:3.2, D4:2.5, D5:2.3, D6:2.0, D7:3.0, D8:3.2, D9:3.4 },
    tagline: 'AI 原生代码编辑器，以 .cursorrules 和隐私模式提供基本治理的 AI Coding IDE',
    summary: 'Cursor 作为 AI Coding IDE 新锐，在代码补全和上下文理解方面有优势，隐私模式和 .cursorrules 配置提供了基本治理能力。但在权限控制（D2: 3.0）、审计日志（D4: 2.5）和 Prompt Injection 防御（D5: 2.3）方面存在明显短板。扩展安全（D6: 2.0）是最弱环节。建议在受控开发环境中使用，并配合额外安全措施。',
    risks: [
      { sev:'high', title:'代码发送至云端推理', desc:'代码上下文传输至 Cursor 云端，企业敏感代码存在数据暴露风险' },
      { sev:'high', title:'Prompt Injection 攻击面大', desc:'Cursor 读取整个代码库上下文，恶意代码注释可能影响 AI 建议质量' },
      { sev:'medium', title:'审计日志粒度不足', desc:'缺乏细粒度的 AI 操作审计，不满足合规审计要求' }
    ],
    recs: [
      { dim:'D3', text:'配置内容排除规则，防止敏感文件（密钥、凭证）发送至云端；评估本地推理部署方案' },
      { dim:'D5', text:'建立代码审查流程，专门检查 AI 生成代码中的安全漏洞；培训开发者识别注入模式' },
      { dim:'D4', text:'实现自定义日志转发至企业 SIEM，建立 AI 辅助代码变更的审计追踪' }
    ]
  }
};

// Load 7 tools from JSON files
const JSON_TOOLS = [
  { html:'report_zscaler_internet_access.html', json:'zscaler_analysis.json', marker:'九维度雷达图' },
  { html:'report_sentinelone.html', json:'sentinelone_security_assessment.json', marker:'九维度雷达图' },
  { html:'report_okta_workforce_identity.html', json:'okta_analysis.json', marker:'九维度雷达图' },
  { html:'report_microsoft_entra_id.html', json:'entra_id_analysis.json', marker:'九维度雷达图' },
  { html:'report_fortinet_fortigate.html', json:'fortigate_analysis.json', marker:'九维度雷达图' },
  { html:'report_github_copilot_enterprise.html', json:'copilot_analysis.json', marker:'九维度雷达图' },
  { html:'report_windsurf__codeium_.html', json:'windsurf_analysis.json', marker:'九维度雷达图' }
];

const EXEC_TEXTS = {
  'Zscaler Internet Access': 'Zscaler ZIA 作为云端 SSE/SWG 平台，在数据流控制（D3: 4.7）和合规认证（D9: 4.6）方面表现卓越，150+ 全球数据中心和 Nanolog 不可变审计日志是其核心优势。但 Prompt Injection 防御不适用（D5: 0.5），且缺乏本地部署选项。适合已接受云端架构的企业作为网络安全网关。',
  'SentinelOne': 'SentinelOne Singularity XDR 在终端检测和审计追溯方面表现突出（D4: 4.5），AI 驱动的自主响应和 Storyline 技术是其差异化优势。但纯云架构限制了数据主权控制（D3: 3.4），且成本可见性较弱（D8: 2.8）。适合安全团队成熟度较高的企业作为核心 EDR 方案。',
  'Okta Workforce Identity': 'Okta 在身份认证（D1: 4.9）和配置治理（D7: 4.6）方面处于行业领先水平，30+ MFA 因子和 7000+ 预集成应用是其核心竞争力。但纯云架构（D3: 3.6）和历史安全事件是主要顾虑。作为 IAM 基础设施，不涉及 AI Prompt Injection 防御（D5: 0.8）。',
  'Microsoft Entra ID': 'Entra ID 凭借 13+ MFA 方式、Conditional Access 和 PIM 特权管理，在身份安全（D1: 4.8）和治理（D7: 4.7）方面达到顶尖水平。与 Microsoft 生态深度整合是其核心优势。适合已投入 Microsoft 生态的企业作为核心 IAM。',
  'Fortinet FortiGate': 'FortiGate 作为本地硬件 NGFW，在数据主权（D3: 5.0）和审计日志（D4: 5.0）方面达到满分，eCryptfs 加密、TPM、FIPS 模式和 air-gap 更新是其独特优势。FortiManager/FortiSIEM 提供企业级集中管理。需注意历史高危 CVE 和 FortiGuard 遥测。',
  'GitHub Copilot Enterprise': 'Copilot Enterprise 在合规（D9: 4.2）和身份集成（D1: 4.2）方面良好，SAML SSO 和 IP 赔偿条款是企业亮点。但代码需传输至云端推理（D3: 3.5）、审计粒度有限（D4: 3.4）和扩展安全模型不成熟（D6: 2.5）是主要短板。适合已有 GitHub Enterprise 的团队。',
  'Windsurf (Codeium)': 'Windsurf 作为 AI 原生 IDE，Cascade 自主代理和混合部署有创新，SOC 2 Type II 认证提供基本信任。但代理缺乏沙箱隔离（D2: 3.0）、Prompt Injection 防御薄弱（D5: 2.2）、审计日志不足（D4: 2.6）是关键安全风险。建议在受控环境中使用并配合额外安全措施。'
};

function normalizeDims(raw) {
  const dims = {};
  for (const d of DIMENSIONS) {
    const ds = raw.dimScores?.[d.id];
    if (!ds) { dims[d.id] = 0; continue; }
    let s = ds.score;
    if (s > 5) {
      const max = CHECK_COUNTS[d.id];
      s = (ds.checks.filter(c => c >= 0.5).length / ds.checks.length) * 5;
    }
    dims[d.id] = Math.round(s * 10) / 10;
  }
  return dims;
}

function buildHTML(summary, dims, risks, recs) {
  const entries = DIMENSIONS.map(d => ({ dim: d, score: dims[d.id] ?? 0 }));
  const sorted = [...entries].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const bot3 = sorted.slice(-3).reverse();

  let h = '';

  // Summary box
  h += '<div style="grid-column:1/-1;background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius);padding:20px;margin-bottom:16px">';
  h += '<div style="font-size:14px;font-weight:700;color:var(--accent);margin-bottom:8px">📋 执行摘要</div>';
  h += '<div style="font-size:14px;color:var(--text-second);line-height:1.8">' + summary + '</div>';
  h += '</div>';

  // Strengths + Weaknesses row
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">';

  // Strengths
  h += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px">';
  h += '<div style="font-size:12px;font-weight:700;color:#10b981;margin-bottom:10px">💪 核心优势（Top 3 维度）</div>';
  for (const t of top3) {
    h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(16,185,129,.15)">';
    h += '<span style="font-size:16px">' + t.dim.icon + '</span>';
    h += '<span style="flex:1;font-size:13px;color:var(--text-second)">' + t.dim.id + ' ' + t.dim.name + '</span>';
    h += '<span style="font-size:14px;font-weight:800;color:#10b981">' + t.score.toFixed(1) + '</span>';
    h += '<div style="width:60px;height:6px;background:rgba(16,185,129,.15);border-radius:3px;overflow:hidden">';
    h += '<div style="width:' + (t.score/5*100).toFixed(0) + '%;height:100%;background:#10b981;border-radius:3px"></div></div></div>';
  }
  h += '</div>';

  // Weaknesses
  h += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px">';
  h += '<div style="font-size:12px;font-weight:700;color:#ef4444;margin-bottom:10px">⚠️ 主要短板（Bottom 3 维度）</div>';
  for (const b of bot3) {
    const c = b.score >= 3 ? '#f59e0b' : b.score >= 2 ? '#f97316' : '#ef4444';
    h += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(239,68,68,.1)">';
    h += '<span style="font-size:16px">' + b.dim.icon + '</span>';
    h += '<span style="flex:1;font-size:13px;color:var(--text-second)">' + b.dim.id + ' ' + b.dim.name + '</span>';
    h += '<span style="font-size:14px;font-weight:800;color:' + c + '">' + b.score.toFixed(1) + '</span>';
    h += '<div style="width:60px;height:6px;background:rgba(239,68,68,.1);border-radius:3px;overflow:hidden">';
    h += '<div style="width:' + (b.score/5*100).toFixed(0) + '%;height:100%;background:' + c + ';border-radius:3px"></div></div></div>';
  }
  h += '</div></div>';

  // Risks + Recs row
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">';

  // Risks
  h += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px">';
  h += '<div style="font-size:12px;font-weight:700;color:#ef4444;margin-bottom:10px">🚨 关键风险</div>';
  if (risks.length === 0) {
    h += '<div style="font-size:12px;color:var(--text-muted)">无高风险项</div>';
  }
  for (const r of risks.slice(0, 3)) {
    const ic = r.sev === 'high' ? '🔴' : r.sev === 'medium' ? '🟡' : '🟢';
    h += '<div style="padding:8px 0;border-bottom:1px solid var(--border)">';
    h += '<div style="font-size:12px;font-weight:600;color:var(--text-primary)">' + ic + ' ' + r.title + '</div>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + (r.desc || '').substring(0, 120) + '</div>';
    h += '</div>';
  }
  h += '</div>';

  // Recs
  h += '<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px">';
  h += '<div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:10px">🎯 提升建议</div>';
  if (recs.length === 0) {
    h += '<div style="font-size:12px;color:var(--text-muted)">无特别建议</div>';
  }
  for (const r of recs.slice(0, 3)) {
    h += '<div style="display:flex;align-items:flex-start;gap:6px;padding:6px 0;border-bottom:1px solid var(--border)">';
    h += '<span style="color:var(--accent);font-size:11px;margin-top:2px">▶</span>';
    h += '<span style="font-size:12px;color:var(--text-second);line-height:1.5"><strong>' + r.dim + ':</strong> ' + r.text.substring(0, 100) + '</span>';
    h += '</div>';
  }
  h += '</div></div>';

  return h;
}

// Process inline tools (CrowdStrike, Cursor)
for (const [name, cfg] of Object.entries(SUMMARIES)) {
  const fp = path.join(__dirname, cfg.html);
  if (!fs.existsSync(fp)) { console.log('SKIP', cfg.html); continue; }
  let html = fs.readFileSync(fp, 'utf-8');
  const marker = cfg.marker;
  const idx = html.indexOf(marker);
  if (idx === -1) { console.log('NO MARKER', cfg.html); continue; }
  const insertPos = html.lastIndexOf('<h2', idx);
  const execHTML = buildHTML(cfg.summary, cfg.dims, cfg.risks, cfg.recs);
  html = html.substring(0, insertPos) + execHTML + '\n  ' + html.substring(insertPos);
  fs.writeFileSync(fp, html, 'utf-8');
  console.log('✅', name);
}

// Process JSON tools
for (const t of JSON_TOOLS) {
  const htmlPath = path.join(__dirname, t.html);
  const jsonPath = path.join(__dirname, t.json);
  if (!fs.existsSync(htmlPath) || !fs.existsSync(jsonPath)) { console.log('SKIP', t.html); continue; }
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  let html = fs.readFileSync(htmlPath, 'utf-8');
  const marker = t.marker;
  const idx = html.indexOf(marker);
  if (idx === -1) { console.log('NO MARKER', t.html); continue; }
  const insertPos = html.lastIndexOf('<h2', idx);
  const dims = normalizeDims(raw);
  const summary = EXEC_TEXTS[raw.toolName] || '';
  const risks = (raw.risks || []).map(r => ({ sev: r.severity || 'medium', title: r.title || '', desc: r.desc || r.description || '' }));
  const recs = (raw.recs || []).map(r => ({ dim: r.dim || '', text: r.text || r.description || '' }));
  const execHTML = buildHTML(summary, dims, risks, recs);
  html = html.substring(0, insertPos) + execHTML + '\n  ' + html.substring(insertPos);
  fs.writeFileSync(htmlPath, html, 'utf-8');
  console.log('✅', raw.toolName);
}

console.log('\n✅ All executive summaries injected!');
