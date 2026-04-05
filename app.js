// ─────────────────────────────────────────────────────────────
//  TrustLens — Application Logic
//  v2: Differentiated Quick / Standard / Deep evaluation modes
// ─────────────────────────────────────────────────────────────

let currentEval = null;
let radarChart  = null;

// ── Screen helpers ──────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function updateModeHint() {
  const mode = document.getElementById('eval-mode').value;
  ['quick', 'standard', 'deep'].forEach(m => {
    const el = document.getElementById('mh-' + m);
    if (el) el.classList.toggle('active', m === mode);
  });
}

// ═══════════════════════════════════════════════════════════════
//  EVALUATION MODE DEFINITIONS
//
//  Each mode controls:
//  1. Which dimensions are scored (coverage)
//  2. Which checks within a dim are actually tested vs inferred
//  3. The scan animation steps shown to the user
//  4. Confidence level attached to each check result
//  5. Score adjustments (unverified dims get a penalty)
//  6. Report disclaimers
// ═══════════════════════════════════════════════════════════════

const EVAL_MODES = {
  // ─── Quick: questionnaire-only, core dims only (~5 min) ────
  quick: {
    label: '快速评估',
    activeDims: ['D1', 'D2', 'D3'],       // only 3 core dims
    // For active dims, only check indexes listed here; rest = 'skipped'
    activeChecks: {
      D1: [0, 2, 3],       // OAuth, no plaintext, MFA
      D2: [0, 1, 5],       // multi-level, disable-exec, sandbox
      D3: [4, 5, 6],       // no telemetry, private deploy, not for training
    },
    checkMethod: 'questionnaire',          // how checks are performed
    confidenceLabel: '问卷自述',
    confidenceLevel: 0.6,                  // 60% confidence (self-reported)
    untestedPenalty: 0.7,                  // untested dims get 70% of estimated score
    scanSteps: [
      { msg: '解析工具公开文档…',            status: 'ok',   pct: 20 },
      { msg: '核对认证方式声明…',            status: 'ok',   pct: 45 },
      { msg: '核对权限控制声明…',            status: 'ok',   pct: 70 },
      { msg: '核对数据处理声明…',            status: 'ok',   pct: 90 },
      { msg: '生成快速评估报告…',            status: 'ok',   pct: 100 },
    ],
    stepDelay: 300,
    disclaimer: '⚠️ 快速评估仅基于公开文档与自述问卷，仅覆盖 3 个核心维度（D1/D2/D3）。其余 6 个维度为推断评分，可信度 60%。建议升级为"标准评估"以获得全维度覆盖。',
  },

  // ─── Standard: all 9 dims, doc + simulated probes (~15 min) ──
  standard: {
    label: '标准评估',
    activeDims: ['D1','D2','D3','D4','D5','D6','D7','D8','D9'],
    activeChecks: null,                     // all checks are active
    checkMethod: 'doc+probe',              // doc review + lightweight probes
    confidenceLabel: '文档 + 模拟探测',
    confidenceLevel: 0.8,                  // 80% confidence
    untestedPenalty: 1.0,                  // no penalty (all dims tested)
    scanSteps: [
      { msg: '正在解析工具文档…',               status: 'ok',   pct: 8 },
      { msg: '检测认证机制（OAuth/API Key）…',   status: 'ok',   pct: 18 },
      { msg: '分析权限控制模型…',               status: 'ok',   pct: 28 },
      { msg: '启动网络流量探针…',               status: 'ok',   pct: 38 },
      { msg: '捕获外发端点列表…',               status: 'warn', pct: 48 },
      { msg: '执行 Prompt Injection 测试集…',   status: 'ok',   pct: 58 },
      { msg: '检查 MCP 扩展隔离机制…',          status: 'ok',   pct: 68 },
      { msg: '分析配置治理能力…',               status: 'ok',   pct: 78 },
      { msg: '对照行业基准计算加权得分…',        status: 'ok',   pct: 90 },
      { msg: '生成评估报告…',                   status: 'ok',   pct: 100 },
    ],
    stepDelay: 400,
    disclaimer: '标准评估覆盖全部 9 大维度，基于文档分析与模拟探测，可信度 80%。注入攻击测试为模拟推断（未在真实沙箱中运行），建议对 D5 结果进行"深度评估"验证。',
  },

  // ─── Deep: all dims, real sandbox + traffic + injection (~45 min) ──
  deep: {
    label: '深度评估',
    activeDims: ['D1','D2','D3','D4','D5','D6','D7','D8','D9'],
    activeChecks: null,                     // all checks active
    checkMethod: 'sandbox+traffic+inject',
    confidenceLabel: '沙箱实测 + 流量分析',
    confidenceLevel: 0.95,                 // 95% confidence
    untestedPenalty: 1.0,
    scanSteps: [
      { msg: '启动 Docker 沙箱环境…',              status: 'ok',   pct: 4 },
      { msg: '注入 mitmproxy 流量拦截层…',          status: 'ok',   pct: 8 },
      { msg: '安装目标 AI 工具到沙箱…',              status: 'ok',   pct: 14 },
      { msg: '执行 OAuth/API Key 认证流检测…',      status: 'ok',   pct: 20 },
      { msg: '发送 Token 有效期测试请求…',           status: 'ok',   pct: 24 },
      { msg: '测试 ReadOnly 模式下写入行为…',        status: 'ok',   pct: 30 },
      { msg: '测试沙箱关闭字段有效性…',              status: 'ok',   pct: 34 },
      { msg: '测试未注册工具默认权限…',              status: 'ok',   pct: 38 },
      { msg: '读取网络流量捕获日志…',                status: 'ok',   pct: 42 },
      { msg: '分析外发端点与 TLS 指纹…',             status: 'warn', pct: 46 },
      { msg: '验证代理环境变量传播到子进程…',        status: 'ok',   pct: 50 },
      { msg: '提取审计日志并验证完整性…',            status: 'ok',   pct: 54 },
      { msg: '构造注入向量 #1: 文件系统覆盖指令…',   status: 'ok',   pct: 58 },
      { msg: '构造注入向量 #2: 角色扮演攻击…',       status: 'ok',   pct: 62 },
      { msg: '构造注入向量 #3: URL 间接注入…',       status: 'warn', pct: 66 },
      { msg: '分析注入测试 AI 响应…',                status: 'ok',   pct: 70 },
      { msg: '检查 MCP 进程隔离与签名…',             status: 'ok',   pct: 74 },
      { msg: '测试配置覆盖与继承…',                  status: 'ok',   pct: 78 },
      { msg: '采集 Token 用量与成本追踪日志…',       status: 'ok',   pct: 82 },
      { msg: '执行压力测试: 100轮对话成本监控…',     status: 'ok',   pct: 86 },
      { msg: '核对合规文档与 DPA 条款…',             status: 'ok',   pct: 90 },
      { msg: '计算加权得分与置信区间…',              status: 'ok',   pct: 96 },
      { msg: '生成深度评估报告…',                    status: 'ok',   pct: 100 },
    ],
    stepDelay: 260,
    disclaimer: '深度评估在隔离 Docker 沙箱中执行了全部 39 项检查，含 3 组 Prompt Injection 攻击测试与实时流量分析，可信度 95%。',
  },
};

