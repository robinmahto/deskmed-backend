import { Router } from "express";
import { authenticateJWT } from "../middleware/authenticateJWT";
import { checkRole } from "../middleware/checkRole";
import { labOrderCreateSchema, labResultsSchema } from "../lib/validators";
import * as labOrderService from "../services/lab-order.service";

const STATUS_VALUES = ["ORDERED", "COMPLETED", "CANCELLED"];

export const labOrdersRouter = Router();

labOrdersRouter.use(authenticateJWT);

labOrdersRouter.get(
  "/",
  checkRole("ADMIN", "DOCTOR", "LAB_TECHNICIAN"),
  async (req, res) => {
    const patientId =
      typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const status =
      typeof req.query.status === "string" && STATUS_VALUES.includes(req.query.status)
        ? req.query.status
        : undefined;
    const list = await labOrderService.listLabOrders(req.user!.orgId, { patientId, status });
    res.json(list);
  }
);

labOrdersRouter.post(
  "/",
  checkRole("ADMIN", "DOCTOR"),
  async (req, res) => {
    const data = labOrderCreateSchema.parse(req.body);
    const order = await labOrderService.createLabOrder(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      data
    );
    res.status(201).json(order);
  }
);

labOrdersRouter.get(
  "/:id",
  checkRole("ADMIN", "DOCTOR", "LAB_TECHNICIAN"),
  async (req, res) => {
    const order = await labOrderService.getLabOrder(req.user!.orgId, req.params.id as string);
    res.json(order);
  }
);

labOrdersRouter.put(
  "/:id/results",
  checkRole("ADMIN", "LAB_TECHNICIAN"),
  async (req, res) => {
    const data = labResultsSchema.parse(req.body);
    const order = await labOrderService.enterResults(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      req.params.id as string,
      data.results
    );
    res.json(order);
  }
);

labOrdersRouter.post(
  "/:id/cancel",
  checkRole("ADMIN", "DOCTOR"),
  async (req, res) => {
    const order = await labOrderService.cancelLabOrder(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      req.params.id as string
    );
    res.json(order);
  }
);
