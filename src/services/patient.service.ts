import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";

interface Ctx {
  orgId: string;
  userId: string;
}

interface PatientInput {
  name: string;
  phone: string;
  email?: string;
  dob?: string;
  gender?: string;
  bloodGroup?: string;
  address?: string;
}

export function listPatients(orgId: string) {
  return prisma.patient.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPatient(orgId: string, id: string) {
  const patient = await prisma.patient.findFirst({
    where: { id, organizationId: orgId },
    include: {
      appointments: {
        orderBy: { slot: "desc" },
        include: { doctor: { select: { id: true, name: true } } },
      },
    },
  });
  if (!patient) {
    throw new AppError(404, "Patient not found");
  }
  return patient;
}

export async function createPatient(ctx: Ctx, data: PatientInput) {
  // Mutation + audit row commit together (or not at all).
  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.create({
      data: {
        organizationId: ctx.orgId,
        name: data.name,
        phone: data.phone,
        email: data.email ?? null,
        dob: data.dob ? new Date(data.dob) : null,
        gender: data.gender ?? null,
        bloodGroup: data.bloodGroup ?? null,
        address: data.address ?? null,
      },
    });
    await writeAuditLog(
      {
        organizationId: ctx.orgId,
        userId: ctx.userId,
        action: "CREATE",
        entity: "Patient",
        entityId: patient.id,
      },
      tx
    );
    return patient;
  });
}

export async function updatePatient(ctx: Ctx, id: string, data: Partial<PatientInput>) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.patient.findFirst({
      where: { id, organizationId: ctx.orgId },
    });
    if (!existing) {
      throw new AppError(404, "Patient not found");
    }
    const patient = await tx.patient.update({
      where: { id },
      data: {
        name: data.name ?? undefined,
        phone: data.phone ?? undefined,
        email: data.email ?? undefined,
        dob: data.dob ? new Date(data.dob) : undefined,
        gender: data.gender ?? undefined,
        bloodGroup: data.bloodGroup ?? undefined,
        address: data.address ?? undefined,
      },
    });
    await writeAuditLog(
      {
        organizationId: ctx.orgId,
        userId: ctx.userId,
        action: "UPDATE",
        entity: "Patient",
        entityId: patient.id,
      },
      tx
    );
    return patient;
  });
}
