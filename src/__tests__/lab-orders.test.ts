import request from "supertest";
import { app } from "../app";
import { prisma } from "../lib/prisma";
import { registerOrg, createStaff, tokenFor, auth } from "../test/helpers";

async function makePatient(token: string, name: string): Promise<string> {
  const res = await request(app)
    .post("/api/patients")
    .set(auth(token))
    .send({ name, phone: "1" });
  return res.body.id as string;
}

const TESTS = [{ name: "CBC" }, { name: "Lipid Profile" }];

async function setup(suffix: string) {
  const { accessToken, user } = await registerOrg(suffix);
  const doctor = await createStaff(accessToken, "DOCTOR", suffix);
  await createStaff(accessToken, "LAB_TECHNICIAN", suffix);
  const pid = await makePatient(accessToken, "Pat");
  const docToken = await tokenFor(`doctor+${suffix}@test.in`);
  const labToken = await tokenFor(`lab_technician+${suffix}@test.in`);
  return { adminToken: accessToken, orgId: user.organizationId, doctorId: doctor.id, pid, docToken, labToken };
}

describe("Lab orders", () => {
  it("a doctor creates an order with tests + writes an audit row", async () => {
    const s = await setup("lab");
    const res = await request(app)
      .post("/api/lab-orders")
      .set(auth(s.docToken))
      .send({ patientId: s.pid, doctorId: s.doctorId, tests: TESTS });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("ORDERED");
    expect(res.body.tests).toHaveLength(2);
    expect(res.body.tests[0].resultValue).toBeNull();

    const logs = await prisma.auditLog.findMany({
      where: { organizationId: s.orgId, entity: "LabOrder", action: "CREATE" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe(res.body.id);
  });

  it("a lab tech enters results which completes the order", async () => {
    const s = await setup("labres");
    const created = await request(app)
      .post("/api/lab-orders")
      .set(auth(s.docToken))
      .send({ patientId: s.pid, doctorId: s.doctorId, tests: TESTS });
    const id = created.body.id;
    const testIds = created.body.tests.map((t: { id: string }) => t.id);

    const res = await request(app)
      .put(`/api/lab-orders/${id}/results`)
      .set(auth(s.labToken))
      .send({
        results: [
          { testId: testIds[0], resultValue: "13.5", unit: "g/dL", flag: "NORMAL" },
          { testId: testIds[1], resultValue: "220", unit: "mg/dL", flag: "HIGH" },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMPLETED");
    const byId = Object.fromEntries(res.body.tests.map((t: { id: string; resultValue: string }) => [t.id, t]));
    expect(byId[testIds[0]].resultValue).toBe("13.5");
    expect(byId[testIds[1]].flag).toBe("HIGH");

    const logs = await prisma.auditLog.findMany({ where: { entity: "LabOrder", action: "RESULTS" } });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("rejects results for a testId not on the order (404)", async () => {
    const s = await setup("labbadtest");
    const created = await request(app)
      .post("/api/lab-orders")
      .set(auth(s.docToken))
      .send({ patientId: s.pid, doctorId: s.doctorId, tests: TESTS });
    const res = await request(app)
      .put(`/api/lab-orders/${created.body.id}/results`)
      .set(auth(s.labToken))
      .send({ results: [{ testId: "not-a-real-test", resultValue: "x" }] });
    expect(res.status).toBe(404);
  });

  it("cancels an order; results on a cancelled order 400; cancel a completed order 400", async () => {
    const s = await setup("labcancel");
    const o1 = await request(app)
      .post("/api/lab-orders")
      .set(auth(s.docToken))
      .send({ patientId: s.pid, doctorId: s.doctorId, tests: TESTS });
    const cancel = await request(app).post(`/api/lab-orders/${o1.body.id}/cancel`).set(auth(s.docToken));
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("CANCELLED");
    const resAfterCancel = await request(app)
      .put(`/api/lab-orders/${o1.body.id}/results`)
      .set(auth(s.labToken))
      .send({ results: [{ testId: o1.body.tests[0].id, resultValue: "x" }] });
    expect(resAfterCancel.status).toBe(400);

    const o2 = await request(app)
      .post("/api/lab-orders")
      .set(auth(s.docToken))
      .send({ patientId: s.pid, doctorId: s.doctorId, tests: TESTS });
    await request(app)
      .put(`/api/lab-orders/${o2.body.id}/results`)
      .set(auth(s.labToken))
      .send({ results: [{ testId: o2.body.tests[0].id, resultValue: "ok" }] });
    const cancelCompleted = await request(app).post(`/api/lab-orders/${o2.body.id}/cancel`).set(auth(s.docToken));
    expect(cancelCompleted.status).toBe(400);

    const cancelLogs = await prisma.auditLog.findMany({ where: { entity: "LabOrder", action: "CANCEL" } });
    expect(cancelLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("never returns or mutates another org's lab order (org-scoping)", async () => {
    const a = await setup("labA");
    const orgB = await registerOrg("labB");
    const created = await request(app)
      .post("/api/lab-orders")
      .set(auth(a.docToken))
      .send({ patientId: a.pid, doctorId: a.doctorId, tests: TESTS });
    const id = created.body.id;

    const bList = await request(app).get("/api/lab-orders").set(auth(orgB.accessToken));
    expect(bList.body).toHaveLength(0);

    const bGet = await request(app).get(`/api/lab-orders/${id}`).set(auth(orgB.accessToken));
    expect(bGet.status).toBe(404);

    const bResults = await request(app)
      .put(`/api/lab-orders/${id}/results`)
      .set(auth(orgB.accessToken))
      .send({ results: [{ testId: created.body.tests[0].id, resultValue: "x" }] });
    expect(bResults.status).toBe(404);

    const bCancel = await request(app).post(`/api/lab-orders/${id}/cancel`).set(auth(orgB.accessToken));
    expect(bCancel.status).toBe(404);
  });

  it("enforces RBAC: doctor orders not results; lab tech results not orders; reception blocked", async () => {
    const s = await setup("labrbac");
    await createStaff(s.adminToken, "RECEPTIONIST", "labrbac");
    const recToken = await tokenFor("receptionist+labrbac@test.in");

    const created = await request(app)
      .post("/api/lab-orders")
      .set(auth(s.docToken))
      .send({ patientId: s.pid, doctorId: s.doctorId, tests: TESTS });
    expect(created.status).toBe(201);
    const testId = created.body.tests[0].id;
    const id = created.body.id;

    const docResults = await request(app)
      .put(`/api/lab-orders/${id}/results`)
      .set(auth(s.docToken))
      .send({ results: [{ testId, resultValue: "x" }] });
    expect(docResults.status).toBe(403);

    const labResults = await request(app)
      .put(`/api/lab-orders/${id}/results`)
      .set(auth(s.labToken))
      .send({ results: [{ testId, resultValue: "x" }] });
    expect(labResults.status).toBe(200);

    const labCreate = await request(app)
      .post("/api/lab-orders")
      .set(auth(s.labToken))
      .send({ patientId: s.pid, doctorId: s.doctorId, tests: TESTS });
    expect(labCreate.status).toBe(403);

    const recList = await request(app).get("/api/lab-orders").set(auth(recToken));
    expect(recList.status).toBe(403);
  });

  it("validates: non-DOCTOR doctorId -> 404, cross-org patient -> 404, empty tests -> 400, empty results -> 400", async () => {
    const s = await setup("labval");
    const orgB = await registerOrg("labvalB");

    const nonDoctor = await request(app)
      .post("/api/lab-orders")
      .set(auth(s.adminToken))
      .send({ patientId: s.pid, doctorId: (await prisma.user.findFirst({ where: { email: "admin+labval@test.in" } }))!.id, tests: TESTS });
    expect(nonDoctor.status).toBe(404);

    const docB = await createStaff(orgB.accessToken, "DOCTOR", "labvalB");
    const crossOrg = await request(app)
      .post("/api/lab-orders")
      .set(auth(orgB.accessToken))
      .send({ patientId: s.pid, doctorId: docB.id, tests: TESTS });
    expect(crossOrg.status).toBe(404);

    const emptyTests = await request(app)
      .post("/api/lab-orders")
      .set(auth(s.docToken))
      .send({ patientId: s.pid, doctorId: s.doctorId, tests: [] });
    expect(emptyTests.status).toBe(400);

    const created = await request(app)
      .post("/api/lab-orders")
      .set(auth(s.docToken))
      .send({ patientId: s.pid, doctorId: s.doctorId, tests: TESTS });
    const emptyResults = await request(app)
      .put(`/api/lab-orders/${created.body.id}/results`)
      .set(auth(s.labToken))
      .send({ results: [] });
    expect(emptyResults.status).toBe(400);
  });

  it("does not leak the doctor's passwordHash", async () => {
    const s = await setup("lableak");
    await request(app)
      .post("/api/lab-orders")
      .set(auth(s.docToken))
      .send({ patientId: s.pid, doctorId: s.doctorId, tests: TESTS });
    const list = await request(app).get("/api/lab-orders").set(auth(s.docToken));
    expect(JSON.stringify(list.body)).not.toContain("passwordHash");
  });
});
