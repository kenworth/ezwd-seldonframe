ARG BASE_IMAGE=seldonframe-ezwd:workspace-limits-v1-20261005
FROM ${BASE_IMAGE} AS build
WORKDIR /app
ENV NODE_OPTIONS="" NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_APP_URL=https://ai.ezwderp.com
COPY apply-source-patch.cjs /tmp/booking-links/apply-source-patch.cjs
COPY public-booking-url.ts packages/crm/src/lib/billing/public-booking-url.ts
COPY booking-links.spec.ts packages/crm/tests/unit/landing/booking-links.spec.ts
RUN node /tmp/booking-links/apply-source-patch.cjs /app
RUN pnpm --filter @seldonframe/crm exec node --import tsx --test tests/unit/landing/booking-links.spec.ts tests/unit/landing/lead-form-action.spec.ts tests/unit/landing/lead-form-confirmation.spec.tsx tests/unit/billing/workspace-quota.spec.ts tests/unit/db/local-pool.spec.ts tests/unit/agents/voice/run-voice-call.spec.ts
RUN rm -rf packages/crm/.next && pnpm build --force
FROM ${BASE_IMAGE}
RUN rm -rf /app/packages/crm/.next
COPY --from=build /app/packages/crm/.next /app/packages/crm/.next
COPY --from=build /app/packages/crm/src/lib/billing/anonymous-workspace.ts /app/packages/crm/src/lib/billing/anonymous-workspace.ts
COPY --from=build /app/packages/crm/src/lib/billing/public-booking-url.ts /app/packages/crm/src/lib/billing/public-booking-url.ts
COPY --from=build /app/packages/crm/tests/unit/landing/booking-links.spec.ts /app/packages/crm/tests/unit/landing/booking-links.spec.ts
LABEL org.ezwebdeals.booking-links="path-v1"
