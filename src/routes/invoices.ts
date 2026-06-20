import { Router } from "express";
import { authenticateJWT } from "../middleware/authenticateJWT";
import { checkRole } from "../middleware/checkRole";
import { invoiceCreateSchema, paymentCreateSchema } from "../lib/validators";
import * as invoiceService from "../services/invoice.service";

const STATUS_VALUES = ["UNPAID", "PARTIAL", "PAID", "CANCELLED"];

export const invoicesRouter = Router();

invoicesRouter.use(authenticateJWT);

invoicesRouter.get(
  "/",
  checkRole("ADMIN", "DOCTOR", "RECEPTIONIST"),
  async (req, res) => {
    const patientId =
      typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const status =
      typeof req.query.status === "string" && STATUS_VALUES.includes(req.query.status)
        ? req.query.status
        : undefined;
    const list = await invoiceService.listInvoices(req.user!.orgId, { patientId, status });
    res.json(list);
  }
);

invoicesRouter.post(
  "/",
  checkRole("ADMIN", "RECEPTIONIST"),
  async (req, res) => {
    const data = invoiceCreateSchema.parse(req.body);
    const invoice = await invoiceService.createInvoice(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      data
    );
    res.status(201).json(invoice);
  }
);

invoicesRouter.get(
  "/:id",
  checkRole("ADMIN", "DOCTOR", "RECEPTIONIST"),
  async (req, res) => {
    const invoice = await invoiceService.getInvoice(req.user!.orgId, req.params.id as string);
    res.json(invoice);
  }
);

invoicesRouter.post(
  "/:id/payments",
  checkRole("ADMIN", "RECEPTIONIST"),
  async (req, res) => {
    const data = paymentCreateSchema.parse(req.body);
    const invoice = await invoiceService.recordPayment(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      req.params.id as string,
      data
    );
    res.status(201).json(invoice);
  }
);

invoicesRouter.post(
  "/:id/cancel",
  checkRole("ADMIN", "RECEPTIONIST"),
  async (req, res) => {
    const invoice = await invoiceService.cancelInvoice(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      req.params.id as string
    );
    res.json(invoice);
  }
);
