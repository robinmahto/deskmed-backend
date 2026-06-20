import request from "supertest";
import { app } from "../app";

const PASSWORD = "password123";

export interface AuthResult {
  user: { id: string; organizationId: string; role: string; email: string; name: string };
  accessToken: string;
  refreshToken: string;
}

// Registers a fresh org + admin and returns the admin's session.
export async function registerOrg(suffix: string): Promise<AuthResult> {
  const res = await request(app).post("/api/auth/register").send({
    clinicName: `Clinic ${suffix}`,
    name: `Admin ${suffix}`,
    email: `admin+${suffix}@test.in`,
    password: PASSWORD,
  });
  return res.body as AuthResult;
}

// Admin creates a staff member with the given role; email is `<role lc>+<suffix>@test.in`.
export async function createStaff(adminToken: string, role: string, suffix: string) {
  const res = await request(app)
    .post("/api/users")
    .set(auth(adminToken))
    .send({
      name: `${role} ${suffix}`,
      email: `${role.toLowerCase()}+${suffix}@test.in`,
      password: PASSWORD,
      role,
    });
  return res.body as { id: string; email: string; role: string };
}

export async function tokenFor(email: string): Promise<string> {
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  return res.body.accessToken as string;
}

export function auth(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
