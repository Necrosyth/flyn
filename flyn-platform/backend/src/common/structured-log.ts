/**
 * Structured logging helper for CloudWatch-searchable logs.
 *
 * Logs that go through this emit a single-line JSON object instead of free text, so CloudWatch
 * Logs Insights / metric-filter patterns can filter by field (e.g. `{ $.tenantId = "abc" }`).
 * This is what makes "show me everything that broke for tenant X" possible — the lack of it is
 * how the inbound-marshall bug stayed invisible (it logged free text that nobody filtered on).
 *
 * Fields that are undefined/null are dropped, so non-message logs don't carry empty
 * tenantId/conversationId/direction keys.
 */
export function jlog(fields: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return JSON.stringify(out);
}
