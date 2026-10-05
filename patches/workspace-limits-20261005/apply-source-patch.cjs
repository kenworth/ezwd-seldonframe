// Apply to the source tree shipped in the customized EZwebdeals base image.
// Fail closed if upstream changed a patch target; never patch compiled chunks.
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2] || '/app';
const changes = new Map();
function edit(file, fn) {
  const original = fs.readFileSync(path.join(root, file), 'utf8');
  changes.set(file, fn(original));
}
function replace(source, from, to, expected = 1) {
  const count = typeof from === 'string' ? source.split(from).length - 1 : [...source.matchAll(from)].length;
  if (count !== expected) throw new Error(`Patch target mismatch: expected ${expected}, got ${count}: ${from}`);
  return typeof from === 'string' ? source.split(from).join(to) : source.replace(from, to);
}
edit('packages/crm/src/lib/billing/limits.ts', s => {
  s = replace(s, /\/\*\* Full-workspace allowance per tier\.[\s\S]*?\n\}/g, `/** Workspace quotas come from the current plan catalog. -1 means unlimited. */
export function getWorkspaceQuota(rawTier: string | null | undefined, used: number) {
  const tier = normalizeTierId(rawTier);
  const maxOrgs = getPlan(tier)?.limits.maxOrgs ?? 0;
  return { maxOrgs, canCreate: maxOrgs === -1 || used < maxOrgs };
}`);
  s = replace(s, `  const cap = maxFullWorkspacesForTier(tier);

  if (cap === -1) return { allowed: true, tier };
  if (params.ownedWorkspaceCount < cap) return { allowed: true, tier };`, `  const { maxOrgs: cap, canCreate } = getWorkspaceQuota(tier, params.ownedWorkspaceCount);
  if (canCreate) return { allowed: true, tier };`);
  s = replace(s, /  const message =\n[\s\S]*?\n\n  return \{/g, `  const message = cap > 0
    ? \`Your plan includes \${cap} workspace. Upgrade to add more client workspaces.\`
    : "Choose a plan to add a workspace.";

  return {`);
  s = s.replace('//   builder            = 0 full workspaces (landing pages capped at 10\n//                        separately via lib/tier/limits.ts)', '//   builder + agency_* = unlimited own workspaces\n//   managed            = 1');
  s = s.replace(' * Workspace-creation cap. builder/inactive = 0 full workspaces,\n * workspace = 1, agency = unlimited.', ' * Workspace-creation cap from the current catalog. Unlimited plans have no\n * numeric ceiling; managed/workspace retain their one-workspace cap.');
  return s;
});
edit('packages/crm/src/lib/billing/orgs.ts', s => {
  s = replace(s, 'import { enforceWorkspaceLimit } from "@/lib/billing/limits";', 'import { enforceWorkspaceLimit, getWorkspaceQuota } from "@/lib/billing/limits";\nimport { resolveTierForWorkspace } from "@/lib/billing/tier-resolver";');
  s = replace(s, 'const FREE_WORKSPACE_ALLOWANCE = 1;\n', '');
  s = replace(s, /\/\*\*\n \* April 30, 2026 — pricing migration\.[\s\S]*?function loadWorkspaceTierStatus\([\s\S]*?\n\}\n/g, '');
  s = replace(s, `  const orgSubscription = await getOrgSubscription(user.orgId);
  const orgFeatures = getOrgFeatures(orgSubscription.tier ?? "free");`, `  // Use the same inherited entitlement as the creation gate.
  const tier = user.orgId ? await resolveTierForWorkspace(user.orgId) : "inactive";
  const orgFeatures = getOrgFeatures(tier);`, 2);
  s = replace(s, /  const tierStatus = loadWorkspaceTierStatus\(orgSubscription\);\n[\s\S]*?  const canCreate = ownedWorkspaceCount < maxOrgs;/g, '  const { maxOrgs, canCreate } = getWorkspaceQuota(tier, ownedWorkspaceCount);', 2);
  s = replace(s, 'tier: orgSubscription.tier ?? "free",', 'tier,', 2);
  // This helper was the only subscription reader in this module.
  s = replace(s, 'import { getOrgSubscription } from "@/lib/billing/subscription";\n', '');
  return s;
});
edit('packages/crm/src/app/(dashboard)/clients/page.tsx', s => {
  s = replace(s, /  const tier = asAgencyTier\(limitStatus.tier\);\n[\s\S]*?    : limitStatus.maxOrgs;/g, `  // Keep -1 in the JSON API; convert only at the presentation boundary.
  const unlimited = limitStatus.maxOrgs === -1;
  const tier = unlimited ? "scale" : asAgencyTier(limitStatus.tier);
  const limit = unlimited ? Number.POSITIVE_INFINITY : limitStatus.maxOrgs;`);
  return s;
});
edit('packages/crm/src/app/orgs/page.tsx', s => {
  s = replace(s, 'if (!plan || plan.id !== "agency") {', 'if (!plan || !["agency", "agency_starter", "agency_growth", "agency_scale"].includes(plan.id)) {');
  s = replace(s, 'Managing {rows.length} of {limitStatus.maxOrgs} organizations', 'Managing {rows.length} of {limitStatus.maxOrgs === -1 ? "unlimited" : limitStatus.maxOrgs} organizations');
  return s;
});
edit('packages/crm/tests/unit/billing-workspace-limit.spec.ts', s => {
  s = replace(s, /describe\("enforceWorkspaceLimit — builder \(0 full workspaces\)"[\s\S]*?\n\}\);/g, `describe("enforceWorkspaceLimit — current Builder plan", () => {
  test("allows unlimited own workspaces, as specified by the catalog", async () => {
    for (const ownedWorkspaceCount of [0, 1, 1001]) {
      const decision = await enforceWorkspaceLimit(
        { userId: "u1", primaryOrgId: "org-1", ownedWorkspaceCount },
        withTier("builder"),
      );
      assert.equal(decision.allowed, true);
    }
  });
});`);
  s = s.replace('// builder = 0 full workspaces (landing pages capped separately at 10),', '// Current builder = unlimited own workspaces;');
  return s;
});
// Validate every match before writing any source file.
for (const [file, content] of changes) {
  fs.writeFileSync(path.join(root, file), content);
  console.log(`Patched ${file}`);
}
