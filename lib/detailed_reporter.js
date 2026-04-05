// ─────────────────────────────────────────────────────────────
//  TrustLens — Detailed Report Generator
//  Generates individual per-tool reports + enhanced summary
//  Includes SVG radar charts, detailed evidence, risks, recs
// ─────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DIMENSIONS, computeScore, gradeFromScore, scoreColor, verdictText } from './scorer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadStyles() {
  const cssPath = path.join(__dirname, '..', 'styles.css');
  try { return fs.readFileSync(cssPath, 'utf-8'); } catch { return ''; }
}

// ── SVG Radar Chart Generator ──────────────────────────────

function generateRadarSVG(scores, size = 320) {
  const dims = DIMENSIONS;
  const n = dims.length;
  const cx = size / 2, cy = size / 2;
  const r = size * 0.38;

  function polar(i, val) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const dist = (val / 5) * r;
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
  }

  // Grid rings
  let gridLines = '';
  for (let ring = 1; ring <= 5; ring++) {
    const pts = dims.map((_, i) => polar(i, ring));
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') + 'Z';
    gridLines += `<path d="${path}" fill="none" stroke="#1e2d45" stroke-width="1"/>`;
  }

  // Axis lines
  let axisLines = '';
  for (let i = 0; i < n; i++) {
    const outer = polar(i, 5);
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" stroke="#1e2d45" stroke-width="1"/>`;
  }

  // Data polygon
  const dataPts = dims.map((d, i) => polar(i, scores[d.id] ?? 0));
  const dataPath = dataPts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') + 'Z';

  // Data dots
  const dots = dataPts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#4f7fff" stroke="#fff" stroke-width="1.5"/>`).join('');

  // Labels
  const labels = dims.map((d, i) => {
    const p = polar(i, 5.7);
    const anchor = i === 0 ? 'middle' : i < n / 2 ? 'start' : i === n / 2 ? 'middle' : 'end';
    const dy = i === 0 ? -6 : i === Math.floor(n / 2) ? 14 : 0;
    return `<text x="${p.x.toFixed(1)}" y="${(p.y + dy).toFixed(1)}" text-anchor="${anchor}" fill="#8899bb" font-size="11" font-weight="600">${d.id}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}${axisLines}
    <path d="${dataPath}" fill="rgba(79,127,255,.2)" stroke="#4f7fff" stroke-width="2.5" stroke-linejoin="round"/>
    ${dots}${labels}
  </svg>`;
}

// ── Comparison Radar (multiple tools overlay) ──────────────

function generateComparisonRadar(tools, size = 400) {
  const n = DIMENSIONS.length;
  const cx = size / 2, cy = size / 2, r = size * 0.35;
  const colors = ['#4f7fff','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#84cc16'];

  function polar(i, val) {
    const angle = (Math.PI * 2 * i / n) - Math.PI / 2;
    const dist = (val / 5) * r;
    return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) };
  }

  let gridLines = '';
  for (let ring = 1; ring <= 5; ring++) {
    const pts = DIMENSIONS.map((_, i) => polar(i, ring));
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') + 'Z';
    gridLines += `<path d="${path}" fill="none" stroke="#1e2d45" stroke-width="1"/>`;
  }

  let axisLines = '';
  for (let i = 0; i < n; i++) {
    const outer = polar(i, 5);
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${outer.x.toFixed(1)}" y2="${outer.y.toFixed(1)}" stroke="#1e2d45" stroke-width="1"/>`;
  }

  const dataLayers = tools.map((t, ti) => {
    const color = colors[ti % colors.length];
    const scores = DIMENSIONS.map(d => t.analysis.dimScores[d.id]?.score ?? 0);
    const pts = scores.map((s, i) => polar(i, s));
    const path = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ') + 'Z';
    return `<path d="${path}" fill="${color}22" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
  }).join('');

  const labels = DIMENSIONS.map((d, i) => {
    const p = polar(i, 5.8);
    const anchor = i === 0 ? 'middle' : i < n / 2 ? 'start' : i === Math.floor(n / 2) ? 'middle' : 'end';
    return `<text x="${p.x.toFixed(1)}" y="${(p.y + (i === 0 ? -6 : i === Math.floor(n / 2) ? 14 : 0)).toFixed(1)}" text-anchor="${anchor}" fill="#8899bb" font-size="11" font-weight="600">${d.id}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">${gridLines}${axisLines}${dataLayers}${labels}</svg>`;
}

// ── Individual Tool Detailed Report ─────────────────────────

function generateIndividualReport(tool, industry) {
  const now = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const styles = loadStyles();
  const dimScoreMap = {};
  DIMENSIONS.forEach(d => { dimScoreMap[d.id] = tool.analysis.dimScores[d.id]?.score ?? 0; });
  const radarSVG = generateRadarSVG(dimScoreMap);
  const col = scoreColor(tool.totalScore);

  const dimensionDetails = DIMENSIONS.map(d => {
    const ds = tool.analysis.dimScores[d.id] ?? { score: 0, checks: [], evidence: '', missing: [] };
    const s = ds.score;
    const barColor = s >= 4 ? '#10b981' : s >= 3 ? '#f59e0b' : s >= 2 ? '#f97316' : '#ef4444';
    const barWidth = (s / 5 * 100).toFixed(0);

    const checksHTML = d.checks.map((c, i) => {
      const val = ds.checks?.[i] ?? 0;
      const bg = val >= 0.8 ? '#10b981' : val >= 0.5 ? '#f59e0b' : val > 0 ? '#f97316' : '#ef4444';
      const icon = val >= 0.8 ? '●' : val >= 0.5 ? '◐' : val > 0 ? '○' : '✕';
      return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
        <span style="color:${bg};font-size:14px;width:18px;text-align:center;">${icon}</span>
        <span style="flex:1;font-size:12px;color:var(--text-second)">${c.name}</span>
        <span style="font-size:11px;color:${bg};font-weight:600;">${(val * 100).toFixed(0)}%</span>
      </div>`;
    }).join('');

    return `
    <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
        <span style="font-size:20px;">${d.icon}</span>
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:700;">${d.id}: ${d.name}</div>
          <div style="font-size:11px;color:var(--text-muted);">${d.description}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:24px;font-weight:800;color:${barColor};">${s.toFixed(1)}</div>
          <div style="font-size:10px;color:var(--text-muted);">/5.0 · 权重 ${(d.weight*100).toFixed(0)}%</div>
        </div>
      </div>
      <div style="background:var(--bg-base);border-radius:6px;height:8px;overflow:hidden;margin-bottom:14px;">
        <div style="width:${barWidth}%;height:100%;background:${barColor};border-radius:6px;transition:width .5s;"></div>
      </div>
      <div style="margin-bottom:14px;">${checksHTML}</div>
      ${ds.evidence ? `<div style="background:var(--bg-card2);border-radius:6px;padding:12px;margin-bottom:10px;">
        <div style="font-size:10px;font-weight:700;color:var(--accent);margin-bottom:6px;">📋 文档证据</div>
        <div style="font-size:12px;color:var(--text-second);line-height:1.7;">${ds.evidence}</div>
      </div>` : ''}
      ${ds.missing?.length ? `<div style="background:rgba(239,68,68,.08);border-radius:6px;padding:12px;">
        <div style="font-size:10px;font-weight:700;color:var(--red);margin-bottom:6px;">⚠️ 文档中未提及</div>
        <div style="font-size:12px;color:var(--text-second);">${ds.missing.map(m => `<div>• ${m}</div>`).join('')}</div>
      </div>` : ''}
    </div>`;
  }).join('');

  const risksHTML = (tool.analysis.risks || []).map(r => {
    const sevColor = r.severity === 'high' ? '#ef4444' : r.severity === 'medium' ? '#f59e0b' : '#10b981';
    const sevBg = r.severity === 'high' ? 'rgba(239,68,68,.12)' : r.severity === 'medium' ? 'rgba(245,158,11,.12)' : 'rgba(16,185,129,.12)';
    return `<div style="background:${sevBg};border-left:3px solid ${sevColor};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="background:${sevColor};color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;">${r.severity.toUpperCase()}</span>
        <span style="font-size:13px;font-weight:700;">${r.title}</span>
        <span style="font-size:10px;color:var(--text-muted);">${r.dim}</span>
      </div>
      <div style="font-size:12px;color:var(--text-second);">${r.desc}</div>
    </div>`;
  }).join('');

  const recsHTML = (tool.analysis.recs || []).map(r => `
    <div style="background:rgba(79,127,255,.08);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:10px;">
      <div style="font-size:10px;color:var(--accent);font-weight:700;margin-bottom:4px;">${r.dim}</div>
      <div style="font-size:13px;color:var(--text-second);">${r.text}</div>
    </div>
  `).join('');

  const vetoHTML = (tool.analysis.vetoChecks || []).map(v => {
    const col2 = v.pass ? '#10b981' : '#ef4444';
    const icon = v.pass ? '✅' : '❌';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;">
      <span>${icon}</span>
      <span style="font-size:13px;color:var(--text-second);">${v.label}</span>
    </div>`;
  }).join('');

  // ── Executive Summary Data ────────────────────────────────
  const dimEntries = DIMENSIONS.map(d => ({ dim: d, score: tool.analysis.dimScores[d.id]?.score ?? 0 }));
  const sorted = [...dimEntries].sort((a, b) => b.score - a.score);
  const top3 = sorted.slice(0, 3);
  const bottom3 = sorted.slice(-3).reverse();

  // Build executive summary text from tool data
  const summary = tool.analysis.execSummary || `${tool.toolName} 在本次九维度安全评估中获得 ${Math.round(tool.totalScore)} 分（${tool.grade} 级），${tool.meetsThreshold ? '达到' : '未达到'} ${tool.industryLabel}行业 ${tool.industryMin} 分基准线。该工具在${top3.map(t => t.dim.name).join('、')}方面表现突出，但在${bottom3.map(b => b.dim.name).join('、')}方面存在提升空间。`;

  const strengthsHTML = top3.map(t => `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(16,185,129,.15)">
      <span style="font-size:16px;">${t.dim.icon}</span>
      <span style="flex:1;font-size:13px;color:var(--text-second)">${t.dim.id} ${t.dim.name}</span>
      <span style="font-size:14px;font-weight:800;color:#10b981;">${t.score.toFixed(1)}</span>
      <div style="width:60px;height:6px;background:rgba(16,185,129,.15);border-radius:3px;overflow:hidden">
        <div style="width:${(t.score/5*100).toFixed(0)}%;height:100%;background:#10b981;border-radius:3px"></div>
      </div>
    </div>
  `).join('');

  const weaknessesHTML = bottom3.map(b => {
    const bCol = b.score >= 3 ? '#f59e0b' : b.score >= 2 ? '#f97316' : '#ef4444';
    return `
    <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(239,68,68,.1)">
      <span style="font-size:16px;">${b.dim.icon}</span>
      <span style="flex:1;font-size:13px;color:var(--text-second)">${b.dim.id} ${b.dim.name}</span>
      <span style="font-size:14px;font-weight:800;color:${bCol};">${b.score.toFixed(1)}</span>
      <div style="width:60px;height:6px;background:rgba(239,68,68,.1);border-radius:3px;overflow:hidden">
        <div style="width:${(b.score/5*100).toFixed(0)}%;height:100%;background:${bCol};border-radius:3px"></div>
      </div>
    </div>
  `).join('');

  // Key improvements from risks
  const improvements = (tool.analysis.risks || []).slice(0, 3).map(r => {
    const ic = r.severity === 'high' ? '🔴' : r.severity === 'medium' ? '🟡' : '🟢';
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${ic} ${r.title}</div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${r.desc.substring(0, 120)}${r.desc.length > 120 ? '...' : ''}</div>
    </div>`;
  }).join('');

  const quickRecs = (tool.analysis.recs || []).slice(0, 3).map(r =>
    `<div style="display:flex;align-items:flex-start;gap:6px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="color:var(--accent);font-size:11px;margin-top:2px">▶</span>
      <span style="font-size:12px;color:var(--text-second);line-height:1.5"><strong>${r.dim}:</strong> ${r.text.substring(0, 100)}${r.text.length > 100 ? '...' : ''}</span>
    </div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${tool.toolName} — TrustLens 深度安全评估</title>
  <style>${styles}
  .report-page{max-width:960px;margin:0 auto;padding:40px 32px 60px}
  h2{font-size:20px;font-weight:700;margin:32px 0 16px;border-bottom:1px solid var(--border);padding-bottom:8px}
  h3{font-size:16px;font-weight:700;margin:16px 0 8px;color:var(--accent)}
  .hero{text-align:center;margin-bottom:36px}
  .hero h1{font-size:28px;font-weight:800;margin-bottom:4px}
  .hero-sub{color:var(--text-muted);font-size:13px}
  .score-circle{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:120px;height:120px;border-radius:50%;border:4px solid ${col};margin:20px auto}
  .score-circle .num{font-size:40px;font-weight:900;color:${col};line-height:1}
  .score-circle .grade{font-size:16px;font-weight:700;color:${col}}
  .radar-wrap{display:flex;justify-content:center;margin:20px 0}
  .exec-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
  .exec-summary-box{grid-column:1/-1;background:var(--bg-card);border:1px solid var(--border-light);border-radius:var(--radius);padding:20px;margin-bottom:8px}
  .exec-summary-box .summary-text{font-size:14px;color:var(--text-second);line-height:1.8;margin-top:8px}
  .exec-card{background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;overflow:hidden}
  .exec-card-title{font-size:12px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px}
  </style>
</head>
<body>
<div class="report-page">
  <div class="hero">
    <h1>${tool.toolName}</h1>
    <div class="hero-sub">${tool.analysis.tagline || tool.category || ''} · ${now} · ${tool.industryLabel}${tool.industryMin}分基准</div>
    <div class="score-circle">
      <div class="num">${Math.round(tool.totalScore)}</div>
      <div class="grade">${tool.grade}</div>
    </div>
    <div style="font-size:14px;color:${col}">${verdictText(tool.grade)}</div>
    ${tool.meetsThreshold ? '<div style="color:#10b981;font-size:12px;margin-top:4px">✅ 达标行业基准</div>' : `<div style="color:#ef4444;font-size:12px;margin-top:4px">⚠️ 差 ${Math.ceil(tool.industryMin - tool.totalScore)} 分达标</div>`}
  </div>

  <!-- Executive Summary -->
  <div class="exec-summary-box">
    <div style="font-size:14px;font-weight:700;color:var(--accent);display:flex;align-items:center;gap:6px">
      <span>📋</span> 执行摘要
    </div>
    <div class="summary-text">${summary}</div>
  </div>

  <div class="exec-grid">
    <div class="exec-card">
      <div class="exec-card-title" style="color:#10b981">💪 核心优势（Top 3 维度）</div>
      ${strengthsHTML}
    </div>
    <div class="exec-card">
      <div class="exec-card-title" style="color:#ef4444">⚠️ 主要短板（Bottom 3 维度）</div>
      ${weaknessesHTML}
    </div>
  </div>

  <div class="exec-grid">
    <div class="exec-card">
      <div class="exec-card-title" style="color:#ef4444">🚨 关键风险</div>
      ${improvements || '<div style="font-size:12px;color:var(--text-muted)">无高风险项</div>'}
    </div>
    <div class="exec-card">
      <div class="exec-card-title" style="color:var(--accent)">🎯 提升建议</div>
      ${quickRecs || '<div style="font-size:12px;color:var(--text-muted)">无特别建议</div>'}
    </div>
  </div>

  <h2>📊 九维度雷达图</h2>
  <div class="radar-wrap">${radarSVG}</div>

  <h2>🔍 维度详细分析</h2>
  ${dimensionDetails}

  <h2>⛔ 一票否决检查</h2>
  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px;">
    ${vetoHTML || '<div style="color:var(--text-muted);font-size:13px">无否决项数据</div>'}
  </div>

  <h2>⚠️ 风险清单</h2>
  ${risksHTML || '<div style="color:var(--text-muted);font-size:13px">无已识别风险</div>'}

  <h2>✅ 补偿控制建议</h2>
  ${recsHTML || '<div style="color:var(--text-muted);font-size:13px">无建议</div>'}

  <p style="margin-top:40px;font-size:11px;color:var(--text-muted);text-align:center;">
    Generated by TrustLens · ${now} · 基于 AI 分析官方文档自动生成，仅供内部决策参考
  </p>
</div>
</body>
</html>`;
}

// ── Enhanced Summary Report ────────────────────────────────

function generateSummaryReport(tools, industry) {
  const now = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const styles = loadStyles();
  const compRadar = generateComparisonRadar(tools, 480);

  // Sort tools by score descending
  const sorted = [...tools].sort((a, b) => b.totalScore - a.totalScore);

  // Tool cards
  const toolCards = sorted.map((t, i) => {
    const col = scoreColor(t.totalScore);
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
    return `<div style="background:var(--bg-card);border:1px solid ${i === 0 ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius);padding:20px;${i === 0 ? 'box-shadow:0 0 20px var(--accent-glow)' : ''}">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <span style="font-size:20px">${medal}</span>
        <div style="flex:1">
          <div style="font-size:15px;font-weight:700">${t.toolName}</div>
          <div style="font-size:11px;color:var(--text-muted)">${t.category || ''} · ${t.analysis.tagline || ''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:28px;font-weight:900;color:${col}">${Math.round(t.totalScore)}</div>
          <div style="font-size:11px;color:${col}">${t.grade}</div>
        </div>
      </div>
      <div style="background:var(--bg-base);border-radius:6px;height:6px;overflow:hidden;margin-bottom:8px;">
        <div style="width:${t.totalScore}%;height:100%;background:${col};border-radius:6px"></div>
      </div>
      <div style="font-size:10px;color:var(--text-muted)">${t.meetsThreshold ? '✅ 达标' : `⚠️ 差${Math.ceil(t.industryMin - t.totalScore)}分`} · ${t.industryLabel}${t.industryMin}分</div>
    </div>`;
  }).join('');

  // Dimension comparison table
  const dimTableRows = DIMENSIONS.map(d => {
    const scores = tools.map(t => t.analysis.dimScores[d.id]?.score ?? 0);
    const maxS = Math.max(...scores);
    return `<tr>
      <td style="white-space:nowrap">${d.icon} ${d.id}</td>
      <td style="font-size:11px;color:var(--text-second)">${d.name}</td>
      ${scores.map(s => {
        const bg = s === maxS ? 'rgba(79,127,255,.15)' : s < 2 ? 'rgba(239,68,68,.08)' : '';
        return `<td style="text-align:center;font-weight:700;color:${s >= 4 ? '#10b981' : s >= 3 ? '#f59e0b' : '#ef4444'};background:${bg}">${s.toFixed(1)}</td>`;
      }).join('')}
    </tr>`;
  }).join('');

  // Category group analysis
  const categories = {};
  tools.forEach(t => {
    const cat = t.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(t);
  });

  const catSections = Object.entries(categories).map(([cat, catTools]) => {
    const avg = catTools.reduce((s, t) => s + t.totalScore, 0) / catTools.length;
    const catLabel = { edr_xdr: '终端检测与响应 (EDR/XDR)', iam: '身份与访问管理 (IAM)', cloud_network: '云安全与网络防御', ai_coding: 'AI Coding 工具' }[cat] || cat;
    return `<div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div style="font-size:15px;font-weight:700">${catLabel}</div>
        <div style="font-size:20px;font-weight:800;color:${scoreColor(avg)}">${Math.round(avg)}分</div>
      </div>
      ${catTools.map(t => {
        const col = scoreColor(t.totalScore);
        return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--border)">
          <span style="flex:1;font-size:13px">${t.toolName}</span>
          <span style="font-weight:700;color:${col}">${Math.round(t.totalScore)}</span>
          <span style="font-size:11px;color:${col}">${t.grade}</span>
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  // All risks summary
  const allRisks = tools.flatMap(t => (t.analysis.risks || []).map(r => ({ ...r, tool: t.toolName })));
  const highRisks = allRisks.filter(r => r.severity === 'high');
  const medRisks = allRisks.filter(r => r.severity === 'medium');

  const riskSummary = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:var(--radius);padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:900;color:#ef4444">${highRisks.length}</div>
        <div style="font-size:11px;color:var(--text-muted)">高风险项</div>
      </div>
      <div style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:var(--radius);padding:16px;text-align:center">
        <div style="font-size:28px;font-weight:900;color:#f59e0b">${medRisks.length}</div>
        <div style="font-size:11px;color:var(--text-muted)">中风险项</div>
      </div>
    </div>
    ${highRisks.map(r => `<div style="background:rgba(239,68,68,.08);border-left:3px solid #ef4444;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:8px;">
      <div style="font-size:12px;font-weight:700;color:#ef4444">[${r.tool}] ${r.title}</div>
      <div style="font-size:11px;color:var(--text-second)">${r.desc}</div>
    </div>`).join('')}
  `;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>TrustLens 全量安全横评报告 — ${now}</title>
  <style>${styles}
  .report-page{max-width:1200px;margin:0 auto;padding:40px 32px 60px}
  h2{font-size:20px;font-weight:700;margin:32px 0 16px;border-bottom:1px solid var(--border);padding-bottom:8px}
  .hero{text-align:center;margin-bottom:36px}
  .hero h1{font-size:30px;font-weight:800;margin-bottom:8px}
  .hero-sub{color:var(--text-muted);font-size:13px}
  .cards-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
  .radar-wrap{display:flex;justify-content:center;margin:20px 0}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:var(--bg-card2);padding:10px 12px;text-align:center;font-size:11px;color:var(--text-muted);font-weight:700}
  td{padding:8px 12px;border-bottom:1px solid var(--border)}
  tr:hover td{background:var(--bg-hover)}
  </style>
</head>
<body>
<div class="report-page">
  <div class="hero">
    <h1>TrustLens AI 工具全量安全横评</h1>
    <div class="hero-sub">评估日期: ${now} · 行业: ${tools[0]?.industryLabel || industry} · 共 ${tools.length} 个工具 · ${tools[0]?.industryMin || 85}分基准</div>
  </div>

  <h2>📊 工具评分排行</h2>
  <div class="cards-grid">${toolCards}</div>

  <h2>📈 多工具对比雷达图</h2>
  <div class="radar-wrap">${compRadar}</div>
  <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin-top:8px;">
    ${tools.map((t, i) => {
      const colors = ['#4f7fff','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899','#84cc16'];
      return `<span style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-second)">
        <span style="width:12px;height:3px;background:${colors[i % colors.length]};border-radius:2px;display:inline-block"></span>
        ${t.toolName} (${Math.round(t.totalScore)})
      </span>`;
    }).join('')}
  </div>

  <h2>📋 九维度评分明细</h2>
  <div style="overflow-x:auto">
    <table>
      <thead><tr>
        <th>维度</th><th>名称</th>
        ${tools.map(t => `<th>${t.toolName}</th>`).join('')}
      </tr></thead>
      <tbody>${dimTableRows}
        <tr style="border-top:2px solid var(--border-light)">
          <td colspan="2" style="font-weight:800">综合得分</td>
          ${tools.map(t => `<td style="text-align:center;font-weight:900;font-size:16px;color:${scoreColor(t.totalScore)}">${Math.round(t.totalScore)} (${t.grade})</td>`).join('')}
        </tr>
      </tbody>
    </table>
  </div>

  <h2>📂 分类对比</h2>
  ${catSections}

  <h2>⚠️ 风险总览</h2>
  ${riskSummary}

  <h2>📎 各工具详细报告</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;">
    ${tools.map(t => `<a href="report_${t.toolName.toLowerCase().replace(/[^a-z0-9]/g,'_')}.html" style="display:block;background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius);padding:16px;text-decoration:none;color:var(--text-primary);transition:border-color .2s" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
      <div style="font-size:14px;font-weight:700;margin-bottom:4px">${t.toolName}</div>
      <div style="font-size:22px;font-weight:900;color:${scoreColor(t.totalScore)}">${Math.round(t.totalScore)} <span style="font-size:13px">${t.grade}</span></div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:4px">查看完整报告 →</div>
    </a>`).join('')}
  </div>

  <p style="margin-top:40px;font-size:11px;color:var(--text-muted);text-align:center">
    Generated by TrustLens · ${now} · 基于 AI 深度分析官方文档自动生成，仅供内部决策参考
  </p>
</div>
</body>
</html>`;
}

// ── Main: Generate all reports ─────────────────────────────

export function generateAllReports(results, industry, outputDir) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // Individual reports
  results.forEach(tool => {
    const safeName = tool.toolName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const html = generateIndividualReport(tool, industry);
    const outPath = path.join(outputDir, `report_${safeName}.html`);
    fs.writeFileSync(outPath, html, 'utf-8');
    console.log(`  📄 ${tool.toolName} → ${outPath}`);
  });

  // Summary report
  const summaryHTML = generateSummaryReport(results, industry);
  const summaryPath = path.join(outputDir, 'report_summary.html');
  fs.writeFileSync(summaryPath, summaryHTML, 'utf-8');
  console.log(`  📊 汇总报告 → ${summaryPath}`);
}
