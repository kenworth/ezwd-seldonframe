import { test } from "node:test";
import assert from "node:assert/strict";
import { getWorkspaceQuota, enforceWorkspaceLimit, enforceSubAccountLimit } from "@/lib/billing/limits";
import { normalizeTierId } from "@/lib/billing/features";
import { runListMineWorkspaces } from "@/lib/workspaces/run-list-mine";

for (const rawTier of ["agency_scale", "agency_growth", "agency_starter", "builder", "agency", "scale", "cloud_pro"]) {
  test(`${rawTier}: display and creation remain unlimited past 999 workspaces`, async () => {
    for (const used of [0, 1, 2, 999, 1000, 10000]) {
      assert.deepEqual(getWorkspaceQuota(rawTier, used), { maxOrgs: -1, canCreate: true });
      const result = await enforceWorkspaceLimit(
        { userId: "owner", primaryOrgId: "primary", ownedWorkspaceCount: used },
        { resolveTier: async () => normalizeTierId(rawTier) },
      );
      assert.equal(result.allowed, true);
    }
  });
}
for (const rawTier of ["managed", "workspace", "growth"]) {
  test(`${rawTier}: retains its catalog limit with no extra free workspace`, async () => {
    for (const used of [0, 1, 2]) {
      assert.deepEqual(getWorkspaceQuota(rawTier, used), { maxOrgs: 1, canCreate: used < 1 });
      const result = await enforceWorkspaceLimit(
        { userId: "owner", primaryOrgId: "primary", ownedWorkspaceCount: used },
        { resolveTier: async () => normalizeTierId(rawTier) },
      );
      assert.equal(result.allowed, used < 1);
    }
  });
}
test("missing and unknown plans fail closed", () => {
  for (const tier of [undefined, null, "", "free", "inactive", "invented_plan"]) {
    assert.deepEqual(getWorkspaceQuota(tier, 0), { maxOrgs: 0, canCreate: false });
  }
});
test("own-workspace allowance does not remove client sub-account caps", () => {
  assert.equal(enforceSubAccountLimit({ tier: "agency_starter", currentCount: 10 }).ok, false);
  assert.equal(enforceSubAccountLimit({ tier: "agency_growth", currentCount: 30 }).ok, false);
  assert.equal(enforceSubAccountLimit({ tier: "agency_scale", currentCount: 10000 }).ok, true);
});
test("workspace list JSON preserves unlimited as -1, not null or 999", async () => {
  const result = await runListMineWorkspaces({
    sessionUser: { id: "owner" },
    deps: {
      listManagedOrganizationsForUser: async () => [],
      getWorkspaceLimitStatusForUser: async () => ({ tier: "agency_scale", ...getWorkspaceQuota("agency_scale", 1001) }),
      rollupWorkspace: async () => { throw new Error("No workspaces to roll up"); },
      workspaceBaseDomain: "example.test",
      now: new Date("2026-10-05T00:00:00Z"),
    },
  });
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(JSON.stringify(result.body)).limit, -1);
});
