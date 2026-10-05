import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPublicBookingUrl } from "@/lib/billing/public-booking-url";
import { buildWorkspaceUrls, buildStructuredWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import { submitLeadFormWithDeps, type LeadFormDeps } from "@/lib/landing/lead-form-action";

test("configured origin uses the working workspace-scoped path", () => {
  assert.equal(buildPublicBookingUrl("ezwebdeals", "missing.example", "https://ai.example.test/"),
    "https://ai.example.test/book/ezwebdeals/default");
  assert.equal(buildPublicBookingUrl("other-workspace", "missing.example", "http://localhost:3000"),
    "http://localhost:3000/book/other-workspace/default");
  assert.equal(buildPublicBookingUrl("name/with spaces", "missing.example", "https://ai.example.test/path"),
    "https://ai.example.test/book/name%2Fwith%20spaces/default");
});
test("unconfigured installs retain their legacy URL, invalid protocols fail closed", () => {
  assert.equal(buildPublicBookingUrl("workspace", "app.example.test", ""), "https://workspace.app.example.test/book");
  assert.throws(() => buildPublicBookingUrl("workspace", "app.example.test", "javascript:alert(1)"));
});
test("both public URL contracts use the configured booking origin, without admin tokens", () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = "https://ai.example.test";
  try {
    const flat = buildWorkspaceUrls("ezwebdeals", "missing.example", "org-test");
    const structured = buildStructuredWorkspaceUrls("ezwebdeals", "missing.example", "org-test", { bearerToken: "test-token" });
    assert.equal(flat.book, "https://ai.example.test/book/ezwebdeals/default");
    assert.equal(structured.public_urls.book, flat.book);
    assert.equal(new URL(flat.book).search, "");
    assert.ok(!flat.book.includes("test-token"));
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = previous;
  }
});
for (const suppressed of [true, false]) {
  test(`quote confirmation and follow-up text use the working URL (suppressed=${suppressed})`, async () => {
    const previous = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://ai.example.test";
    let smsBody = "";
    let created = 0;
    const deps: LeadFormDeps = {
      assertWritable: () => {},
      resolveOrgIdBySlug: async () => `quote-test-${suppressed}`,
      enforceContactLimit: async () => ({ allowed: true, tier: "agency_scale" }),
      findContactByPhone: async () => null,
      getContactById: async () => null,
      createContact: async () => { created++; return "test-contact"; },
      updateContact: async () => {},
      emit: async () => {},
      buildBookUrl: (slug, orgId) => buildWorkspaceUrls(slug, "missing.example", orgId).book,
      sendSms: async ({ body }) => { smsBody = body; return { suppressed }; },
      sendOperatorEmail: async () => {},
      getBusinessName: async () => "Test business",
      now: () => new Date("2026-10-05T01:00:00Z"),
    };
    try {
      const input = { orgSlug: "ezwebdeals", name: "Test Person", phone: "+12025550123", need: "Test only" };
      const result = await submitLeadFormWithDeps(input, deps);
      assert.equal(result.ok, true);
      assert.equal(result.smsSent, !suppressed);
      assert.equal(result.bookUrl, "https://ai.example.test/book/ezwebdeals/default");
      assert.ok(smsBody.includes(result.bookUrl));
      assert.ok(!smsBody.includes("missing.example"));
      const retry = await submitLeadFormWithDeps(input, deps);
      assert.equal(retry.bookUrl, result.bookUrl);
      assert.equal(created, 1);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = previous;
    }
  });
}
