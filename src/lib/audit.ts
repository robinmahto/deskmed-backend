import { prisma, Prisma } from "./prisma";

// Writes one AuditLog row. Called on every patient/appointment mutation (spec §9).
// Pass a transaction client (`tx`) to write the audit row atomically with the
// mutation it records; defaults to the shared client for standalone use.
export async function writeAuditLog(
  params: {
    organizationId: string;
    userId: string;
    action: string; // "CREATE" | "UPDATE" | ...
    entity: string; // "Patient" | "Appointment" | ...
    entityId: string;
    metadata?: Record<string, unknown>;
  },
  db: Prisma.TransactionClient = prisma
): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}