// ═══════════════════════════════════════════════════════════════
//  ENTRY POINTS
// ═══════════════════════════════════════════════════════════════

function startEvaluation() {
  const name = document.getElementById('tool-name').value.trim();
  if (!name) {
    document.getElementById('tool-name').focus();
    document.getElementById('tool-name').style.borderColor = '#ef4444';
    setTimeout(() => document.getElementById('tool-name').style.borderColor = '', 1500);
    return;
  }
  const version  = document.getElementById('tool-version').value.trim() || 'latest';
  const industry = document.getElementById('industry').value;
  const evalMode = document.getElementById('eval-mode').value;

  // Preset match via TOOL_ALIASES
  const key = name.toLowerCase().replace(/[\s\-_]+/g, '');
  const presetKey = TOOL_ALIASES[key];
  if (presetKey) {
    loadPreset(presetKey, industry, evalMode);
    return;
  }

  runSimulatedScan(name, version, industry, evalMode);
}

function loadDemo() {
  loadPreset('claude-code', 'finance', 'standard');
}

function loadPreset(presetKey, industry, evalMode) {
  const preset = JSON.parse(JSON.stringify(PRESET_EVALUATIONS[presetKey]));
  preset.industry = industry || preset.industry;
  preset.evalMode = evalMode || preset.evalMode || 'standard';
  const modeConf = EVAL_MODES[preset.evalMode];

  // Apply mode filtering to the preset
  applyModeToEval(preset, modeConf);

  runScanAnimation(preset.toolName, modeConf, () => renderResults(preset, modeConf));
}

// ═══════════════════════════════════════════════════════════════
//  MODE-AWARE SCORING
// ═══════════════════════════════════════════════════════════════

/**
 * applyModeToEval — adjusts an evaluation object based on the mode:
 *  - marks untested dims
 *  - marks skipped checks
 *  - applies confidence penalty to untested dims
 */
function applyModeToEval(eval_, modeConf) {
  eval_.modeLabel      = modeConf.label;
  eval_.confidenceLabel = modeConf.confidenceLabel;
  eval_.confidenceLevel = modeConf.confidenceLevel;
  eval_.disclaimer     = modeConf.disclaimer;

  DIMENSIONS.forEach(dim => {
    const ds = eval_.dimScores[dim.id];
    if (!ds) return;

    const isActive = modeConf.activeDims.includes(dim.id);
    ds.tested = isActive;

    if (!isActive) {
      // Untested dim: apply penalty and mark checks as skipped
      ds.score = ds.score * modeConf.untestedPenalty;
      ds.checks = ds.checks.map(() => -1); // -1 = skipped
      ds.method = '推断';
      ds.confidence = modeConf.confidenceLevel * 0.6; // lower confidence for untested
    } else {
      ds.method = modeConf.checkMethod;
      ds.confidence = modeConf.confidenceLevel;

      // If activeChecks is specified, mask non-active checks
      if (modeConf.activeChecks && modeConf.activeChecks[dim.id]) {
        const activeIdx = new Set(modeConf.activeChecks[dim.id]);
        ds.checks = ds.checks.map((v, i) => activeIdx.has(i) ? v : -1);
        // Recalculate score based on only the tested checks
        const tested = ds.checks.filter(v => v >= 0);
        const testedScore = tested.length > 0 ? (tested.reduce((a, b) => a + b, 0) / tested.length) * 5 : ds.score;
        ds.score = testedScore * modeConf.confidenceLevel;
        ds.confidence = modeConf.confidenceLevel;
      }
    }
  });

  // For Quick mode: add extra risk about untested dims
  if (modeConf === EVAL_MODES.quick) {
    eval_.risks = [
      { dim: '全局', severity: 'high', title: '6 个维度未评估（仅覆盖 D1/D2/D3）',
        desc: '快速评估仅覆盖身份认证、权限控制、数据主权三个核心维度。审计日志（D4）、注入防御（D5）、扩展安全（D6）、配置治理（D7）、成本控制（D8）、合规（D9）均为推断评分，建议升级为标准评估。' },
      ...eval_.risks.slice(0, 2),
    ];
    eval_.recs = [
      { dim: '全局', text: '升级为"标准评估"（~15分钟）以获得全9维度覆盖，特别是 D5 注入防御的测试验证。' },
      ...eval_.recs.slice(0, 2),
    ];
  }

  // For Deep mode: add extra confidence info
  if (modeConf === EVAL_MODES.deep) {
    eval_.recs = [
      ...eval_.recs,
      { dim: 'D5', text: '深度评估已在沙箱中执行 3 组注入攻击测试，结果可信度 95%。建议每次工具大版本更新后重新执行。' },
    ];
  }
}

