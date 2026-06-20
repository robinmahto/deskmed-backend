import { Router } from "express";
import { authenticateJWT } from "../middleware/authenticateJWT";
import { checkRole } from "../middleware/checkRole";
import {
  appointmentCreateSchema,
  appointmentUpdateSchema,
} from "../lib/validators";
import * as appointmentService from "../services/appointment.service";

export const appointmentsRouter = Router();

appointmentsRouter.use(authenticateJWT);

appointmentsRouter.get(
  "/",
  checkRole("ADMIN", "DOCTOR", "RECEPTIONIST"),
  async (req, res) => {
    const appointments = await appointmentService.listAppointments(req.user!.orgId);
    res.json(appointments);
  }
);

appointmentsRouter.post(
  "/",
  checkRole("ADMIN", "RECEPTIONIST"),
  async (req, res) => {
    const data = appointmentCreateSchema.parse(req.body);
    const appointment = await appointmentService.createAppointment(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      data
    );
    res.status(201).json(appointment);
  }
);

appointmentsRouter.get(
  "/:id",
  checkRole("ADMIN", "DOCTOR", "RECEPTIONIST"),
  async (req, res) => {
    const appointment = await appointmentService.getAppointment(
      req.user!.orgId,
      req.params.id as string
    );
    res.json(appointment);
  }
);

appointmentsRouter.put(
  "/:id",
  checkRole("ADMIN", "RECEPTIONIST"),
  async (req, res) => {
    const data = appointmentUpdateSchema.parse(req.body);
    const appointment = await appointmentService.updateAppointment(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      req.params.id as string,
      data
    );
    res.json(appointment);
  }
);
