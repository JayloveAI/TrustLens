// ─────────────────────────────────────────────────────────────
//  TrustLens — HTML Report Generator
//  Generates a standalone HTML report with inline CSS
// ─────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DIMENSIONS, computeScore, gradeFromScore, scoreColor, verdictText } from './scorer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadStyles() {
  const cssPath = path.join(__dirname, '..', 'styles.css');
  try {
    return fs.readFileSync(cssPath, 'utf-8');
  } catch {
    return '/* styles.css not found */';
  }
}

function generateToolCards(tools) {
  const maxScore = Math.max(...tools.map(t => t.totalScore));

  return tools.map(t => {
    const col = scoreColor(t.totalScore);
    const isBest = t.totalScore === maxScore && tools.length > 1;
    return `
      <div class="bench-tool-card${isBest ? ' best' : ''}">
        <div class="btc-name">${t.toolName}</div>
        <div class="btc-version">${t.category || ''}</div>
        <div class="btc-score" style="color:${col}">${Math.round(t.totalScore)}</div>
        <div class="btc-grade grade-${t.grade.replace('+', '-plus')}">${t.grade}</div>
        <div class="btc-tagline">${t.tagline || ''}</div>
        <div class="btc-bar-wrap">
          <div class="btc-bar-fill" style="width:${t.totalScore}%;background:${col}"></div>
        </div>
        <div style="font-size:10px;color:var(--text-muted);margin-top:6px;">
          ${t.meetsThreshold ? '✅ 达标' : `⚠️ 差 ${Math.ceil(t.industryMin - t.totalScore)} 分`}
          · ${t.industryLabel} ${t.industryMin}分
        </div>
      </div>`;
  }).join('');
}

function generateDimensionTable(tools) {
  const header = `<tr><th>维度</th>${tools.map(t => `<th>${t.toolName}</th>`).join('')}<th>最佳</th></tr>`;

  const rows = DIMENSIONS.map(d => {
    const scores = tools.map(t => t.analysis.dimScores[d.id]?.score ?? 0);
    const maxS = Math.max(...scores);
    const bestIdx = scores.indexOf(maxS);
    return `<tr>
      <td>${d.icon} ${d.id} ${d.name}</td>
      ${scores.map((s, i) => {
        const cls = s === maxS ? 'bench-best-cell' : s < 3 ? 'bench-worst-cell' : '';
        return `<td class="${cls}">${s.toFixed(1)}</td>`;
      }).join('')}
      <td style="font-size:11px;color:var(--text-muted)">${tools[bestIdx].toolName}</td>
    </tr>`;
  }).join('');

  const totalRow = `<tr style="border-top:2px solid var(--border-light)">
    <td><strong>综合得分</strong></td>
    ${tools.map(t => {
      const col = scoreColor(t.totalScore);
      return `<td style="color:${col};font-weight:800">${Math.round(t.totalScore)} (${t.grade})</td>`;
    }).join('')}
    <td></td>
  </tr>`;

  return `<thead><tr>${header}</tr></thead><tbody>${rows}${totalRow}</tbody>`;
}

function generateRiskSection(tools) {
  return tools.map(t => {
    const risks = t.analysis.risks || [];
    if (risks.length === 0) return '';
    return `
      <div style="margin-bottom:24px;">
        <h3>${t.toolName} — 主要风险</h3>
        <ul>${risks.map(r =>
          `<li><strong>[${r.dim}] ${r.title}</strong> — ${r.desc}</li>`
        ).join('')}</ul>
      </div>`;
  }).join('');
}

function generateRecSection(tools) {
  return tools.map(t => {
    const recs = t.analysis.recs || [];
    if (recs.length === 0) return '';
    return `
      <div style="margin-bottom:24px;">
        <h3>${t.toolName} — 补偿控制建议</h3>
        <ul>${recs.map(r =>
          `<li><strong>${r.dim}:</strong> ${r.text}</li>`
        ).join('')}</ul>
      </div>`;
  }).join('');
}

