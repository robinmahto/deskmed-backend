import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { registerOrg, createStaff, tokenFor, auth } from "../test/helpers";

describe("Patients", () => {
  it("creates and lists patients for the caller's org", async () => {
    const { accessToken } = await registerOrg("p1");
    const create = await request(app)
      .post("/api/patients")
      .set(auth(accessToken))
      .send({ name: "Anita", phone: "123" });
    expect(create.status).toBe(201);
    expect(create.body.name).toBe("Anita");

    const list = await request(app).get("/api/patients").set(auth(accessToken));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it("never returns or mutates another org's patient (org-scoping)", async () => {
    const orgA = await registerOrg("A");
    const orgB = await registerOrg("B");

    const created = await request(app)
      .post("/api/patients")
      .set(auth(orgA.accessToken))
      .send({ name: "A-Patient", phone: "1" });
    const pid = created.body.id;

    const bList = await request(app).get("/api/patients").set(auth(orgB.accessToken));
    expect(bList.body).toHaveLength(0);

    const bGet = await request(app).get(`/api/patients/${pid}`).set(auth(orgB.accessToken));
    expect(bGet.status).toBe(404);

    const bPut = await request(app)
      .put(`/api/patients/${pid}`)
      .set(auth(orgB.accessToken))
      .send({ name: "hacked" });
    expect(bPut.status).toBe(404);
  });

  it("enforces RBAC: receptionist can create, doctor cannot; lab tech cannot list", async () => {
    const { accessToken } = await registerOrg("rbac");
    await createStaff(accessToken, "RECEPTIONIST", "rbac");
    await createStaff(accessToken, "DOCTOR", "rbac");
    await createStaff(accessToken, "LAB_TECHNICIAN", "rbac");

    const recToken = await tokenFor("receptionist+rbac@test.in");
    const docToken = await tokenFor("doctor+rbac@test.in");
    const labToken = await tokenFor("lab_technician+rbac@test.in");

    const recCreate = await request(app)
      .post("/api/patients")
      .set(auth(recToken))
      .send({ name: "R", phone: "1" });
    expect(recCreate.status).toBe(201);

    const docCreate = await request(app)
      .post("/api/patients")
      .set(auth(docToken))
      .send({ name: "D", phone: "1" });
    expect(docCreate.status).toBe(403);

    const labList = await request(app).get("/api/patients").set(auth(labToken));
    expect(labList.status).toBe(403);
  });

  it("writes an AuditLog row on patient create", async () => {
    const { accessToken, user } = await registerOrg("audit");
    const create = await request(app)
      .post("/api/patients")
      .set(auth(accessToken))
      .send({ name: "Aud", phone: "1" });

    const logs = await prisma.auditLog.findMany({
      where: { organizationId: user.organizationId, entity: "Patient" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("CREATE");
    expect(logs[0].entityId).toBe(create.body.id);
  });

  it("rejects a patient with a missing name (400)", async () => {
    const { accessToken } = await registerOrg("val");
    const res = await request(app)
      .post("/api/patients")
      .set(auth(accessToken))
      .send({ phone: "1" });
    expect(res.status).toBe(400);
  });
});