// ─── Simulated Scan for Unknown Tools ─────────────────────────
function runSimulatedScan(name, version, industry, evalMode) {
  const modeConf = EVAL_MODES[evalMode] || EVAL_MODES.standard;
  const seed = hashStr(name);
  const rng  = seededRand(seed);
  const dimScores = {};
  DIMENSIONS.forEach(d => {
    const base   = 1.5 + rng() * 2.5;
    const checks = d.checks.map(() => rng() > 0.4 ? 1 : 0);
    dimScores[d.id] = { score: Math.min(5, base), checks };
  });
  const eval_ = {
    toolName: name, toolVersion: version, industry, evalMode,
    dimScores,
    risks: [
      { dim:'D2', severity:'high',   title:'权限模型未知，建议在沙箱中验证',  desc:'此工具未在 TrustLens 数据库中，建议进行深度沙箱测试以确认权限边界。' },
      { dim:'D3', severity:'medium', title:'数据流向未验证',                 desc:'尚未通过流量分析确认代码数据发送目标，建议配置代理后测试。' },
      { dim:'D5', severity:'medium', title:'Prompt Injection 防御未经测试',  desc:'建议使用 TrustLens 测试套件运行注入攻击场景，验证 AI 行为。' },
    ],
    recs: [
      { dim:'D2', text:'在受控环境中测试 ReadOnly 模式，确认无法执行系统命令。' },
      { dim:'D3', text:'使用 mitmproxy 捕获工具运行时的所有网络请求，确认数据发送目标。' },
      { dim:'D4', text:'检查工具是否生成本地操作日志，评估日志完整性。' },
    ],
    vetoChecks: [
      { label:'存在认证机制',    pass: rng() > 0.2 },
      { label:'可禁止写操作',    pass: rng() > 0.4 },
      { label:'数据可被代理拦截', pass: rng() > 0.5 },
      { label:'操作日志存在',    pass: rng() > 0.3 },
      { label:'注入测试通过',    pass: rng() > 0.6 },
    ]
  };

  applyModeToEval(eval_, modeConf);
  runScanAnimation(name, modeConf, () => renderResults(eval_, modeConf));
}

// ═══════════════════════════════════════════════════════════════
//  SCAN ANIMATION
// ═══════════════════════════════════════════════════════════════

function runScanAnimation(toolName, modeConf, callback) {
  document.getElementById('scanning-tool-name').textContent = toolName;
  document.getElementById('scan-log').innerHTML = '';

  // Show mode label during scan
  const modeBadge = `<span style="color:var(--accent);font-weight:700">[${modeConf.label}]</span>`;
  document.getElementById('scanning-tool-name').innerHTML = `${toolName} ${modeBadge}`;

  showScreen('screen-scanning');

  const steps = modeConf.scanSteps;
  let i = 0;
  function step() {
    if (i >= steps.length) { setTimeout(callback, 500); return; }
    const s = steps[i++];
    updateScanBar(s.pct);
    appendLog(s.msg, s.status);
    setTimeout(step, modeConf.stepDelay + Math.random() * 150);
  }
  step();
}

function updateScanBar(pct) {
  document.getElementById('scan-bar').style.width = pct + '%';
  document.getElementById('scan-pct').textContent = pct + '%';
}
function appendLog(msg, status) {
  const log = document.getElementById('scan-log');
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '⚠' : '✗';
  const cls  = status === 'ok' ? 'log-ok' : status === 'warn' ? 'log-warn' : 'log-err';
  const el = document.createElement('div');
  el.className = `log-entry ${cls}`;
  el.textContent = `${icon}  ${msg}`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

// ═══════════════════════════════════════════════════════════════
//  RENDER RESULTS
// ═══════════════════════════════════════════════════════════════

function renderResults(eval_, modeConf) {
  currentEval = eval_;
  showScreen('screen-results');

  const score   = computeScore(eval_.dimScores);
  const grade   = gradeFromScore(score);
  const indConf = INDUSTRY_THRESHOLDS[eval_.industry] || INDUSTRY_THRESHOLDS.tech;
  const gap     = indConf.min - score;

  // Header
  document.getElementById('r-tool-name').textContent    = eval_.toolName;
  document.getElementById('r-tool-version').textContent = eval_.toolVersion || '';
  document.getElementById('r-eval-date').textContent    = new Date().toLocaleDateString('zh-CN', { year:'numeric', month:'long', day:'numeric' });
  const scoreEl = document.getElementById('r-score');
  scoreEl.textContent = '0';
  animateCount(scoreEl, 0, Math.round(score), 1200);

  // Ring
  const ring = document.getElementById('ring-fill');
  const circumference = 326.7;
  // Reset then animate
  ring.style.transition = 'none';
  ring.style.strokeDashoffset = circumference;
  ring.offsetHeight; // force reflow
  ring.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1), stroke .5s';
  ring.style.strokeDashoffset = circumference * (1 - score / 100);
  ring.style.stroke = scoreColor(score);

  // Grade
  const gradeEl = document.getElementById('r-grade');
  gradeEl.textContent  = grade;
  gradeEl.className    = `grade-badge grade-${grade.replace('+','-plus')}`;

  document.getElementById('r-verdict').textContent = verdictText(grade);
  document.getElementById('r-industry-gap').textContent =
    gap > 0
      ? `⚠️ ${indConf.label}行业要求 ${indConf.min} 分，当前差 ${Math.ceil(gap)} 分`
      : `✅ 达到${indConf.label}行业基准 (${indConf.min}分)`;

  // Mode & Confidence badge (insert after r-industry-gap)
  renderModeBadge(eval_);

  // Veto checks
  renderVetoPanel(eval_.vetoChecks);

  // Disclaimer banner
  renderDisclaimer(eval_.disclaimer);

  // Dim list
  renderDimList(eval_.dimScores);

  // Radar
  renderRadar(eval_.dimScores);

  // Risks & Recs
  renderRisks(eval_.risks);
  renderRecs(eval_.recs);
}

