import { Router } from "express";
import { authenticateJWT } from "../middleware/authenticateJWT";
import { checkRole } from "../middleware/checkRole";
import {
  prescriptionCreateSchema,
  prescriptionUpdateSchema,
} from "../lib/validators";
import * as prescriptionService from "../services/prescription.service";

export const prescriptionsRouter = Router();

prescriptionsRouter.use(authenticateJWT);

prescriptionsRouter.get(
  "/",
  checkRole("ADMIN", "DOCTOR", "RECEPTIONIST"),
  async (req, res) => {
    const patientId =
      typeof req.query.patientId === "string" ? req.query.patientId : undefined;
    const list = await prescriptionService.listPrescriptions(req.user!.orgId, patientId);
    res.json(list);
  }
);

prescriptionsRouter.post(
  "/",
  checkRole("ADMIN", "DOCTOR"),
  async (req, res) => {
    const data = prescriptionCreateSchema.parse(req.body);
    const rx = await prescriptionService.createPrescription(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      data
    );
    res.status(201).json(rx);
  }
);

prescriptionsRouter.get(
  "/:id",
  checkRole("ADMIN", "DOCTOR", "RECEPTIONIST"),
  async (req, res) => {
    const rx = await prescriptionService.getPrescription(
      req.user!.orgId,
      req.params.id as string
    );
    res.json(rx);
  }
);

prescriptionsRouter.put(
  "/:id",
  checkRole("ADMIN", "DOCTOR"),
  async (req, res) => {
    const data = prescriptionUpdateSchema.parse(req.body);
    const rx = await prescriptionService.updatePrescription(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      req.params.id as string,
      data
    );
    res.json(rx);
  }
);
