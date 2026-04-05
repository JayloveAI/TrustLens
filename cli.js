#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
//  TrustLens CLI — AI-Driven Enterprise Tool Security Assessment
//
//  Usage:
//    node cli.js --tool "CrowdStrike Falcon" --industry finance
//    node cli.js --all --industry tech --output report.html
// ─────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { crawlDocs, aggregateDocResults } from './lib/crawler.js';
import { analyzeTool } from './lib/analyzer.js';
import { DIMENSIONS, INDUSTRY_THRESHOLDS, computeScore, gradeFromScore, scoreColor, verdictText } from './lib/scorer.js';
import { generateReport } from './lib/reporter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Argument Parsing ─────────────────────────────────────────

function parseArgs(argv) {
  const args = { _: [] };
  let i = 2; // skip node and script path
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '--tool')    { args.tool = argv[++i]; }
    else if (arg === '--all')    { args.all = true; }
    else if (arg === '--industry') { args.industry = argv[++i]; }
    else if (arg === '--output')   { args.output = argv[++i]; }
    else if (arg === '--fast')     { args.fast = true; }
    else if (arg === '--help' || arg === '-h') { args.help = true; }
    else { args._.push(arg); }
    i++;
  }
  return args;
}

function printHelp() {
  console.log(`
TrustLens CLI — AI 驱动的企业工具安全评估

Usage:
  node cli.js --tool "CrowdStrike Falcon" --industry finance
  node cli.js --all --industry tech --output report.html
  node cli.js --all --output report_2026Q2.html

Options:
  --tool <name>       Analyze a single tool by name (must exist in tools_list.yaml)
  --all               Analyze all tools in tools_list.yaml
  --industry <key>    Industry threshold: tech|finance|healthcare|gov|startup (default: tech)
  --output <path>     Generate standalone HTML report
  --fast              Quick mode (truncated doc analysis)
  --help              Show this help

Environment:
  VOLCENGINE_API_KEY   火山引擎 API Key (GLM-4.7, 豆包等)
  OPENROUTER_API_KEY   OpenRouter API Key (Qwen/Claude/GPT 等多模型)
  ZHIPU_API_KEY        智谱 AI API Key (GLM-4, OpenAI 兼容协议)
  ANTHROPIC_API_KEY    Anthropic API Key (Claude)
  OPENAI_API_KEY       OpenAI API Key (GPT-4o)
  TRUSTLENS_PROVIDER   Force provider: volcengine | openrouter | zhipu | anthropic | openai
  TRUSTLENS_MODEL      Override model name (e.g. ep-20260402222957-7p9j8, qwen/qwen3.6-plus:free)
`);
}

// ── Tool List Loading ────────────────────────────────────────

function loadToolList() {
  const yamlPath = path.join(__dirname, 'tools_list.yaml');
  if (!fs.existsSync(yamlPath)) {
    console.error('❌ tools_list.yaml not found. Create it with tool names and doc URLs.');
    process.exit(1);
  }
  const content = fs.readFileSync(yamlPath, 'utf-8');
  const data = yaml.load(content);
  return data.tools || [];
}

function findTool(tools, name) {
  return tools.find(t => t.name.toLowerCase().includes(name.toLowerCase()));
}

// ── Console Output Helpers ───────────────────────────────────

function printDivider() {
  console.log('─'.repeat(60));
}

function printToolSummary(tool) {
  const col = scoreColor(tool.totalScore);
  const colCode = col === '#10b981' ? '\x1b[32m' : col === '#f59e0b' ? '\x1b[33m' : '\x1b[31m';
  const reset = '\x1b[0m';

  console.log(`\n  ${tool.toolName}`);
  console.log(`  综合评分: ${colCode}${Math.round(tool.totalScore)}/100 (${tool.grade})${reset}`);
  console.log(`  结论: ${verdictText(tool.grade)}`);

  if (tool.industryMin) {
    const gap = tool.industryMin - tool.totalScore;
    console.log(`  行业基准: ${tool.industryLabel} ${tool.industryMin}分 — ${gap > 0 ? `差 ${Math.ceil(gap)} 分` : '已达标'}`);
  }

  console.log(`\n  维度评分:`);
  for (const d of DIMENSIONS) {
    const s = tool.analysis.dimScores[d.id]?.score ?? 0;
    const bar = '█'.repeat(Math.round(s)) + '░'.repeat(5 - Math.round(s));
    const sCol = s >= 4 ? '\x1b[32m' : s >= 3 ? '\x1b[33m' : '\x1b[31m';
    console.log(`  ${d.icon} ${d.id} ${bar} ${sCol}${s.toFixed(1)}${reset}  ${d.name}`);
  }

  if (tool.analysis.risks?.length) {
    console.log(`\n  主要风险:`);
    tool.analysis.risks.slice(0, 3).forEach(r => {
      const sevCol = r.severity === 'high' ? '\x1b[31m' : r.severity === 'medium' ? '\x1b[33m' : '\x1b[32m';
      console.log(`  ${sevCol}[${r.severity.toUpperCase()}]${reset} ${r.title}`);
    });
  }
}

