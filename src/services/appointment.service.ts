import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";

interface Ctx {
  orgId: string;
  userId: string;
}

type AppointmentStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_SHOW";

interface CreateInput {
  patientId: string;
  doctorId: string;
  slot: string;
  type?: string;
  notes?: string;
}

interface UpdateInput {
  slot?: string;
  status?: AppointmentStatus;
  type?: string;
  notes?: string;
}

export function listAppointments(orgId: string) {
  return prisma.appointment.findMany({
    where: { organizationId: orgId },
    orderBy: { slot: "desc" },
    // Select doctor fields explicitly — never include the full User row (leaks passwordHash).
    include: {
      patient: true,
      doctor: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

export async function getAppointment(orgId: string, id: string) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, organizationId: orgId },
    // Select doctor fields explicitly — never include the full User row (leaks passwordHash).
    include: {
      patient: true,
      doctor: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  if (!appointment) {
    throw new AppError(404, "Appointment not found");
  }
  return appointment;
}

export async function createAppointment(ctx: Ctx, data: CreateInput) {
  // The patient must belong to the caller's org; the doctor must be a DOCTOR in it.
  const patient = await prisma.patient.findFirst({
    where: { id: data.patientId, organizationId: ctx.orgId },
  });
  if (!patient) {
    throw new AppError(404, "Patient not found");
  }
  const doctor = await prisma.user.findFirst({
    where: { id: data.doctorId, organizationId: ctx.orgId, role: "DOCTOR" },
  });
  if (!doctor) {
    throw new AppError(404, "Doctor not found");
  }

  // Mutation + audit row commit together (or not at all).
  return prisma.$transaction(async (tx) => {
    const appointment = await tx.appointment.create({
      data: {
        organizationId: ctx.orgId,
        patientId: data.patientId,
        doctorId: data.doctorId,
        slot: new Date(data.slot),
        type: data.type ?? "consultation",
        notes: data.notes ?? null,
      },
    });
    await writeAuditLog(
      {
        organizationId: ctx.orgId,
        userId: ctx.userId,
        action: "CREATE",
        entity: "Appointment",
        entityId: appointment.id,
      },
      tx
    );
    return appointment;
  });
}

export async function updateAppointment(ctx: Ctx, id: string, data: UpdateInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findFirst({
      where: { id, organizationId: ctx.orgId },
    });
    if (!existing) {
      throw new AppError(404, "Appointment not found");
    }
    const appointment = await tx.appointment.update({
      where: { id },
      data: {
        slot: data.slot ? new Date(data.slot) : undefined,
        status: data.status ?? undefined,
        type: data.type ?? undefined,
        notes: data.notes ?? undefined,
      },
    });
    await writeAuditLog(
      {
        organizationId: ctx.orgId,
        userId: ctx.userId,
        action: "UPDATE",
        entity: "Appointment",
        entityId: appointment.id,
      },
      tx
    );
    return appointment;
  });
}