function renderModeBadge(eval_) {
  const existing = document.getElementById('mode-badge-row');
  if (existing) existing.remove();

  const container = document.getElementById('r-industry-gap').parentElement;
  const badgeRow = document.createElement('div');
  badgeRow.id = 'mode-badge-row';
  badgeRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap;';

  // Mode badge
  const modeBadge = document.createElement('span');
  modeBadge.style.cssText = 'font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;background:rgba(79,127,255,.15);color:#8eb4ff;border:1px solid rgba(79,127,255,.3);';
  modeBadge.textContent = eval_.modeLabel || '标准评估';
  badgeRow.appendChild(modeBadge);

  // Confidence badge
  const confBadge = document.createElement('span');
  const confPct = Math.round((eval_.confidenceLevel || 0.8) * 100);
  const confColor = confPct >= 90 ? '#10b981' : confPct >= 75 ? '#f59e0b' : '#ef4444';
  confBadge.style.cssText = `font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;background:rgba(${confColor === '#10b981' ? '16,185,129' : confColor === '#f59e0b' ? '245,158,11' : '239,68,68'},.12);color:${confColor};border:1px solid ${confColor}33;`;
  confBadge.textContent = `可信度 ${confPct}% · ${eval_.confidenceLabel || ''}`;
  badgeRow.appendChild(confBadge);

  container.appendChild(badgeRow);
}

function renderDisclaimer(text) {
  const existing = document.getElementById('eval-disclaimer');
  if (existing) existing.remove();
  if (!text) return;

  const veto = document.getElementById('veto-panel');
  const banner = document.createElement('div');
  banner.id = 'eval-disclaimer';
  banner.style.cssText = 'max-width:1200px;margin:0 auto 16px;padding:0 32px;';
  banner.innerHTML = `<div style="
    background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);
    border-radius:10px;padding:14px 18px;font-size:13px;color:#fbbf24;line-height:1.6;
  ">${text}</div>`;
  veto.parentNode.insertBefore(banner, veto.nextSibling);
}

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
function verdictText(g) {
  return { 'A+':'✅ 企业级可信，推荐引入', 'A':'✅ 可引入，需监控特定风险', 'B':'⚠️ 有条件引入，需补偿控制', 'C':'❌ 高风险，不建议引入', 'D':'❌ 不适合企业使用' }[g];
}
function scoreColor(s) {
  if (s >= 80) return '#10b981';
  if (s >= 65) return '#f59e0b';
  return '#ef4444';
}

// ── Veto Panel ───────────────────────────────────────────────
function renderVetoPanel(checks) {
  const panel = document.getElementById('veto-panel');
  panel.innerHTML = '<div style="font-size:12px;font-weight:700;color:var(--text-muted);letter-spacing:.6px;flex-basis:100%;margin-bottom:4px;">一票否决检查</div>';
  checks.forEach(c => {
    const el = document.createElement('div');
    el.className = `veto-item ${c.pass ? 'veto-pass' : 'veto-fail'}`;
    el.innerHTML = `<span>${c.pass ? '✓' : '✗'}</span><span>${c.label}</span>`;
    panel.appendChild(el);
  });
}

// ── Dim List (mode-aware) ────────────────────────────────────
function renderDimList(dimScores) {
  const list = document.getElementById('dim-list');
  list.innerHTML = '';
  DIMENSIONS.forEach(d => {
    const ds   = dimScores[d.id] || { score: 0 };
    const pct  = (ds.score / 5 * 100).toFixed(0);
    const col  = !ds.tested ? '#4a5a7a' : ds.score >= 4 ? '#10b981' : ds.score >= 3 ? '#f59e0b' : '#ef4444';
    const tag  = ds.tested === false ? '<span style="font-size:10px;color:#4a5a7a;background:rgba(74,90,122,.15);padding:2px 6px;border-radius:4px;margin-left:6px;">推断</span>' : '';
    const methodTag = ds.method
      ? `<span style="font-size:10px;color:var(--text-muted);margin-left:4px;">${ds.method}</span>`
      : '';
    const row  = document.createElement('div');
    row.className = 'dim-row';
    if (!ds.tested) row.style.opacity = '0.55';
    row.innerHTML = `
      <div class="dim-row-icon">${d.icon}</div>
      <div class="dim-row-info">
        <div class="dim-row-name">${d.id} ${d.name}${tag}${methodTag}</div>
        <div class="dim-row-weight">权重 ${(d.weight*100).toFixed(0)}%</div>
      </div>
      <div class="dim-row-bar-wrap">
        <div class="dim-bar"><div class="dim-bar-fill" style="width:${pct}%;background:${col}"></div></div>
        <div class="dim-score-txt" style="color:${col}">${ds.score.toFixed(1)}</div>
      </div>`;
    row.onclick = () => openDimDetail(d, ds);
    list.appendChild(row);
  });
}

