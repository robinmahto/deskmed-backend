import { Router } from "express";
import { authenticateJWT } from "../middleware/authenticateJWT";
import { checkRole } from "../middleware/checkRole";
import * as userService from "../services/user.service";

export const doctorsRouter = Router();

doctorsRouter.use(authenticateJWT);

doctorsRouter.get("/", checkRole("ADMIN", "DOCTOR", "RECEPTIONIST"), async (req, res) => {
  const doctors = await userService.listDoctors(req.user!.orgId);
  res.json(doctors);
});
