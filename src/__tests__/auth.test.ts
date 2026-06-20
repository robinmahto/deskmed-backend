import request from "supertest";
import { app } from "../app";
import { registerOrg } from "../test/helpers";

describe("Auth", () => {
  it("registers an org + admin and returns tokens (no passwordHash)", async () => {
    const res = await request(app).post("/api/auth/register").send({
      clinicName: "Sunrise",
      name: "Asha",
      email: "asha@test.in",
      password: "password123",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("ADMIN");
    expect(res.body.user).not.toHaveProperty("passwordHash");
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");
  });

  it("rejects a duplicate email with 409", async () => {
    await registerOrg("dup");
    const res = await request(app).post("/api/auth/register").send({
      clinicName: "X",
      name: "Y",
      email: "admin+dup@test.in",
      password: "password123",
    });
    expect(res.status).toBe(409);
  });

  it("logs in with valid credentials and rejects a wrong password", async () => {
    await registerOrg("login");
    const ok = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin+login@test.in", password: "password123" });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeDefined();

    const bad = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin+login@test.in", password: "wrongpass" });
    expect(bad.status).toBe(401);
  });

  it("refreshes an access token and rejects an invalid refresh token", async () => {
    const { refreshToken } = await registerOrg("refresh");
    const ok = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(ok.status).toBe(200);
    expect(typeof ok.body.accessToken).toBe("string");

    const bad = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "not-a-real-token" });
    expect(bad.status).toBe(401);
  });

  it("invalidates the refresh token on logout", async () => {
    const { refreshToken } = await registerOrg("logout");
    const out = await request(app).post("/api/auth/logout").send({ refreshToken });
    expect(out.status).toBe(204);

    const after = await request(app).post("/api/auth/refresh").send({ refreshToken });
    expect(after.status).toBe(401);
  });

  it("rejects a malformed register body with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "short" });
    expect(res.status).toBe(400);
  });
});
