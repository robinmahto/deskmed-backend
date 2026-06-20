import { prisma } from "../lib/prisma";
import type { User } from "../lib/prisma";
import type { Role } from "../types/auth";
import { hashPassword } from "../lib/bcrypt";
import { AppError } from "../lib/errors";

function publicUser(u: User) {
  return {
    id: u.id,
    organizationId: u.organizationId,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
  };
}

export async function listUsers(orgId: string) {
  const users = await prisma.user.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "asc" },
  });
  return users.map(publicUser);
}

export async function createUser(
  orgId: string,
  data: { name: string; email: string; password: string; role: Role }
) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError(409, "Email already registered");
  }
  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: {
      organizationId: orgId,
      name: data.name,
      email: data.email,
      passwordHash,
      role: data.role,
    },
  });
  return publicUser(user);
}

export async function updateUser(
  orgId: string,
  id: string,
  actingUserId: string,
  data: { role?: Role; isActive?: boolean }
) {
  const existing = await prisma.user.findFirst({
    where: { id, organizationId: orgId },
  });
  if (!existing) {
    throw new AppError(404, "User not found");
  }

  const demoting =
    data.role !== undefined && existing.role === "ADMIN" && data.role !== "ADMIN";
  const deactivating = data.isActive === false && existing.isActive === true;

  // An admin may not demote or deactivate their own account.
  if ((demoting || deactivating) && id === actingUserId) {
    throw new AppError(400, "You cannot demote or deactivate your own account");
  }

  // The organization must keep at least one active admin.
  const affectsAdminAccess =
    (demoting || deactivating) && existing.role === "ADMIN" && existing.isActive;
  if (affectsAdminAccess) {
    const otherActiveAdmins = await prisma.user.count({
      where: {
        organizationId: orgId,
        role: "ADMIN",
        isActive: true,
        id: { not: id },
      },
    });
    if (otherActiveAdmins === 0) {
      throw new AppError(400, "At least one admin must remain active");
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      role: data.role ?? undefined,
      isActive: data.isActive ?? undefined,
    },
  });
  return publicUser(user);
}

export function listDoctors(orgId: string) {
  return prisma.user.findMany({
    where: { organizationId: orgId, role: "DOCTOR" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
