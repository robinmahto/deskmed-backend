import request from "supertest";
import { app } from "../app";
import { registerOrg, createStaff, tokenFor, auth } from "../test/helpers";

describe("Users (admin only)", () => {
  it("lets an admin create + list staff without leaking passwordHash", async () => {
    const { accessToken } = await registerOrg("u");
    const created = await request(app)
      .post("/api/users")
      .set(auth(accessToken))
      .send({ name: "Dev", email: "dev+u@test.in", password: "password123", role: "DOCTOR" });
    expect(created.status).toBe(201);
    expect(created.body).not.toHaveProperty("passwordHash");

    const list = await request(app).get("/api/users").set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2); // admin + doctor
    expect(JSON.stringify(list.body)).not.toContain("passwordHash");
  });

  it("forbids a non-admin from the users resource (403)", async () => {
    const { accessToken } = await registerOrg("u2");
    await createStaff(accessToken, "DOCTOR", "u2");
    const docToken = await tokenFor("doctor+u2@test.in");

    const res = await request(app).get("/api/users").set(auth(docToken));
    expect(res.status).toBe(403);
  });

  it("lets an admin change another user's role and active status", async () => {
    const { accessToken } = await registerOrg("uupd");
    const staff = await createStaff(accessToken, "RECEPTIONIST", "uupd");

    const promote = await request(app)
      .put(`/api/users/${staff.id}`)
      .set(auth(accessToken))
      .send({ role: "DOCTOR" });
    expect(promote.status).toBe(200);
    expect(promote.body.role).toBe("DOCTOR");
    expect(promote.body).not.toHaveProperty("passwordHash");

    const deactivate = await request(app)
      .put(`/api/users/${staff.id}`)
      .set(auth(accessToken))
      .send({ isActive: false });
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.isActive).toBe(false);
  });

  // Note: because this route is ADMIN-only and the acting user is always an active admin,
  // the sole-admin case is necessarily a self-action — so the self-guard fires here.
  // The last-admin guard in the service is defense-in-depth that cannot be triggered independently through this route.
  it("blocks an admin from demoting or deactivating their own account", async () => {
    const { accessToken, user } = await registerOrg("uself");

    const demote = await request(app)
      .put(`/api/users/${user.id}`)
      .set(auth(accessToken))
      .send({ role: "DOCTOR" });
    expect(demote.status).toBe(400);
    expect(demote.body.error).toMatch(/own/i);

    const deactivate = await request(app)
      .put(`/api/users/${user.id}`)
      .set(auth(accessToken))
      .send({ isActive: false });
    expect(deactivate.status).toBe(400);
    expect(deactivate.body.error).toMatch(/own/i);
  });

  it("lets an admin deactivate another admin when one active admin remains", async () => {
    const { accessToken } = await registerOrg("u2adm");
    const otherAdmin = await createStaff(accessToken, "ADMIN", "u2adm2");

    const res = await request(app)
      .put(`/api/users/${otherAdmin.id}`)
      .set(auth(accessToken))
      .send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it("does not let an admin update a user in another org (404)", async () => {
    const a = await registerOrg("uxa");
    const aStaff = await createStaff(a.accessToken, "DOCTOR", "uxa");
    const b = await registerOrg("uxb");

    const res = await request(app)
      .put(`/api/users/${aStaff.id}`)
      .set(auth(b.accessToken))
      .send({ role: "RECEPTIONIST" });
    expect(res.status).toBe(404);
  });
});

describe("Org (admin only)", () => {
  it("returns and updates the caller's org for an admin", async () => {
    const { accessToken } = await registerOrg("o");
    const get = await request(app).get("/api/org").set(auth(accessToken));
    expect(get.status).toBe(200);
    expect(get.body.plan).toBe("free");

    const put = await request(app)
      .put("/api/org")
      .set(auth(accessToken))
      .send({ plan: "growth" });
    expect(put.status).toBe(200);
    expect(put.body.plan).toBe("growth");
  });

  it("forbids a non-admin from org settings (403)", async () => {
    const { accessToken } = await registerOrg("o2");
    await createStaff(accessToken, "RECEPTIONIST", "o2");
    const recToken = await tokenFor("receptionist+o2@test.in");

    const res = await request(app).get("/api/org").set(auth(recToken));
    expect(res.status).toBe(403);
  });
});