function generateStrengthWeakness(tools) {
  return tools.map(t => {
    const dimEntries = DIMENSIONS.map(d => ({
      dim: d,
      score: t.analysis.dimScores[d.id]?.score ?? 0,
    }));
    dimEntries.sort((a, b) => b.score - a.score);
    const top2 = dimEntries.slice(0, 2);
    const bottom2 = dimEntries.slice(-2).reverse();
    const col = scoreColor(t.totalScore);

    return `
      <div class="bench-sw-card">
        <div class="bsw-header">
          <div class="bsw-name">${t.toolName}</div>
          <div class="bsw-score" style="color:${col}">${Math.round(t.totalScore)}</div>
        </div>
        <div class="bsw-section">
          <div class="bsw-label">💪 核心优势</div>
          ${top2.map(e => `<div class="bsw-item"><span>${e.dim.icon}</span><span style="flex:1;font-size:12px;color:var(--text-second)">${e.dim.id} ${e.dim.name}</span><span class="bsw-dim-score" style="color:var(--green)">${e.score.toFixed(1)}</span></div>`).join('')}
        </div>
        <div class="bsw-section">
          <div class="bsw-label">⚠️ 主要短板</div>
          ${bottom2.map(e => `<div class="bsw-item"><span>${e.dim.icon}</span><span style="flex:1;font-size:12px;color:var(--text-second)">${e.dim.id} ${e.dim.name}</span><span class="bsw-dim-score" style="color:var(--red)">${e.score.toFixed(1)}</span></div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

/**
 * Generate a standalone HTML report.
 * @param {object[]} tools - Array of analyzed tool results
 * @param {string} industry - Industry key
 * @param {string} [outputPath] - Where to write the file
 * @returns {string} The generated HTML string
 */
export function generateReport(tools, industry, outputPath) {
  const now = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const styles = loadStyles();

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TrustLens 安全评估报告 — ${now}</title>
  <style>
    ${styles}
    .report-page { max-width: 1200px; margin: 0 auto; padding: 40px 32px 60px; }
    .report-title { text-align: center; margin-bottom: 32px; }
    .report-title h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
    .report-title p { color: var(--text-second); font-size: 14px; }
    .bench-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-top: 16px; }
    .bench-sw-card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 20px;
    }
    .bsw-section { margin-bottom: 12px; }
    .bsw-label { font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 8px; }
    .bsw-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); }
    .bsw-item:last-child { border-bottom: none; }
    .bsw-dim-score { font-size: 13px; font-weight: 700; }
    h2 { font-size: 20px; font-weight: 700; margin: 32px 0 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
    h3 { font-size: 16px; font-weight: 700; margin: 16px 0 8px; color: var(--accent); }
    ul { padding-left: 20px; }
    li { margin-bottom: 6px; color: var(--text-second); font-size: 13px; }
  </style>
</head>
<body>
<div class="report-page">
  <div class="report-title">
    <h1>🔍 TrustLens AI 工具安全横评报告</h1>
    <p>评估日期: ${now} · 行业: ${industry} · 共 ${tools.length} 个工具</p>
  </div>

  <h2>工具评分总览</h2>
  <div class="bench-cards">
    ${generateToolCards(tools)}
  </div>

  <h2>优劣势摘要</h2>
  <div class="bench-summary-grid">
    ${generateStrengthWeakness(tools)}
  </div>

  <h2>九维度评分明细</h2>
  <div style="overflow-x:auto;">
    <table class="bench-table">
      ${generateDimensionTable(tools)}
    </table>
  </div>

  <h2>主要风险</h2>
  ${generateRiskSection(tools)}

  <h2>补偿控制建议</h2>
  ${generateRecSection(tools)}

  <p class="report-stamp" style="margin-top:40px;">
    Generated by TrustLens CLI · ${now} · 本报告基于 AI 分析官方文档自动生成，仅供内部决策参考
  </p>
</div>
</body>
</html>`;

  if (outputPath) {
    fs.writeFileSync(outputPath, html, 'utf-8');
  }

  return html;
}
