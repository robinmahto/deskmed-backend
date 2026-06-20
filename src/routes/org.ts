import { Router } from "express";
import { authenticateJWT } from "../middleware/authenticateJWT";
import { checkRole } from "../middleware/checkRole";
import { orgUpdateSchema } from "../lib/validators";
import * as orgService from "../services/org.service";

export const orgRouter = Router();

orgRouter.use(authenticateJWT);
orgRouter.use(checkRole("ADMIN")); // spec §5

orgRouter.get("/", async (req, res) => {
  const org = await orgService.getOrg(req.user!.orgId);
  res.json(org);
});

orgRouter.put("/", async (req, res) => {
  const data = orgUpdateSchema.parse(req.body);
  const org = await orgService.updateOrg(req.user!.orgId, data);
  res.json(org);
});
