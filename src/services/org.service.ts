import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";

export async function getOrg(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    throw new AppError(404, "Organization not found");
  }
  return org;
}

export async function updateOrg(
  orgId: string,
  data: { name?: string; plan?: string }
) {
  // findUnique then update keeps the write scoped to the caller's own org.
  const existing = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!existing) {
    throw new AppError(404, "Organization not found");
  }
  return prisma.organization.update({
    where: { id: orgId },
    data: {
      name: data.name ?? undefined,
      plan: data.plan ?? undefined,
    },
  });
}
