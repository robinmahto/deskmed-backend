// Role mirrors the Prisma enum; kept as a local union so most modules
// don't import from the generated client.
export type Role = "ADMIN" | "DOCTOR" | "RECEPTIONIST" | "LAB_TECHNICIAN";

// Shape attached to req.user by authenticateJWT (mirrors the JWT payload).
export interface AuthUser {
  userId: string;
  orgId: string;
  role: Role;
}
