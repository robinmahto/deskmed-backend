import { Router } from "express";
import { authenticateJWT } from "../middleware/authenticateJWT";
import { checkRole } from "../middleware/checkRole";
import { userCreateSchema, userUpdateSchema } from "../lib/validators";
import * as userService from "../services/user.service";
import type { Role } from "../types/auth";

export const usersRouter = Router();

usersRouter.use(authenticateJWT);
usersRouter.use(checkRole("ADMIN")); // entire resource is admin-only (spec §5)

usersRouter.get("/", async (req, res) => {
  const users = await userService.listUsers(req.user!.orgId);
  res.json(users);
});

usersRouter.post("/", async (req, res) => {
  const data = userCreateSchema.parse(req.body);
  const user = await userService.createUser(req.user!.orgId, {
    ...data,
    role: data.role as Role,
  });
  res.status(201).json(user);
});

usersRouter.put("/:id", async (req, res) => {
  const data = userUpdateSchema.parse(req.body);
  const user = await userService.updateUser(
    req.user!.orgId,
    req.params.id as string,
    req.user!.userId,
    {
      role: data.role as Role | undefined,
      isActive: data.isActive,
    }
  );
  res.json(user);
});
