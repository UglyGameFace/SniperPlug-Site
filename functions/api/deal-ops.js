import { requireAdmin } from '../_lib/auth.js';
import { DEAL_OPS_SNAPSHOT } from '../_lib/deal-ops-snapshot.js';
import { handleError, json, methodNotAllowed } from '../_lib/http.js';

const BOT = 'UglyGameFace/SniperPlug';
const SITE = 'UglyGameFace/SniperPlug-Site';
const GITHUB = 'https://api.github.com/repos/';
const STATUS_VALUES = ['proposed', 'running', 'failed', 'blocked', 'verified', 'pushed', 'merged', 'deployed', 'unknown'];
const CHECKS = [
  {
    id: 'manual-check', view: 'live', title: '/check_deal exact-item verification',
    route: 'Direct check', category: 'Walmart', productType: 'All', severity: 'high',
    files: ['sniperplug/cogs/deal_scanner.py', 'sniperplug/services/walmart_exact_verification_queue.py'],
    tests: ['tests/test_local_check_command_helpers.py', 'tests/test_walmart_page_price_lane_a1.py'],
    expected: 'Direct item-ID or exact-link intake, identity verification, and separate page-price handling.',
    required: ['Exact item/SKU and seller/variant', 'API or page-price observation with timestamp', 'Discord reply and durable queue receipt'],
    diagnostic: 'Read the exact item outcome with /check_deal, then use the read-only /sniperplug deal_trace for the same identifier. Do not post a test alert.',
  },
  {
    id: 'page-price', view: 'live', title: 'Page-price lead firing',
    route: 'Price glitch', category: 'Walmart', productType: 'Electronics', severity: 'critical',
    files: ['sniperplug/services/walmart_extreme_price_fanout.py', 'sniperplug/providers/walmart_page_recovery.py'],
    tests: ['tests/test_walmart_page_price_lane_a1.py'],
    expected: 'Treat a page-observed amount without an API price as a separate evidence class; avoid promoting it into verified markdown.',
    required: ['Exact retailer product page with timestamp', 'Seller, variant, fulfillment and availability', 'Dispatch or rejection reason and downstream receipt'],
    diagnostic: 'Inspect the selected page-price lead in retained queue/dispatch logs and compare the same seller, variant, and time window.',
  },
  {
    id: 'sniper-revisit', view: 'revisit', title: 'Price-sniper revisit (~16 minutes)',
    route: 'Scheduled scan', category: 'Walmart', productType: 'All', severity: 'high',
    files: ['sniperplug/services/walmart_catalog_discovery_only.py', 'sniperplug/cogs/global_auto_scan_runner.py'],
    tests: ['tests/test_walmart_sniper_first_scheduling_a2.py'],
    expected: 'Planned 2 broad + 2 price-sorted searches in a four-call/minute budget; ~16-minute modeled rotation, not measured production latency.',
    required: ['Consecutive actual scan start/end timestamps', 'Per-query rotation ID', 'Batch completion, quota and stalled-cycle evidence'],
    diagnostic: 'Read two complete scan-cycle log windows and calculate actual revisit distribution for the same rotation term.',
  },
  {
    id: 'cycle-timeouts', view: 'timeouts', title: 'Catalog and exact-worker cycle timeouts',
    route: 'Scheduled scan', category: 'Walmart', productType: 'All', severity: 'critical',
    files: ['sniperplug/cogs/global_auto_scan_runner.py', 'sniperplug/services/walmart_worker_cycle_health.py'],
    tests: ['tests/test_autoscan_no_hang_static.py', 'tests/test_turso_stream_and_cash_timeout_static.py'],
    expected: 'Configured watchdogs report catalog-cycle and exact-worker timeouts without silently counting timed-out work as successful.',
    required: ['Timed-out cycle ID and elapsed seconds', 'Watchdog alert and recovery log', 'Next scheduled cycle progress'],
    diagnostic: 'Read the worker-cycle health snapshot and matching timeout/recovery log lines; never trigger a retry from this page.',
  },
  {
    id: 'inheritance', view: 'timeouts', title: 'Scanner inheritance-stack collapse',
    route: 'Architecture', category: 'Runtime', productType: 'All', severity: 'high',
    files: ['sniperplug/cogs/global_auto_scan_runner.py', 'sniperplug/cogs/deal_scanner.py'],
    tests: ['tests/test_runtime_registry_and_scan_locks.py', 'tests/test_canonical_command_surface.py'],
    expected: 'One authoritative runtime path for scanner scheduling, command handlers, and posting; no silent legacy fallback.',
    required: ['Deployed class resolution and active task list', 'No duplicate scheduling/senders in production logs', 'Exact-head regression and live command-surface check'],
    diagnostic: 'Inspect the loaded scanner MRO and registered tasks from a read-only runtime diagnostic, and compare with the deployed SHA.',
  },
  {
    id: 'listing-accuracy', view: 'missed', title: 'Exact listing, stock, and checkout-price accuracy',
    route: 'Deal alerts', category: 'All retailers', productType: 'All', severity: 'critical',
    files: ['sniperplug/services/walmart_exact_verification_queue.py', 'sniperplug/services/public_deal_quality.py'],
    tests: ['tests/test_jewelry_quality_and_live_price_truth.py', 'tests/test_product_identity_match.py'],
    expected: 'Exact SKU/variant/offer and current stock required before calling a retail lead verified.',
    required: ['Original listing and seller snapshot', 'Fresh item API/page/cart price, fulfillment and stock', 'Published Discord payload and price timestamp'],
    diagnostic: 'Compare the retailer listing at alert time against the saved exact-offer receipt, not a newer price or generic search page.',
  },
  {
    id: 'resale', view: 'filters', title: 'Net resale value and authentic demand filtering',
    route: 'Flip / Best Picks', category: 'Resale', productType: 'Computers', severity: 'high',
    files: ['sniperplug/services/product_demand_evidence.py', 'sniperplug/services/product_target_fit.py'],
    tests: ['tests/test_product_demand_evidence.py', 'tests/test_product_target_fit.py'],
    expected: 'Separate interest proxies from sold comps; subtract actual fees and expenses before promoting a flip edge.',
    required: ['Exact recent sold comps with permission/provenance', 'Condition-matched cost basis, taxes and fees', 'Observed liquidity and price confidence'],
    diagnostic: 'Review a private deal_trace and its exact source fields; keep missing sold-comps and net ROI labeled unverified.',
  },
  {
    id: 'jewelry', view: 'filters', title: 'Fake and low-quality jewelry exclusion',
    route: 'Price glitch', category: 'Jewelry', productType: 'Jewelry', severity: 'critical',
    files: ['sniperplug/services/jewelry_quality.py', 'sniperplug/services/dm_deal_matching.py'],
    tests: ['tests/test_jewelry_quality_and_live_price_truth.py'],
    expected: 'Block cheap plated, imitation, ambiguous and low-quality jewelry from premium deal routes unless source-backed quality is established.',
    required: ['Exact product materials and seller', 'Quality/brand/condition evidence', 'Negative sample and false-positive/false-negative review'],
    diagnostic: 'Read the jewelry rejection reason for the exact item and compare it with official listing material claims.',
  },
  {
    id: 'missed-deals', view: 'missed', title: 'Missed or suppressed high-value offers',
    route: 'Price glitch', category: 'All retailers', productType: 'All', severity: 'critical',
    files: ['sniperplug/services/walmart_catalog_discovery_only.py', 'sniperplug/services/walmart_exact_queue_bulk_runtime.py'],
    tests: ['tests/test_walmart_fast_catalog_discovery_304.py', 'tests/test_variant_safe_public_dedupe.py'],
    expected: 'No first-hit offer loss, invalid dedupe, queue starvation, or silence on genuinely buyable price errors.',
    required: ['Independently timestamped true-positive offer', 'Catalog response and queue/fanout path', 'Guild destination and exact dispatch or rejection receipt'],
    diagnostic: 'Use the retained /sniperplug deal_trace for an exact ID and compare its lifecycle to the source listing timestamp.',
  },
];

