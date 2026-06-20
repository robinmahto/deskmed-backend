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

const ITEMS = [
  { drugName: "Amoxicillin 500mg", dosage: "1 tablet", frequency: "twice daily", duration: "5 days", instructions: "after food" },
  { drugName: "Paracetamol 650mg", dosage: "1 tablet", frequency: "as needed", duration: "3 days" },
];

describe("Prescriptions", () => {
  it("a doctor creates a prescription with items + writes an audit row", async () => {
    const { accessToken, user } = await registerOrg("rx");
    const doctor = await createStaff(accessToken, "DOCTOR", "rx");
    const pid = await makePatient(accessToken, "Pat");
    const docToken = await tokenFor("doctor+rx@test.in");

    const res = await request(app)
      .post("/api/prescriptions")
      .set(auth(docToken))
      .send({ patientId: pid, doctorId: doctor.id, diagnosis: "Flu", items: ITEMS });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.status).toBe("ACTIVE");

    const logs = await prisma.auditLog.findMany({
      where: { organizationId: user.organizationId, entity: "Prescription" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("CREATE");
    expect(logs[0].entityId).toBe(res.body.id);
  });

  it("rejects a non-DOCTOR doctorId with 404", async () => {
    const { accessToken, user } = await registerOrg("rxdoc");
    const pid = await makePatient(accessToken, "Pat");
    const res = await request(app)
      .post("/api/prescriptions")
      .set(auth(accessToken))
      .send({ patientId: pid, doctorId: user.id, items: ITEMS });
    expect(res.status).toBe(404);
  });

  it("rejects an empty items array with 400", async () => {
    const { accessToken } = await registerOrg("rxval");
    const doctor = await createStaff(accessToken, "DOCTOR", "rxval");
    const pid = await makePatient(accessToken, "Pat");
    const res = await request(app)
      .post("/api/prescriptions")
      .set(auth(accessToken))
      .send({ patientId: pid, doctorId: doctor.id, items: [] });
    expect(res.status).toBe(400);
  });

  it("enforces RBAC: receptionist reads but cannot create; lab tech is blocked", async () => {
    const { accessToken } = await registerOrg("rxrbac");
    const doctor = await createStaff(accessToken, "DOCTOR", "rxrbac");
    await createStaff(accessToken, "RECEPTIONIST", "rxrbac");
    await createStaff(accessToken, "LAB_TECHNICIAN", "rxrbac");
    const pid = await makePatient(accessToken, "Pat");
    await request(app)
      .post("/api/prescriptions")
      .set(auth(accessToken))
      .send({ patientId: pid, doctorId: doctor.id, items: ITEMS });

    const recToken = await tokenFor("receptionist+rxrbac@test.in");
    const labToken = await tokenFor("lab_technician+rxrbac@test.in");

    const recList = await request(app).get("/api/prescriptions").set(auth(recToken));
    expect(recList.status).toBe(200);
    expect(recList.body).toHaveLength(1);

    const recCreate = await request(app)
      .post("/api/prescriptions")
      .set(auth(recToken))
      .send({ patientId: pid, doctorId: doctor.id, items: ITEMS });
    expect(recCreate.status).toBe(403);

    const labList = await request(app).get("/api/prescriptions").set(auth(labToken));
    expect(labList.status).toBe(403);
  });

  it("never returns or mutates another org's prescription (org-scoping)", async () => {
    const orgA = await registerOrg("rxA");
    const orgB = await registerOrg("rxB");
    const docA = await createStaff(orgA.accessToken, "DOCTOR", "rxA");
    const pidA = await makePatient(orgA.accessToken, "A-Pat");
    const created = await request(app)
      .post("/api/prescriptions")
      .set(auth(orgA.accessToken))
      .send({ patientId: pidA, doctorId: docA.id, items: ITEMS });
    const rxId = created.body.id;

    const bList = await request(app).get("/api/prescriptions").set(auth(orgB.accessToken));
    expect(bList.body).toHaveLength(0);

    const bGet = await request(app).get(`/api/prescriptions/${rxId}`).set(auth(orgB.accessToken));
    expect(bGet.status).toBe(404);

    const bPut = await request(app)
      .put(`/api/prescriptions/${rxId}`)
      .set(auth(orgB.accessToken))
      .send({ status: "CANCELLED" });
    expect(bPut.status).toBe(404);
  });

  it("updates: replaces items and cancels via PUT", async () => {
    const { accessToken } = await registerOrg("rxupd");
    const doctor = await createStaff(accessToken, "DOCTOR", "rxupd");
    const pid = await makePatient(accessToken, "Pat");
    const created = await request(app)
      .post("/api/prescriptions")
      .set(auth(accessToken))
      .send({ patientId: pid, doctorId: doctor.id, items: ITEMS });
    const rxId = created.body.id;

    const put = await request(app)
      .put(`/api/prescriptions/${rxId}`)
      .set(auth(accessToken))
      .send({ status: "CANCELLED", items: [ITEMS[0]] });
    expect(put.status).toBe(200);

    const get = await request(app).get(`/api/prescriptions/${rxId}`).set(auth(accessToken));
    expect(get.body.status).toBe("CANCELLED");
    expect(get.body.items).toHaveLength(1);

    const logs = await prisma.auditLog.findMany({
      where: { entity: "Prescription", action: "UPDATE" },
    });
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });

  it("does not leak the doctor's passwordHash", async () => {
    const { accessToken } = await registerOrg("rxleak");
    const doctor = await createStaff(accessToken, "DOCTOR", "rxleak");
    const pid = await makePatient(accessToken, "Pat");
    await request(app)
      .post("/api/prescriptions")
      .set(auth(accessToken))
      .send({ patientId: pid, doctorId: doctor.id, items: ITEMS });
    const list = await request(app).get("/api/prescriptions").set(auth(accessToken));
    expect(JSON.stringify(list.body)).not.toContain("passwordHash");
  });
});
