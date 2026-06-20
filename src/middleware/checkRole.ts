import type { Request, Response, NextFunction } from "express";
import type { Role } from "../types/auth";
import { AppError } from "../lib/errors";

// Per-route role whitelist. Runs after authenticateJWT (req.user is set).
export function checkRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError(401, "Not authenticated");
    }
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, "You do not have permission to perform this action");
    }
    next();
  };
}
