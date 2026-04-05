// ─────────────────────────────────────────────────────────────
//  TrustLens — Document Crawler (Playwright-based)
//  Fetches official documentation pages and extracts text
// ─────────────────────────────────────────────────────────────

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const MAX_CHARS_PER_TOOL = 20000;

// Security-related keywords for prioritized extraction
const SECURITY_KEYWORDS = [
  'security', 'privacy', 'compliance', 'authentication', 'encryption',
  'authorization', 'audit', 'logging', 'sso', 'saml', 'oauth', 'mfa',
  'gdpr', 'soc2', 'soc 2', 'data protection', 'access control',
  'encryption', 'certificate', 'proxy', 'firewall', 'vulnerability',
  'penetration', 'incident', 'retention', 'encryption at rest',
  'encryption in transit', 'role-based', 'rbac', 'least privilege',
];

/**
 * Crawl a list of URLs and extract document text.
 * @param {string[]} urls - List of documentation URLs
 * @param {object} [options]
 * @param {boolean} [options.headless=true]
 * @param {number} [options.timeout=30000]
 * @returns {Promise<{url: string, text: string, error?: string}[]>}
 */
export async function crawlDocs(urls, options = {}) {
  const { headless = true, timeout = 30000 } = options;
  const browser = await chromium.launch({ headless });
  const results = [];

  for (const url of urls) {
    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

      // Wait a bit for JS-rendered content
      await page.waitForTimeout(2000);

      const text = await extractPageText(page);
      results.push({ url, text });
      await page.close();
    } catch (err) {
      results.push({ url, text: '', error: err.message });
    }
  }

  await browser.close();
  return results;
}

/**
 * Extract meaningful text content from a page, prioritizing security sections.
 */
async function extractPageText(page) {
  // Try to get content from semantic elements first
  const rawText = await page.evaluate(() => {
    const selectors = ['main', 'article', '[role="main"]', '.content', '#content', 'body'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 200) {
        return el.textContent.trim();
      }
    }
    return document.body.textContent.trim();
  });

  // Normalize whitespace
  const normalized = rawText
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Prioritize security-relevant paragraphs from the full document text.
 * Splits into paragraphs, ranks by security keyword density, and returns top content.
 */
export function prioritizeSecurityContent(text, maxChars = MAX_CHARS_PER_TOOL) {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 30);

  // Score each paragraph by security keyword hits
  const scored = paragraphs.map(p => {
    const lower = p.toLowerCase();
    let score = 0;
    for (const kw of SECURITY_KEYWORDS) {
      if (lower.includes(kw)) score += 1;
    }
    return { text: p.trim(), score };
  });

  // Sort by security relevance, but preserve some general context
  scored.sort((a, b) => b.score - a.score);

  // Take top security paragraphs first, then fill with general content
  const selected = [];
  let totalLen = 0;

  // First pass: security-relevant paragraphs
  for (const p of scored) {
    if (p.score > 0 && totalLen + p.text.length <= maxChars * 0.8) {
      selected.push(p.text);
      totalLen += p.text.length;
    }
  }

  // Second pass: general context (in original order)
  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!selected.includes(trimmed) && totalLen + trimmed.length <= maxChars) {
      selected.push(trimmed);
      totalLen += trimmed.length;
    }
  }

  return selected.join('\n\n');
}

/**
 * Aggregate multiple doc results into a single prioritized text block.
 */
export function aggregateDocResults(results) {
  const allText = results
    .filter(r => r.text && !r.error)
    .map(r => `--- Source: ${r.url} ---\n${r.text}`)
    .join('\n\n');

  return prioritizeSecurityContent(allText);
}
