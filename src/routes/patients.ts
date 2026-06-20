import { Router } from "express";
import { authenticateJWT } from "../middleware/authenticateJWT";
import { checkRole } from "../middleware/checkRole";
import { patientCreateSchema, patientUpdateSchema } from "../lib/validators";
import * as patientService from "../services/patient.service";

export const patientsRouter = Router();

patientsRouter.use(authenticateJWT);

patientsRouter.get(
  "/",
  checkRole("ADMIN", "DOCTOR", "RECEPTIONIST"),
  async (req, res) => {
    const patients = await patientService.listPatients(req.user!.orgId);
    res.json(patients);
  }
);

patientsRouter.post(
  "/",
  checkRole("ADMIN", "RECEPTIONIST"),
  async (req, res) => {
    const data = patientCreateSchema.parse(req.body);
    const patient = await patientService.createPatient(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      data
    );
    res.status(201).json(patient);
  }
);

patientsRouter.get(
  "/:id",
  checkRole("ADMIN", "DOCTOR", "RECEPTIONIST"),
  async (req, res) => {
    const patient = await patientService.getPatient(req.user!.orgId, req.params.id as string);
    res.json(patient);
  }
);

patientsRouter.put(
  "/:id",
  checkRole("ADMIN", "RECEPTIONIST"),
  async (req, res) => {
    const data = patientUpdateSchema.parse(req.body);
    const patient = await patientService.updatePatient(
      { orgId: req.user!.orgId, userId: req.user!.userId },
      req.params.id as string,
      data
    );
    res.json(patient);
  }
);
