ARG BASE_IMAGE=seldonframe-ezwd:pooling-source-v1-20261004
FROM ${BASE_IMAGE} AS build
WORKDIR /app
ENV NODE_OPTIONS="" NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_APP_URL=https://ai.ezwderp.com
COPY apply-source-patch.cjs /tmp/workspace-limits/apply-source-patch.cjs
COPY workspace-quota.spec.ts packages/crm/tests/unit/billing/workspace-quota.spec.ts
RUN node /tmp/workspace-limits/apply-source-patch.cjs /app
RUN pnpm --filter @seldonframe/crm exec node --import tsx --test tests/unit/billing/workspace-quota.spec.ts tests/unit/billing-workspace-limit.spec.ts tests/unit/billing/subaccount-limit.spec.ts tests/unit/billing/subaccount-count.spec.ts tests/unit/db/local-pool.spec.ts tests/unit/agents/voice/run-voice-call.spec.ts
RUN rm -rf packages/crm/.next && pnpm build --force
FROM ${BASE_IMAGE}
RUN rm -rf /app/packages/crm/.next
COPY --from=build /app/packages/crm/.next /app/packages/crm/.next
COPY --from=build /app/packages/crm/src/lib/billing/limits.ts /app/packages/crm/src/lib/billing/limits.ts
COPY --from=build /app/packages/crm/src/lib/billing/orgs.ts /app/packages/crm/src/lib/billing/orgs.ts
COPY --from=build /app/packages/crm/src/app/(dashboard)/clients/page.tsx /app/packages/crm/src/app/(dashboard)/clients/page.tsx
COPY --from=build /app/packages/crm/src/app/orgs/page.tsx /app/packages/crm/src/app/orgs/page.tsx
COPY --from=build /app/packages/crm/tests/unit/billing-workspace-limit.spec.ts /app/packages/crm/tests/unit/billing-workspace-limit.spec.ts
COPY --from=build /app/packages/crm/tests/unit/billing/workspace-quota.spec.ts /app/packages/crm/tests/unit/billing/workspace-quota.spec.ts
LABEL org.ezwebdeals.workspace-limits="catalog-v1"
