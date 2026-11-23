/**
 * Audit event persistence is disabled by product decision. Call sites remain
 * temporarily source-compatible while the feature is removed; no input is stored.
 */
type WriteAuditLogInput = {
  actorUserId: number;
  actorName: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceType?: string | null;
  actorRank?: string | null;
  actorRole?: string | null;
  organizationId?: string | null;
  reason?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
};

export async function writeAuditLog(_input: WriteAuditLogInput): Promise<void> {
  // Intentionally no-op: the Wathaeqi audit-history feature is disabled.
}
