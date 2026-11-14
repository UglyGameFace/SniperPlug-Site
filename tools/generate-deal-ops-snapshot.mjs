// Generate a bounded, public-GitHub-only evidence module for the private
// operations API. CI has its own GitHub API quota; Cloudflare Pages does not.
// No private bot/retailer/Discord credentials are used or serialized.
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BOT = 'UglyGameFace/SniperPlug';
const SITE = 'UglyGameFace/SniperPlug-Site';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const api = 'https://api.github.com/repos/';
const selection = [
  ['commit', BOT, 'commits/main'],
  ['tree', BOT, 'git/trees/main?recursive=1'],
  ['runs', BOT, 'actions/runs?branch=main&per_page=35'],
  ['pulls', BOT, 'pulls?state=open&per_page=100'],
  ['issues', BOT, 'issues?state=open&per_page=100'],
  ['commits', BOT, 'commits?sha=main&per_page=20'],
  ['siteCommit', SITE, 'commits/main'],
];
const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'sniperplug-ops-evidence-snapshot',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
};

async function read(repo, path) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${api}${repo}/${path}`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${repo}/${path}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function safeText(value, max = 200) { return String(value || '').slice(0, max); }
function safeSha(value) {
  return /^[0-9a-f]{40}$/i.test(String(value || '')) ? String(value).toLowerCase() : null;
}
function safeDate(value) {
  return /^\d{4}-\d{2}-\d{2}T/.test(String(value || '')) ? String(value) : null;
}
function safeUrl(url, repo = BOT) {
  const prefix = `https://github.com/${repo}/`;
  return typeof url === 'string' && url.startsWith(prefix) && !/[\s<>"']/u.test(url) ? url : null;
}

function sanitize(key, input) {
  switch (key) {
    case 'commit':
    case 'siteCommit':
      return {
        sha: safeSha(input?.sha),
        commit: { committer: { date: safeDate(input?.commit?.committer?.date) } },
      };
    case 'tree':
      if (!Array.isArray(input?.tree) || input.truncated) throw new Error('Full source tree unavailable/truncated');
      return {
        truncated: false,
        tree: input.tree.filter((entry) => entry?.type === 'blob' && /^sniperplug\/|^tests\//.test(entry.path || ''))
          .map((entry) => ({ type: 'blob', path: safeText(entry.path, 240) })),
      };
    case 'runs':
      return { workflow_runs: (input?.workflow_runs || []).slice(0, 35).map((run) => ({
        id: Number(run.id) || null, name: safeText(run.name, 120),
        head_sha: safeSha(run.head_sha), status: safeText(run.status, 32),
        conclusion: safeText(run.conclusion, 32), created_at: safeDate(run.created_at),
        updated_at: safeDate(run.updated_at), html_url: safeUrl(run.html_url),
      })) };
    case 'pulls':
      if (!Array.isArray(input)) throw new Error('Pull request list is invalid');
      return input.map((p) => ({
        number: p.number, title: safeText(p.title), draft: p.draft === true,
        updated_at: safeDate(p.updated_at),
        head: { ref: safeText(p.head?.ref, 120), sha: safeSha(p.head?.sha) },
        html_url: safeUrl(p.html_url),
      }));
    case 'issues':
      if (!Array.isArray(input)) throw new Error('Issue list invalid');
      return input.filter((i) => !i.pull_request).map((i) => ({
        number: i.number, title: safeText(i.title),
        updated_at: safeDate(i.updated_at), html_url: safeUrl(i.html_url),
      }));
    case 'commits':
      if (!Array.isArray(input)) throw new Error('Commit history invalid');
      return input.slice(0, 20).map((c) => ({
        sha: safeSha(c.sha), html_url: safeUrl(c.html_url),
        commit: { message: safeText(c.commit?.message?.split('\n')[0], 160), committer: { date: safeDate(c.commit?.committer?.date) } },
      }));
    default: throw new Error('Unknown snapshot section');
  }
}

const pairs = await Promise.all(selection.map(async ([key, repo, path]) => [key, sanitize(key, await read(repo, path))]));
const values = Object.fromEntries(pairs);
if (!values.commit.sha || !values.siteCommit.sha) throw new Error('Source commit SHA unavailable');

const branches = [];
for (let page = 1; page <= 10; page += 1) {
  const batch = await read(BOT, `branches?per_page=100&page=${page}`);
  if (!Array.isArray(batch)) throw new Error('Branch pagination invalid');
  branches.push(...batch.map((b) => ({ name: safeText(b.name, 160), sha: safeSha(b.commit?.sha) }))
    .filter((b) => b.name && b.sha));
  if (batch.length < 100) break;
  if (page === 10) throw new Error('Remote branch listing exceeds bounded pagination');
}
values.branches = branches;
const snapshot = {
  schema: 1,
  collectedAt: new Date().toISOString(),
  bot: BOT,
  site: SITE,
  sources: values,
};
const output = join(process.cwd(), 'functions/_lib/deal-ops-snapshot.js');
await writeFile(output,
  '// Generated from public GitHub evidence; do not edit by hand.\n'
  + 'export const DEAL_OPS_SNAPSHOT = ' + JSON.stringify(snapshot) + ';\n',
  'utf8');
console.log(`Public GitHub evidence: ${values.commit.sha.slice(0, 10)}, ${branches.length} remote branches, ${values.pulls.length} open PRs. No Discloud or retailer claim.`);
