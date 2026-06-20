import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";

interface Ctx {
  orgId: string;
  userId: string;
}

interface ItemInput {
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
}

interface CreateInput {
  patientId: string;
  doctorId: string;
  appointmentId?: string;
  diagnosis?: string;
  notes?: string;
  items: ItemInput[];
}

interface UpdateInput {
  diagnosis?: string;
  notes?: string;
  status?: "ACTIVE" | "CANCELLED";
  appointmentId?: string;
  items?: ItemInput[];
}

function itemRows(items: ItemInput[]) {
  return items.map((i) => ({
    drugName: i.drugName,
    dosage: i.dosage,
    frequency: i.frequency,
    duration: i.duration,
    instructions: i.instructions ?? null,
  }));
}

async function assertPatientAndDoctor(orgId: string, patientId: string, doctorId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId },
  });
  if (!patient) throw new AppError(404, "Patient not found");
  const doctor = await prisma.user.findFirst({
    where: { id: doctorId, organizationId: orgId, role: "DOCTOR" },
  });
  if (!doctor) throw new AppError(404, "Doctor not found");
}

async function assertAppointment(orgId: string, appointmentId: string) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, organizationId: orgId },
  });
  if (!appt) throw new AppError(404, "Appointment not found");
}

export function listPrescriptions(orgId: string, patientId?: string) {
  return prisma.prescription.findMany({
    where: { organizationId: orgId, ...(patientId ? { patientId } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      items: true,
      patient: true,
      doctor: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

export async function getPrescription(orgId: string, id: string) {
  const rx = await prisma.prescription.findFirst({
    where: { id, organizationId: orgId },
    include: {
      items: true,
      patient: true,
      doctor: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  if (!rx) throw new AppError(404, "Prescription not found");
  return rx;
}

export async function createPrescription(ctx: Ctx, data: CreateInput) {
  await assertPatientAndDoctor(ctx.orgId, data.patientId, data.doctorId);
  if (data.appointmentId) await assertAppointment(ctx.orgId, data.appointmentId);

  return prisma.$transaction(async (tx) => {
    const rx = await tx.prescription.create({
      data: {
        organizationId: ctx.orgId,
        patientId: data.patientId,
        doctorId: data.doctorId,
        appointmentId: data.appointmentId ?? null,
        diagnosis: data.diagnosis ?? null,
        notes: data.notes ?? null,
        items: { create: itemRows(data.items) },
      },
      include: {
        items: true,
        patient: true,
        doctor: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    await writeAuditLog(
      {
        organizationId: ctx.orgId,
        userId: ctx.userId,
        action: "CREATE",
        entity: "Prescription",
        entityId: rx.id,
      },
      tx
    );
    return rx;
  });
}

export async function updatePrescription(ctx: Ctx, id: string, data: UpdateInput) {
  if (data.appointmentId) await assertAppointment(ctx.orgId, data.appointmentId);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.prescription.findFirst({
      where: { id, organizationId: ctx.orgId },
    });
    if (!existing) throw new AppError(404, "Prescription not found");

    // Items are replaced wholesale when provided.
    if (data.items) {
      await tx.prescriptionItem.deleteMany({ where: { prescriptionId: id } });
    }

    const rx = await tx.prescription.update({
      where: { id },
      data: {
        diagnosis: data.diagnosis ?? undefined,
        notes: data.notes ?? undefined,
        status: (data.status ?? undefined) as never,
        appointmentId: data.appointmentId ?? undefined,
        ...(data.items ? { items: { create: itemRows(data.items) } } : {}),
      },
      include: {
        items: true,
        patient: true,
        doctor: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    await writeAuditLog(
      {
        organizationId: ctx.orgId,
        userId: ctx.userId,
        action: "UPDATE",
        entity: "Prescription",
        entityId: rx.id,
      },
      tx
    );
    return rx;
  });
}
