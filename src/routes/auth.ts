import { Router } from "express";
import { registerSchema, loginSchema, refreshSchema } from "../lib/validators";
import * as authService from "../services/auth.service";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const input = registerSchema.parse(req.body);
  const result = await authService.register(input);
  res.status(201).json(result);
});

authRouter.post("/login", async (req, res) => {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.json(result);
});

authRouter.post("/refresh", async (req, res) => {
  const input = refreshSchema.parse(req.body);
  const result = await authService.refresh(input);
  res.json(result);
});

authRouter.post("/logout", async (req, res) => {
  const input = refreshSchema.parse(req.body);
  await authService.logout(input);
  res.status(204).send();
});