const fileLink = (sha, path) => `https://github.com/${BOT}/blob/${sha}/${path}`;
const repositoryLink = (repo) => `https://github.com/${repo}`;
async function publicGithub(repo, path) {
  const response = await fetch(`${GITHUB}${repo}/${path}`, {
    method: 'GET',
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'SniperPlug-readonly-operations' },
    signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) throw new Error(`GitHub read unavailable (HTTP ${response.status})`);
  return response.json();
}

function recordStatus(result) {
  return result.status === 'fulfilled' ? 'available' : 'unavailable';
}
function resultValue(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
}
function safeUrl(url, repo = BOT) {
  const prefix = `https://github.com/${repo}/`;
  return typeof url === 'string' && url.startsWith(prefix) && !/[\s<>"']/u.test(url) ? url : null;
}

export async function buildDealOpsSnapshot({
  now = () => new Date().toISOString(),
  github,
  fallback = DEAL_OPS_SNAPSHOT,
} = {}) {
  const keys = ['commit', 'tree', 'runs', 'pulls', 'issues', 'commits', 'siteCommit'];
  const queries = [
    [BOT, 'commits/main'],
    [BOT, 'git/trees/main?recursive=1'],
    [BOT, 'actions/runs?branch=main&per_page=12'],
    [BOT, 'pulls?state=open&per_page=50'],
    [BOT, 'issues?state=open&per_page=100'],
    [BOT, 'commits?sha=main&per_page=12'],
    [SITE, 'commits/main'],
  ];
  // Cloudflare edge egress frequently hits anonymous GitHub limits. Do not
  // mistake seven empty API responses for a repository with zero PRs/CI.
  // The default is a periodically regenerated, trusted public-metadata
  // snapshot imported into the private Pages Function. Unit tests may inject
  // the same official API reader to validate failures and live responses.
  const snapshotValid = fallback?.schema === 1 && fallback?.bot === BOT
    && fallback?.site === SITE && fallback?.sources?.commit?.sha;
  const usingSnapshot = !github && snapshotValid;
  const results = usingSnapshot
    ? keys.map((key) => fallback.sources[key] == null
      ? { status: 'rejected', reason: new Error('Source not in snapshot') }
      : { status: 'fulfilled', value: fallback.sources[key] })
    : await Promise.allSettled(queries.map(([repo, path]) => (github || publicGithub)(repo, path)));
  const byKey = Object.fromEntries(keys.map((key, index) => [key, results[index]]));
  const captureAt = usingSnapshot ? fallback.collectedAt : now();
  const captureMs = Date.parse(captureAt);
  const ageHours = Number.isFinite(captureMs)
    ? Math.max(0, (Date.parse(now()) - captureMs) / 3600000)
    : null;
  const snapshotStale = usingSnapshot && (ageHours == null || ageHours > 8);
  const sourceStatus = (result) => result.status === 'fulfilled'
    ? usingSnapshot ? (snapshotStale ? 'stale' : 'snapshot') : 'available'
    : 'unavailable';
  const mainCommit = resultValue(byKey.commit, null);
  const mainSha = typeof mainCommit?.sha === 'string' && /^[0-9a-f]{40}$/i.test(mainCommit.sha) ? mainCommit.sha : null;
  const tree = resultValue(byKey.tree, null);
  const paths = Array.isArray(tree?.tree) ? new Set(tree.tree.filter((entry) => entry.type === 'blob').map((entry) => entry.path)) : null;
  const runs = resultValue(byKey.runs, null);
  const recentRuns = Array.isArray(runs?.workflow_runs) ? runs.workflow_runs : [];
  const exactHeadRuns = mainSha ? recentRuns.filter((run) => run.head_sha === mainSha) : [];
  const prs = resultValue(byKey.pulls, null);
  const issues = resultValue(byKey.issues, null);
  const commits = resultValue(byKey.commits, null);
  const siteCommit = resultValue(byKey.siteCommit, null);

  const checks = CHECKS.map((check) => {
    const codePresent = paths ? check.files.every((path) => paths.has(path)) : null;
    const testsPresent = paths ? check.tests.filter((path) => paths.has(path)) : [];
    return {
      ...check,
      status: codePresent === true ? 'pushed' : codePresent === false ? 'blocked' : 'unknown',
      evidenceLevel: codePresent === true ? 'code_present' : codePresent === false ? 'missing_code' : 'unknown',
      codePresent,
      testFilesPresent: paths ? testsPresent.length : null,
      codeLinks: mainSha && paths ? check.files.filter((path) => paths.has(path)).map((path) => ({ label: path, url: fileLink(mainSha, path) })) : [],
      testLinks: mainSha && paths ? testsPresent.map((path) => ({ label: path, url: fileLink(mainSha, path) })) : [],
      runtime: 'unknown', deployed: 'unknown', observedAt: null,
      branch: 'main', test: check.tests[0], date: null,
      logLines: null, listing: null, price: null, availability: null,
      reason: codePresent === false
        ? 'Required code is absent from the inspected main tree.'
        : codePresent === true
          ? 'Source exists on GitHub main. Production Discloud, listing, and Discord receipts remain unverified.'
          : 'GitHub source unavailable; no runtime evidence connected.',
      inferred: false,
    };
  });

  const prRows = Array.isArray(prs) ? prs.filter((p) => Number.isInteger(p.number)).map((p) => ({
    id: `pr-${p.number}`, title: `PR #${p.number}: ${String(p.title || '').slice(0, 180)}`,
    view: 'branches', route: 'Repository', category: 'Release', productType: 'All',
    severity: 'medium', status: p.draft ? 'proposed' : 'running',
    evidenceLevel: 'github_pr', branch: String(p.head?.ref || 'unknown'),
    date: p.updated_at || null, observedAt: p.updated_at || null,
    expected: 'An open PR is not merged or deployed; CI outcome requires its exact head check.',
    reason: 'Open GitHub pull request; local-only branches remain unobservable.',
    codeLinks: [], testLinks: [], tests: [], files: [],
    links: [{ label: 'Open PR', url: safeUrl(p.html_url) }].filter((entry) => entry.url),
    required: ['Exact-head checks', 'Review and merge', 'Live Discloud SHA and state-preserving deployment proof'],
    diagnostic: 'Read the PR diff, exact-head checks, and conflicts. Do not merge or deploy from this workspace.',
    runtime: 'unknown', deployed: 'unknown', test: 'PR CI', inferred: false,
  })) : [];

  const issueRows = Array.isArray(issues) ? issues.filter((i) => !i.pull_request && Number.isInteger(i.number) && /walmart|miss|deal|price|jewel|resale|snip|timeout|scan/i.test(String(i.title || '') + ' ' + String(i.body || '').slice(0, 300))).slice(0, 20).map((i) => ({
    id: `issue-${i.number}`, title: `Issue #${i.number}: ${String(i.title || '').slice(0, 180)}`,
    view: 'missed', route: 'Issue', category: 'All retailers', productType: 'All', severity: 'high',
    status: 'blocked', evidenceLevel: 'reported', branch: 'unknown', test: 'unknown',
    date: i.updated_at || null, observedAt: i.updated_at || null,
    expected: 'Issue report; no live deal or retailer verification is implied.',
    reason: 'Production trace and resolution evidence must be attached before calling the report verified.',
    links: [{ label: 'Open issue', url: safeUrl(i.html_url) }].filter((entry) => entry.url),
    codeLinks: [], testLinks: [], required: ['Exact listing and timestamp', 'Trace or logs', 'Observed alert or rejection'],
    diagnostic: 'Inspect the linked report and capture read-only exact-item trace before concluding cause.',
    runtime: 'unknown', deployed: 'unknown', inferred: false,
  })) : [];

  const remoteBranches = usingSnapshot && Array.isArray(fallback.sources.branches)
    ? fallback.sources.branches : [];
  const remoteBranchRows = remoteBranches
    .filter((b) => b?.name && b.name !== 'main')
    .map((b) => ({
      id: `branch-${b.name}`,
      title: `Remote branch: ${b.name}`,
      view: 'branches', route: 'Repository', category: 'Branch', productType: 'All',
      severity: 'medium',
      status: 'unknown',
      evidenceLevel: 'remote_branch',
      branch: b.name,
      test: 'unknown',
      date: null,
      observedAt: captureAt,
      expected: b.sha === mainSha
        ? 'Branch head matches current main. Branch retirement can be investigated.'
        : 'This remote ref exists; its commits may already be merged or still be independent. Git ancestry was not checked.',
      reason: 'A remote ref is not an unfinished local worktree. Merge/closure state and local-only edits remain unknown.',
      links: [{
        label: 'Inspect branch commits',
        url: `https://github.com/${BOT}/tree/${encodeURIComponent(b.name)}`,
      }],
      codeLinks: [], testLinks: [], required: [
        'Compare branch with main and linked PRs', 'Check unique commits and active owners before cleanup',
        'Verify no unpushed local changes',
      ],
      diagnostic: 'Open the branch in GitHub and use its compare view; do not delete or merge without verifying unique commits.',
      runtime: 'unknown', deployed: 'unknown', inferred: false,
    }));
  const audit = Array.isArray(commits) ? commits.slice(0, 12).filter((c) => typeof c.sha === 'string').map((c) => ({
    id: c.sha, at: c.commit?.committer?.date || null,
    state: /^Merge pull request #\d+/i.test(String(c.commit?.message || '')) ? 'merged' : 'pushed',
    label: String(c.commit?.message || 'Commit').split('\n')[0].slice(0, 180),
    sha: c.sha, url: safeUrl(c.html_url),
    proof: 'Present in GitHub main history; deployment not established.',
  })) : [];
  const checksCi = exactHeadRuns.map((run) => ({
    id: run.id, name: run.name || 'Workflow',
    status: run.status === 'completed' ? (run.conclusion === 'success' ? 'verified' : run.conclusion === 'failure' ? 'failed' : 'unknown') : 'running',
    conclusion: run.conclusion || null,
    createdAt: run.created_at || null, completedAt: run.updated_at || null,
    url: safeUrl(run.html_url), sha: mainSha,
  }));
  return {
    generatedAt: captureAt, checkedAt: now(),
    evidenceOrigin: usingSnapshot ? 'scheduled_github_snapshot' : 'github_api',
    evidenceAgeHours: ageHours, snapshotStale,
    branchSummary: {
      remoteCount: remoteBranches.length,
      localCount: null,
      verifiedUnmergedCount: null,
    },
    statusValues: STATUS_VALUES,
    repository: { bot: repositoryLink(BOT), site: repositoryLink(SITE), mainSha, mainCommitAt: mainCommit?.commit?.committer?.date || null,
      siteMainSha: /^[0-9a-f]{40}$/i.test(String(siteCommit?.sha || '')) ? siteCommit.sha : null },
    sources: {
      githubCommit: sourceStatus(byKey.commit), githubTree: sourceStatus(byKey.tree),
      githubCi: sourceStatus(byKey.runs), githubPrs: sourceStatus(byKey.pulls),
      githubIssues: sourceStatus(byKey.issues), githubHistory: sourceStatus(byKey.commits),
      siteCommit: sourceStatus(byKey.siteCommit), githubBranches: usingSnapshot
        ? (snapshotStale ? 'stale' : 'snapshot') : 'unavailable',
      discloud: 'not_connected', retailer: 'not_connected', discord: 'not_connected',
      listingSnapshots: 'not_connected', deployment: 'not_connected', localBranches: 'not_connected',
    },
    ci: checksCi, checks: [...checks, ...prRows, ...issueRows, ...remoteBranchRows], audit,
    notes: [
      'Code presence, CI outcome, PR state, and production behavior are different kinds of evidence.',
      usingSnapshot
        ? `GitHub metadata was captured at ${captureAt}, normally refreshed every six hours; reloading this page does not force a GitHub update.`
        : 'GitHub metadata is from an independent API read; disconnected sources are never treated as empty.',
      `Found ${remoteBranches.length} GitHub remote branches. This does not establish any unfinished local branches or unmerged commits.`,
      'The ~16-minute revisit is a code-derived scheduling target, not a measured production SLO.',
      'The site has no authorized Discloud, retailer listing, Discord receipt, or local-worktree feed. Those fields remain unknown.',
      'A GitHub merge does not prove a Discloud release, database preservation, or a Cloudflare Pages deployment.',
    ],
  };
}

export async function onRequest(context) {
  try {
    if (context.request.method !== 'GET') return methodNotAllowed(['GET']);
    await requireAdmin(context.request, context.env);
    const data = await buildDealOpsSnapshot();
    const response = json(data);
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return response;
  } catch (error) {
    return handleError(error);
  }
}
