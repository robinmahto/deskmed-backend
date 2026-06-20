import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { writeAuditLog } from "../lib/audit";

interface Ctx {
  orgId: string;
  userId: string;
}

interface ItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

interface CreateInput {
  patientId: string;
  appointmentId?: string;
  notes?: string;
  items: ItemInput[];
}

interface PaymentInput {
  amount: number;
  method: "CASH" | "CARD" | "UPI" | "BANK_TRANSFER" | "OTHER";
  reference?: string;
  paidAt?: string;
}

// Adds the computed amountPaid + balance (from the included payments) to a read response.
function withTotals<T extends { total: number; payments: { amount: number }[] }>(invoice: T) {
  const amountPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
  return { ...invoice, amountPaid, balance: invoice.total - amountPaid };
}

function computeStatus(total: number, amountPaid: number): "UNPAID" | "PARTIAL" | "PAID" {
  if (amountPaid >= total) return "PAID";
  if (amountPaid > 0) return "PARTIAL";
  return "UNPAID";
}

async function assertPatient(orgId: string, patientId: string) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId },
  });
  if (!patient) throw new AppError(404, "Patient not found");
}

async function assertAppointment(orgId: string, appointmentId: string) {
  const appt = await prisma.appointment.findFirst({
    where: { id: appointmentId, organizationId: orgId },
  });
  if (!appt) throw new AppError(404, "Appointment not found");
}

export async function listInvoices(orgId: string, filters: { patientId?: string; status?: string }) {
  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: orgId,
      ...(filters.patientId ? { patientId: filters.patientId } : {}),
      ...(filters.status ? { status: filters.status as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { items: true, payments: true, patient: true },
  });
  return invoices.map(withTotals);
}

export async function getInvoice(orgId: string, id: string) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, organizationId: orgId },
    include: { items: true, payments: true, patient: true },
  });
  if (!invoice) throw new AppError(404, "Invoice not found");
  return withTotals(invoice);
}

export async function createInvoice(ctx: Ctx, data: CreateInput) {
  await assertPatient(ctx.orgId, data.patientId);
  if (data.appointmentId) await assertAppointment(ctx.orgId, data.appointmentId);

  const items = data.items.map((i) => ({
    description: i.description,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    amount: i.quantity * i.unitPrice,
  }));
  const total = items.reduce((sum, i) => sum + i.amount, 0);

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        organizationId: ctx.orgId,
        patientId: data.patientId,
        appointmentId: data.appointmentId ?? null,
        notes: data.notes ?? null,
        total,
        items: { create: items },
      },
      include: { items: true, payments: true, patient: true },
    });
    await writeAuditLog(
      { organizationId: ctx.orgId, userId: ctx.userId, action: "CREATE", entity: "Invoice", entityId: invoice.id },
      tx
    );
    return withTotals(invoice);
  });
}

export async function recordPayment(ctx: Ctx, id: string, data: PaymentInput) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, organizationId: ctx.orgId },
      include: { payments: true },
    });
    if (!invoice) throw new AppError(404, "Invoice not found");
    if (invoice.status === "CANCELLED") throw new AppError(400, "Invoice is cancelled");

    await tx.payment.create({
      data: {
        invoiceId: id,
        amount: data.amount,
        method: data.method as never,
        reference: data.reference ?? null,
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
      },
    });

    const amountPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0) + data.amount;
    const status = computeStatus(invoice.total, amountPaid);

    const updated = await tx.invoice.update({
      where: { id },
      data: { status: status as never },
      include: { items: true, payments: true, patient: true },
    });
    await writeAuditLog(
      { organizationId: ctx.orgId, userId: ctx.userId, action: "PAYMENT", entity: "Invoice", entityId: id },
      tx
    );
    return withTotals(updated);
  });
}

export async function cancelInvoice(ctx: Ctx, id: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id, organizationId: ctx.orgId },
    });
    if (!invoice) throw new AppError(404, "Invoice not found");

    const updated = await tx.invoice.update({
      where: { id },
      data: { status: "CANCELLED" as never },
      include: { items: true, payments: true, patient: true },
    });
    await writeAuditLog(
      { organizationId: ctx.orgId, userId: ctx.userId, action: "CANCEL", entity: "Invoice", entityId: id },
      tx
    );
    return withTotals(updated);
  });
}