// ── Radar Chart ──────────────────────────────────────────────
function renderRadar(dimScores) {
  if (radarChart) { radarChart.destroy(); radarChart = null; }
  const ctx = document.getElementById('radarChart').getContext('2d');
  const labels = DIMENSIONS.map(d => d.id);
  const data   = DIMENSIONS.map(d => dimScores[d.id]?.score ?? 0);
  const tested = DIMENSIONS.map(d => dimScores[d.id]?.tested !== false);
  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels,
      datasets: [{
        label: '评分',
        data,
        backgroundColor: 'rgba(79,127,255,.15)',
        borderColor: '#4f7fff',
        borderWidth: 2,
        pointBackgroundColor: data.map((v, i) => !tested[i] ? '#4a5a7a' : v >= 4 ? '#10b981' : v >= 3 ? '#f59e0b' : '#ef4444'),
        pointRadius: 5,
        borderDash: [], // solid for tested
      }]
    },
    options: {
      scales: {
        r: {
          min: 0, max: 5,
          ticks: { stepSize: 1, color: '#4a5a7a', font: { size: 10 } },
          grid:  { color: '#1e2d45' },
          pointLabels: {
            color: labels.map((_, i) => tested[i] ? '#8899bb' : '#3a4a6a'),
            font: { size: 12, weight:'600' }
          },
          angleLines: { color: '#1e2d45' },
        }
      },
      plugins: { legend: { display: false } },
      animation:  { duration: 1000 },
    }
  });
}

// ── Risks & Recs ─────────────────────────────────────────────
function renderRisks(risks) {
  const list = document.getElementById('risk-list');
  list.innerHTML = '';
  risks.forEach(r => {
    const el = document.createElement('div');
    el.className = 'risk-item';
    const sevLabel = { high:'高危', medium:'中危', low:'低危' }[r.severity];
    el.innerHTML = `
      <div>
        <div class="risk-severity sev-${r.severity}">${sevLabel}</div>
      </div>
      <div>
        <div class="risk-title">${r.title}</div>
        <div class="risk-desc">${r.desc}</div>
      </div>`;
    list.appendChild(el);
  });
}

function renderRecs(recs) {
  const list = document.getElementById('rec-list');
  list.innerHTML = '';
  recs.forEach(r => {
    const el = document.createElement('div');
    el.className = 'rec-item';
    el.innerHTML = `
      <div class="rec-dim">${r.dim}</div>
      <div class="rec-text">→ ${r.text}</div>`;
    list.appendChild(el);
  });
}