function printComparisonTable(tools) {
  const maxNameLen = Math.max(...tools.map(t => t.toolName.length), 4);

  console.log(`\n${'工具'.padEnd(maxNameLen + 2)} ${'得分'.padStart(5)} ${'等级'.padStart(4)} ${'达标'.padStart(6)}`);
  console.log('─'.repeat(maxNameLen + 22));

  tools.forEach(t => {
    const col = scoreColor(t.totalScore);
    const colCode = col === '#10b981' ? '\x1b[32m' : col === '#f59e0b' ? '\x1b[33m' : '\x1b[31m';
    const reset = '\x1b[0m';
    const meets = t.meetsThreshold ? '✅' : '❌';
    console.log(`${t.toolName.padEnd(maxNameLen + 2)} ${colCode}${Math.round(t.totalScore).toString().padStart(5)}${reset} ${t.grade.padStart(4)} ${meets.padStart(6)}`);
  });

  console.log('');
}

// ── Main Analysis Pipeline ───────────────────────────────────

async function analyzeSingle(toolDef, industry, options = {}) {
  const toolName = toolDef.name;
  const category = toolDef.category;
  const docs = toolDef.docs || [];
  const indConf = INDUSTRY_THRESHOLDS[industry] || INDUSTRY_THRESHOLDS.tech;

  // Step 1: Crawl docs
  console.log(`  📄 爬取文档 (${docs.length} URLs)...`);
  let docText = '';
  if (docs.length > 0) {
    const results = await crawlDocs(docs);
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      errors.forEach(e => console.log(`    ⚠️  ${e.url}: ${e.error}`));
    }
    docText = aggregateDocResults(results);
    console.log(`    提取文本: ${docText.length.toLocaleString()} 字符`);
  } else {
    console.log('    ⚠️  无文档 URL，跳过爬取');
  }

  // Step 2: Analyze with Claude
  console.log('  🤖 Claude 分析中...');
  const startTime = Date.now();
  const analysis = await analyzeTool(toolName, docText, { category });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`  ✅ 分析完成 — 耗时 ${elapsed}s`);

  // Step 3: Compute score
  const totalScore = computeScore(analysis.dimScores);
  const grade = gradeFromScore(totalScore);
  const meetsThreshold = totalScore >= indConf.min;

  return {
    toolName,
    category,
    totalScore,
    grade,
    meetsThreshold,
    industryMin: indConf.min,
    industryLabel: indConf.label,
    analysis,
  };
}

// ── Entry Point ──────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Validate API key
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ZHIPU_API_KEY && !process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.VOLCENGINE_API_KEY) {
    console.error('❌ No API key found. Set one of:');
    console.error('   export VOLCENGINE_API_KEY="your-key"     # 火山引擎 (GLM-4.7, 豆包)');
    console.error('   export OPENROUTER_API_KEY="your-key"     # OpenRouter (Qwen/GPT/Claude 等)');
    console.error('   export ZHIPU_API_KEY="your-key"          # 智谱 AI (GLM-4)');
    console.error('   export ANTHROPIC_API_KEY="your-key"      # Anthropic (Claude)');
    console.error('   export OPENAI_API_KEY="your-key"         # OpenAI (GPT-4o)');
    process.exit(1);
  }

  const industry = args.industry || 'tech';
  const indConf = INDUSTRY_THRESHOLDS[industry] || INDUSTRY_THRESHOLDS.tech;

  // Load tool list
  const allTools = loadToolList();
  if (allTools.length === 0) {
    console.error('❌ tools_list.yaml contains no tools.');
    process.exit(1);
  }

  // Determine which tools to analyze
  let targets;
  if (args.tool) {
    const found = findTool(allTools, args.tool);
    if (!found) {
      console.error(`❌ Tool "${args.tool}" not found in tools_list.yaml.`);
      console.error('   Available tools:');
      allTools.forEach(t => console.error(`     - ${t.name}`));
      process.exit(1);
    }
    targets = [found];
  } else if (args.all) {
    targets = allTools;
  } else {
    console.error('❌ Specify --tool <name> or --all to select tools to analyze.');
    printHelp();
    process.exit(1);
  }

  console.log(`\n🔍 TrustLens 安全评估 — ${indConf.label}行业 (${indConf.min}分基准)`);
  console.log(`   工具数量: ${targets.length}\n`);
  printDivider();

  // Analyze each tool
  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`\n[${i + 1}/${targets.length}] ${t.name}`);
    console.log(`  类别: ${t.category || '未指定'}`);

    try {
      const result = await analyzeSingle(t, industry, { fast: args.fast });
      results.push(result);
      printToolSummary(result);
    } catch (err) {
      console.error(`  ❌ 分析失败: ${err.message}`);
      results.push({
        toolName: t.name,
        category: t.category,
        totalScore: 0,
        grade: 'D',
        meetsThreshold: false,
        industryMin: indConf.min,
        industryLabel: indConf.label,
        analysis: { dimScores: {}, risks: [], recs: [] },
        error: err.message,
      });
    }

    if (i < targets.length - 1) printDivider();
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 评估结果汇总\n');

  if (results.length > 1) {
    printComparisonTable(results);
  } else if (results.length === 1) {
    printToolSummary(results[0]);
  }

  // Generate HTML report if requested
  if (args.output) {
    const outputPath = path.resolve(args.output);
    console.log(`\n📄 生成 HTML 报告: ${outputPath}`);
    generateReport(results, industry, outputPath);
    console.log('✅ 报告已生成');
  }

  console.log('\n✨ 完成！');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
