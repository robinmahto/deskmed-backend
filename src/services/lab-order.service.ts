import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";

interface Ctx {
  orgId: string;
  userId: string;
}

interface TestInput {
  name: string;
}

interface CreateInput {
  patientId: string;
  doctorId: string;
  appointmentId?: string;
  notes?: string;
  tests: TestInput[];
}

interface ResultInput {
  testId: string;
  resultValue: string;
  unit?: string;
  referenceRange?: string;
  flag?: "NORMAL" | "ABNORMAL" | "HIGH" | "LOW";
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

export function listLabOrders(orgId: string, filters: { patientId?: string; status?: string }) {
  return prisma.labOrder.findMany({
    where: {
      organizationId: orgId,
      ...(filters.patientId ? { patientId: filters.patientId } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      tests: true,
      patient: true,
      doctor: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

export async function getLabOrder(orgId: string, id: string) {
  const order = await prisma.labOrder.findFirst({
    where: { id, organizationId: orgId },
    include: {
      tests: true,
      patient: true,
      doctor: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  if (!order) throw new AppError(404, "Lab order not found");
  return order;
}

export async function createLabOrder(ctx: Ctx, data: CreateInput) {
  await assertPatientAndDoctor(ctx.orgId, data.patientId, data.doctorId);
  if (data.appointmentId) await assertAppointment(ctx.orgId, data.appointmentId);

  return prisma.$transaction(async (tx) => {
    const order = await tx.labOrder.create({
      data: {
        organizationId: ctx.orgId,
        patientId: data.patientId,
        doctorId: data.doctorId,
        appointmentId: data.appointmentId ?? null,
        notes: data.notes ?? null,
        tests: { create: data.tests.map((t) => ({ name: t.name })) },
      },
      include: {
        tests: true,
        patient: true,
        doctor: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    await writeAuditLog(
      { organizationId: ctx.orgId, userId: ctx.userId, action: "CREATE", entity: "LabOrder", entityId: order.id },
      tx
    );
    return order;
  });
}

export async function enterResults(ctx: Ctx, id: string, results: ResultInput[]) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.labOrder.findFirst({
      where: { id, organizationId: ctx.orgId },
      include: { tests: true },
    });
    if (!order) throw new AppError(404, "Lab order not found");
    if (order.status === "CANCELLED") throw new AppError(400, "Lab order is cancelled");

    const testIds = new Set(order.tests.map((t) => t.id));
    for (const r of results) {
      if (!testIds.has(r.testId)) throw new AppError(404, "Test not found on this order");
    }
    for (const r of results) {
      await tx.labTest.update({
        where: { id: r.testId },
        data: {
          resultValue: r.resultValue,
          unit: r.unit ?? null,
          referenceRange: r.referenceRange ?? null,
          flag: (r.flag ?? null) as never,
        },
      });
    }

    const updated = await tx.labOrder.update({
      where: { id },
      data: { status: "COMPLETED" as never },
      include: {
        tests: true,
        patient: true,
        doctor: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    await writeAuditLog(
      { organizationId: ctx.orgId, userId: ctx.userId, action: "RESULTS", entity: "LabOrder", entityId: id },
      tx
    );
    return updated;
  });
}

export async function cancelLabOrder(ctx: Ctx, id: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.labOrder.findFirst({
      where: { id, organizationId: ctx.orgId },
    });
    if (!order) throw new AppError(404, "Lab order not found");
    if (order.status === "COMPLETED") throw new AppError(400, "Cannot cancel a completed lab order");
    if (order.status === "CANCELLED") throw new AppError(400, "Lab order is already cancelled");

    const updated = await tx.labOrder.update({
      where: { id },
      data: { status: "CANCELLED" as never },
      include: {
        tests: true,
        patient: true,
        doctor: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    await writeAuditLog(
      { organizationId: ctx.orgId, userId: ctx.userId, action: "CANCEL", entity: "LabOrder", entityId: id },
      tx
    );
    return updated;
  });
}