// ── Dimension Detail Modal (mode-aware) ──────────────────────
function openDimDetail(dim, ds) {
  document.getElementById('modal-title').textContent = `${dim.icon} ${dim.id}: ${dim.name}`;

  const testedLabel = ds.tested === false
    ? '<span style="background:rgba(245,158,11,.15);color:#fbbf24;font-size:12px;padding:3px 8px;border-radius:6px;margin-left:8px;">⚠ 此维度为推断评分，未实际检测</span>'
    : ds.method
      ? `<span style="background:rgba(16,185,129,.1);color:#6ee7b7;font-size:12px;padding:3px 8px;border-radius:6px;margin-left:8px;">检测方法: ${ds.method}</span>`
      : '';

  const confLabel = ds.confidence
    ? `<span style="font-size:12px;color:var(--text-muted);margin-left:8px;">可信度 ${Math.round(ds.confidence*100)}%</span>`
    : '';

  const checkResults = dim.checks.map((c, i) => {
    const v = ds.checks ? ds.checks[i] : 0;
    if (v === -1) {
      // skipped check
      return `<tr style="opacity:.45">
        <td>${c.name}</td>
        <td style="color:#4a5a7a">⏭️ 跳过</td>
        <td>${c.weight.toFixed(1)}</td>
        <td style="font-size:11px;color:#4a5a7a;">未在此模式下检测</td>
      </tr>`;
    }
    const icon = v >= 1 ? '✅' : v > 0 ? '⚠️' : '❌';
    const cls  = v >= 1 ? 'check-ok' : v > 0 ? 'check-warn' : 'check-fail';
    const lbl  = v >= 1 ? '通过' : v > 0 ? '部分' : '失败';
    return `<tr>
      <td>${c.name}</td>
      <td class="${cls}">${icon} ${lbl}</td>
      <td>${c.weight.toFixed(1)}</td>
      <td style="font-size:11px;color:var(--text-muted);">${ds.method || '—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('modal-body').innerHTML = `
    <div style="display:flex;align-items:center;flex-wrap:wrap;">
      <p class="detail-intro" style="margin:0">${dim.description}</p>
      ${testedLabel}${confLabel}
    </div>
    <div class="detail-evidence">
      <div class="detail-evidence-title">CLAUDE CODE 代码实证（基准参照）</div>
      <pre class="evidence-code">${escHtml(dim.codeEvidence)}</pre>
    </div>
    <table class="check-table">
      <thead><tr><th>检查项</th><th>结果</th><th>权重</th><th>检测方法</th></tr></thead>
      <tbody>${checkResults}</tbody>
    </table>
    <div style="font-size:13px;color:var(--text-second);">
      综合得分: <strong style="color:var(--text-primary)">${ds.score.toFixed(1)} / 5.0</strong>
      &nbsp;·&nbsp; 加权贡献: <strong style="color:var(--text-primary)">${(ds.score/5*100*dim.weight).toFixed(1)} 分</strong>
    </div>`;
  document.getElementById('detail-modal').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('detail-modal').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════════
//  REPORT GENERATION (mode-aware)
// ═══════════════════════════════════════════════════════════════

function generateReport() {
  if (!currentEval) return;
  const score = computeScore(currentEval.dimScores);
  const grade = gradeFromScore(score);
  const indConf = INDUSTRY_THRESHOLDS[currentEval.industry] || INDUSTRY_THRESHOLDS.tech;
  const gap = indConf.min - score;
  const now = new Date().toLocaleDateString('zh-CN', {year:'numeric',month:'long',day:'numeric'});

  const dimRows = DIMENSIONS.map(d => {
    const ds = currentEval.dimScores[d.id] || {score:0};
    const pass = ds.score >= 3.5;
    const testedMark = ds.tested === false ? '⚠️ 推断' : '✅';
    return `<tr>
      <td>${d.id} ${d.name}</td>
      <td>${ds.score.toFixed(1)}/5.0</td>
      <td>${(d.weight*100).toFixed(0)}%</td>
      <td>${(ds.score/5*100*d.weight).toFixed(1)}</td>
      <td>${testedMark}</td>
      <td>${ds.method || '—'}</td>
    </tr>`;
  }).join('');

  const riskRows = (currentEval.risks || []).map(r =>
    `<li><strong>[${r.dim}] ${r.title}</strong> — ${r.desc}</li>`).join('');

  const recRows = (currentEval.recs || []).map(r =>
    `<li><strong>${r.dim}:</strong> ${r.text}</li>`).join('');

  const vetoRows = (currentEval.vetoChecks || []).map(c =>
    `<tr><td>${c.label}</td><td>${c.pass ? '✅ 通过' : '❌ 失败'}</td></tr>`).join('');

  const confPct = Math.round((currentEval.confidenceLevel || 0.8) * 100);

  document.getElementById('report-content').innerHTML = `
    <h1>AI 工具企业可信安全评估报告</h1>
    <p style="color:var(--text-muted);font-size:13px;">
      评估工具: ${currentEval.toolName} ${currentEval.toolVersion || ''}
      &nbsp;·&nbsp; 评估日期: ${now}
      &nbsp;·&nbsp; 评估模式: <strong>${currentEval.modeLabel || '标准评估'}</strong>
      &nbsp;·&nbsp; 可信度: <strong>${confPct}%</strong>
      &nbsp;·&nbsp; 平台: TrustLens
    </p>

    <h2>执行摘要</h2>
    <table>
      <tr><th>综合评分</th><td><strong>${Math.round(score)} / 100</strong></td><th>评级</th><td><strong>${grade}</strong></td></tr>
      <tr><th>结论</th><td colspan="3">${verdictText(grade)}</td></tr>
      <tr><th>目标行业</th><td>${indConf.label}</td><th>行业基准</th><td>${indConf.min} 分（当前${gap > 0 ? '差 '+Math.ceil(gap)+' 分' : '已达标'}）</td></tr>
      <tr><th>评估模式</th><td>${currentEval.modeLabel || '标准评估'}</td><th>检测方法</th><td>${currentEval.confidenceLabel || '—'}</td></tr>
      <tr><th>可信度</th><td colspan="3">${confPct}%${confPct < 80 ? ' — ⚠️ 建议升级为"标准评估"以提高可信度' : confPct < 95 ? ' — 建议对关键维度进行"深度评估"验证' : ' — 最高可信度'}</td></tr>
    </table>

    <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#fbbf24;">
      ${currentEval.disclaimer || ''}
    </div>

    <h2>一票否决检查</h2>
    <table>
      <thead><tr><th>检查项</th><th>结果</th></tr></thead>
      <tbody>${vetoRows}</tbody>
    </table>

    <h2>九维度评分明细</h2>
    <table>
      <thead><tr><th>维度</th><th>得分</th><th>权重</th><th>加权得分</th><th>覆盖</th><th>检测方法</th></tr></thead>
      <tbody>${dimRows}</tbody>
    </table>

    <h2>主要风险</h2>
    <ul>${riskRows}</ul>

    <h2>补偿控制建议</h2>
    <ul>${recRows}</ul>

    <h2>说明</h2>
    <p>${currentEval.disclaimer || ''}</p>
    <p>本报告基于 TrustLens 平台的${currentEval.modeLabel || '标准'}检测结果生成，评估维度源自 Claude Code 逆向工程实践。评分基于当时可获取的信息，工具版本更新后建议重新评估。</p>
    <p class="report-stamp">Generated by TrustLens · ${now} · ${currentEval.modeLabel || '标准评估'} · 可信度${confPct}% · 本报告仅供内部决策参考</p>`;

  document.getElementById('report-modal').classList.remove('hidden');
}
function closeReport() { document.getElementById('report-modal').classList.add('hidden'); }
function copyReport() {
  const text = document.getElementById('report-content').innerText;
  navigator.clipboard.writeText(text).then(() => alert('报告已复制到剪切板'));
}
function printReport() { window.print(); }

// ═══════════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════════

// ── Animation Helpers ────────────────────────────────────────
function animateCount(el, from, to, duration = 1000) {
  const start = performance.now();
  const isInt = Number.isInteger(to);
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current = from + (to - from) * eased;
    el.textContent = isInt ? Math.round(current) : current.toFixed(1);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0;
  return h;
}
function seededRand(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

// ═══════════════════════════════════════════════════════════════
//  BENCHMARK COMPARISON
// ═══════════════════════════════════════════════════════════════

let benchChart = null;
let benchRadarChart = null;
const BENCH_TOOLS = ['claude-code', 'github-copilot', 'cursor', 'windsurf'];
const BENCH_COLORS = {
  'claude-code':     { bg: 'rgba(139,92,246,.7)',  border: '#a78bfa' },
  'github-copilot':  { bg: 'rgba(59,130,246,.7)',  border: '#60a5fa' },
  'cursor':          { bg: 'rgba(245,158,11,.7)',  border: '#fbbf24' },
  'windsurf':        { bg: 'rgba(244,63,94,.7)',   border: '#fb7185' },
};

function getSelectedBenchTools() {
  const chips = document.querySelectorAll('.bts-chip');
  const selected = [];
  chips.forEach(chip => {
    const cb = chip.querySelector('input');
    if (cb.checked) {
      selected.push(chip.dataset.key);
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
  return selected.length >= 2 ? selected : BENCH_TOOLS;
}

function updateBenchSelection() {
  renderBenchmark();
}

function showBenchmark() {
  showScreen('screen-benchmark');
  renderBenchmark();
}

function renderBenchmark() {
  const industry = document.getElementById('bench-industry').value;
  const threshold = INDUSTRY_THRESHOLDS[industry] || INDUSTRY_THRESHOLDS.tech;
  const selectedTools = getSelectedBenchTools();

  // Calculate scores
  const toolData = selectedTools.map(key => {
    const p = PRESET_EVALUATIONS[key];
    if (!p) return null;
    const score = getPresetScore(key);
    const grade = gradeFromScore(score);
    return { key, ...p, score, grade, meetsThreshold: score >= threshold.min };
  }).filter(Boolean);
  const maxScore = Math.max(...toolData.map(t => t.score));

  // ── Render Cards ──
  const cardsEl = document.getElementById('bench-cards');
  cardsEl.innerHTML = '';
  toolData.forEach(t => {
    const isBest = t.score === maxScore;
    const col = scoreColor(t.score);
    const gradeCls = `grade-${t.grade.replace('+','-plus')}`;
    const card = document.createElement('div');
    card.className = `bench-tool-card${isBest ? ' best' : ''}`;
    card.onclick = () => { loadPreset(t.key, industry, 'standard'); };
    card.innerHTML = `
      <div class="btc-name">${t.toolName}</div>
      <div class="btc-version">${t.toolVersion}</div>
      <div class="btc-score" style="color:${col}" data-target="${Math.round(t.score)}">0</div>
      <div class="btc-grade ${gradeCls}">${t.grade}</div>
      <div class="btc-tagline">${t.tagline || ''}</div>
      <div class="btc-bar-wrap">
        <div class="btc-bar-fill" style="width:${t.score}%;background:${col}"></div>
        <div class="btc-threshold-mark" style="left:${threshold.min}%"></div>
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">
        ${t.meetsThreshold ? '✅ 达标' : `⚠️ 差 ${Math.ceil(threshold.min - t.score)} 分`}
        · ${threshold.label} ${threshold.min}分
      </div>`;
    cardsEl.appendChild(card);
  });

  // Dynamic card grid columns
  cardsEl.style.gridTemplateColumns = `repeat(${toolData.length}, 1fr)`;

  // ── Render Chart ──
  renderBenchChart(toolData);

  // ── Render Radar Overlay ──
  renderBenchRadar(toolData);

  // ── Render Table ──
  renderBenchTable(toolData);

  // ── Render Summary ──
  renderBenchSummary(toolData);

  // Animate card scores
  document.querySelectorAll('.btc-score[data-target]').forEach(el => {
    animateCount(el, 0, parseInt(el.dataset.target), 1000);
  });
}

function renderBenchChart(toolData) {
  if (benchChart) { benchChart.destroy(); benchChart = null; }
  const ctx = document.getElementById('benchChart').getContext('2d');
  const labels = DIMENSIONS.map(d => `${d.id} ${d.name.slice(0,4)}`);

  const datasets = toolData.map(t => ({
    label: t.toolName,
    data: DIMENSIONS.map(d => t.dimScores[d.id]?.score ?? 0),
    backgroundColor: BENCH_COLORS[t.key].bg,
    borderColor: BENCH_COLORS[t.key].border,
    borderWidth: 1,
    borderRadius: 3,
  }));

  benchChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          min: 0, max: 5,
          ticks: { stepSize: 1, color: '#4a5a7a', font: { size: 11 } },
          grid: { color: '#1e2d45' },
        },
        x: {
          ticks: { color: '#8899bb', font: { size: 11 } },
          grid: { display: false },
        }
      },
      plugins: {
        legend: {
          labels: { color: '#8899bb', font: { size: 12 }, padding: 16 },
          position: 'top',
        },
      },
      animation: { duration: 800 },
    }
  });
}

function renderBenchRadar(toolData) {
  if (benchRadarChart) { benchRadarChart.destroy(); benchRadarChart = null; }
  const canvas = document.getElementById('benchRadarChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const labels = DIMENSIONS.map(d => d.id);

  const datasets = toolData.map(t => ({
    label: t.toolName,
    data: DIMENSIONS.map(d => t.dimScores[d.id]?.score ?? 0),
    backgroundColor: (BENCH_COLORS[t.key]?.bg || 'rgba(128,128,128,.7)').replace('.7)', '.12)'),
    borderColor: BENCH_COLORS[t.key]?.border || '#888',
    borderWidth: 2,
    pointRadius: 4,
    pointBackgroundColor: BENCH_COLORS[t.key]?.border || '#888',
  }));

  benchRadarChart = new Chart(ctx, {
    type: 'radar',
    data: { labels, datasets },
    options: {
      scales: {
        r: {
          min: 0, max: 5,
          ticks: { stepSize: 1, color: '#4a5a7a', font: { size: 10 } },
          grid: { color: '#1e2d45' },
          pointLabels: { color: '#8899bb', font: { size: 12, weight: '600' } },
          angleLines: { color: '#1e2d45' },
        }
      },
      plugins: {
        legend: {
          labels: { color: '#8899bb', font: { size: 12 }, padding: 16 },
          position: 'top',
        },
      },
      animation: { duration: 800 },
    }
  });
}

function renderBenchTable(toolData) {
  const table = document.getElementById('bench-table');
  const headers = ['维度', ...toolData.map(t => t.toolName), '最佳实践'];
  let html = `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>`;

  DIMENSIONS.forEach(d => {
    const scores = toolData.map(t => t.dimScores[d.id]?.score ?? 0);
    const maxS = Math.max(...scores);
    const minS = Math.min(...scores);
    const bestTool = toolData[scores.indexOf(maxS)].toolName;

    html += `<tr>
      <td>${d.icon} ${d.id} ${d.name}</td>
      ${scores.map(s => {
        const cls = s === maxS ? 'bench-best-cell' : s === minS && s < 3 ? 'bench-worst-cell' : '';
        return `<td class="${cls}">${s.toFixed(1)}</td>`;
      }).join('')}
      <td style="font-size:11px;color:var(--text-muted)">${bestTool}</td>
    </tr>`;
  });

  // Total row
  html += `<tr style="border-top:2px solid var(--border-light)">
    <td><strong>综合得分</strong></td>
    ${toolData.map(t => {
      const col = scoreColor(t.score);
      return `<td style="color:${col};font-weight:800">${Math.round(t.score)} (${t.grade})</td>`;
    }).join('')}
    <td></td>
  </tr>`;

  html += '</tbody>';
  table.innerHTML = html;
}

function renderBenchSummary(toolData) {
  const container = document.getElementById('bench-summary');
  if (!container) return;
  container.innerHTML = '<h3 class="bench-summary-title">📊 各工具优劣势摘要</h3>';

  const grid = document.createElement('div');
  grid.className = 'bench-summary-grid';

  toolData.forEach(t => {
    const dimEntries = DIMENSIONS.map(d => ({
      dim: d,
      score: t.dimScores[d.id]?.score ?? 0,
    }));
    dimEntries.sort((a, b) => b.score - a.score);
    const top2 = dimEntries.slice(0, 2);
    const bottom2 = dimEntries.slice(-2).reverse();

    const col = scoreColor(t.score);
    const card = document.createElement('div');
    card.className = 'bench-sw-card';
    card.innerHTML = `
      <div class="bsw-header">
        <div class="bsw-name">${t.toolName}</div>
        <div class="bsw-score" style="color:${col}">${Math.round(t.score)}</div>
      </div>
      <div class="bsw-section bsw-strengths">
        <div class="bsw-label">💪 核心优势</div>
        ${top2.map(e => `
          <div class="bsw-item">
            <span class="bsw-dim-icon">${e.dim.icon}</span>
            <span class="bsw-dim-name">${e.dim.id} ${e.dim.name}</span>
            <span class="bsw-dim-score" style="color:var(--green)">${e.score.toFixed(1)}</span>
          </div>`).join('')}
      </div>
      <div class="bsw-section bsw-weaknesses">
        <div class="bsw-label">⚠️ 主要短板</div>
        ${bottom2.map(e => `
          <div class="bsw-item">
            <span class="bsw-dim-icon">${e.dim.icon}</span>
            <span class="bsw-dim-name">${e.dim.id} ${e.dim.name}</span>
            <span class="bsw-dim-score" style="color:var(--red)">${e.score.toFixed(1)}</span>
          </div>`).join('')}
      </div>`;
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeReport(); closeDocModal(); }
});

// ═══════════════════════════════════════════════════════════════
//  FRAMEWORK DOC MODAL
// ═══════════════════════════════════════════════════════════════

function openFrameworkDoc() {
  const grid = document.getElementById('doc-dims-grid');
  if (grid && !grid.hasChildNodes()) {
    DIMENSIONS.forEach(d => {
      const card = document.createElement('div');
      card.className = 'doc-dim-card';
      card.innerHTML = `
        <div class="doc-dim-head">
          <span class="doc-dim-icon">${d.icon}</span>
          <span class="doc-dim-id">${d.id}</span>
          <span class="doc-dim-w">权重 ${(d.weight*100).toFixed(0)}%</span>
        </div>
        <div class="doc-dim-name">${d.name}</div>
        <div class="doc-dim-desc">${d.description}</div>
        <div class="doc-dim-checks">${d.checks.length} 项检查</div>`;
      grid.appendChild(card);
    });
  }
  document.getElementById('doc-modal').classList.remove('hidden');
}

function closeDocModal() {
  document.getElementById('doc-modal').classList.add('hidden');
}

function openExternalDoc() {
  const url = document.getElementById('doc-url-input').value.trim();
  if (!url) {
    document.getElementById('doc-url-input').focus();
    document.getElementById('doc-url-input').style.borderColor = '#ef4444';
    setTimeout(() => document.getElementById('doc-url-input').style.borderColor = '', 1500);
    return;
  }
  window.open(url, '_blank', 'noopener');
}
