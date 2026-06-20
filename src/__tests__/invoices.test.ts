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

// Two items: 2 x 50000 + 1 x 30000 = 130000 paise.
const ITEMS = [
  { description: "Consultation", quantity: 2, unitPrice: 50000 },
  { description: "Dressing", quantity: 1, unitPrice: 30000 },
];

describe("Invoices", () => {
  it("creates an invoice and computes item amount + total", async () => {
    const { accessToken, user } = await registerOrg("inv");
    const pid = await makePatient(accessToken, "Pat");

    const res = await request(app)
      .post("/api/invoices")
      .set(auth(accessToken))
      .send({ patientId: pid, items: ITEMS });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(130000);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].amount).toBe(100000);
    expect(res.body.status).toBe("UNPAID");
    expect(res.body.amountPaid).toBe(0);
    expect(res.body.balance).toBe(130000);

    const logs = await prisma.auditLog.findMany({
      where: { organizationId: user.organizationId, entity: "Invoice", action: "CREATE" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].entityId).toBe(res.body.id);
  });

  it("records partial then full payment and flips status UNPAID -> PARTIAL -> PAID", async () => {
    const { accessToken } = await registerOrg("invpay");
    const pid = await makePatient(accessToken, "Pat");
    const created = await request(app)
      .post("/api/invoices")
      .set(auth(accessToken))
      .send({ patientId: pid, items: ITEMS });
    const id = created.body.id;

    const partial = await request(app)
      .post(`/api/invoices/${id}/payments`)
      .set(auth(accessToken))
      .send({ amount: 50000, method: "CASH" });
    expect(partial.status).toBe(201);
    expect(partial.body.status).toBe("PARTIAL");
    expect(partial.body.amountPaid).toBe(50000);
    expect(partial.body.balance).toBe(80000);

    const full = await request(app)
      .post(`/api/invoices/${id}/payments`)
      .set(auth(accessToken))
      .send({ amount: 80000, method: "UPI", reference: "TXN123" });
    expect(full.status).toBe(201);
    expect(full.body.status).toBe("PAID");
    expect(full.body.balance).toBe(0);

    const payLogs = await prisma.auditLog.findMany({
      where: { entity: "Invoice", action: "PAYMENT" },
    });
    expect(payLogs.length).toBeGreaterThanOrEqual(2);
  });

  it("cancels an invoice and then rejects payment on it (400)", async () => {
    const { accessToken } = await registerOrg("invcancel");
    const pid = await makePatient(accessToken, "Pat");
    const created = await request(app)
      .post("/api/invoices")
      .set(auth(accessToken))
      .send({ patientId: pid, items: ITEMS });
    const id = created.body.id;

    const cancel = await request(app).post(`/api/invoices/${id}/cancel`).set(auth(accessToken));
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("CANCELLED");

    const pay = await request(app)
      .post(`/api/invoices/${id}/payments`)
      .set(auth(accessToken))
      .send({ amount: 1000, method: "CASH" });
    expect(pay.status).toBe(400);

    const cancelLogs = await prisma.auditLog.findMany({
      where: { entity: "Invoice", action: "CANCEL" },
    });
    expect(cancelLogs.length).toBeGreaterThanOrEqual(1);
  });

  it("never returns or mutates another org's invoice (org-scoping)", async () => {
    const orgA = await registerOrg("invA");
    const orgB = await registerOrg("invB");
    const pidA = await makePatient(orgA.accessToken, "A-Pat");
    const created = await request(app)
      .post("/api/invoices")
      .set(auth(orgA.accessToken))
      .send({ patientId: pidA, items: ITEMS });
    const id = created.body.id;

    const bList = await request(app).get("/api/invoices").set(auth(orgB.accessToken));
    expect(bList.body).toHaveLength(0);

    const bGet = await request(app).get(`/api/invoices/${id}`).set(auth(orgB.accessToken));
    expect(bGet.status).toBe(404);

    const bPay = await request(app)
      .post(`/api/invoices/${id}/payments`)
      .set(auth(orgB.accessToken))
      .send({ amount: 1000, method: "CASH" });
    expect(bPay.status).toBe(404);

    const bCancel = await request(app).post(`/api/invoices/${id}/cancel`).set(auth(orgB.accessToken));
    expect(bCancel.status).toBe(404);
  });

  it("enforces RBAC: receptionist writes; doctor reads but cannot write; lab is blocked", async () => {
    const { accessToken } = await registerOrg("invrbac");
    await createStaff(accessToken, "RECEPTIONIST", "invrbac");
    await createStaff(accessToken, "DOCTOR", "invrbac");
    await createStaff(accessToken, "LAB_TECHNICIAN", "invrbac");
    const pid = await makePatient(accessToken, "Pat");

    const recToken = await tokenFor("receptionist+invrbac@test.in");
    const docToken = await tokenFor("doctor+invrbac@test.in");
    const labToken = await tokenFor("lab_technician+invrbac@test.in");

    const recCreate = await request(app)
      .post("/api/invoices")
      .set(auth(recToken))
      .send({ patientId: pid, items: ITEMS });
    expect(recCreate.status).toBe(201);
    const invId = recCreate.body.id;

    const recPay = await request(app)
      .post(`/api/invoices/${invId}/payments`)
      .set(auth(recToken))
      .send({ amount: 1000, method: "CASH" });
    expect(recPay.status).toBe(201);

    const docList = await request(app).get("/api/invoices").set(auth(docToken));
    expect(docList.status).toBe(200);

    const docCreate = await request(app)
      .post("/api/invoices")
      .set(auth(docToken))
      .send({ patientId: pid, items: ITEMS });
    expect(docCreate.status).toBe(403);

    const docPay = await request(app)
      .post(`/api/invoices/${invId}/payments`)
      .set(auth(docToken))
      .send({ amount: 1000, method: "CASH" });
    expect(docPay.status).toBe(403);

    const labList = await request(app).get("/api/invoices").set(auth(labToken));
    expect(labList.status).toBe(403);
  });

  it("validates: cross-org patient -> 404, empty items -> 400, amount 0 -> 400", async () => {
    const orgA = await registerOrg("invvalA");
    const orgB = await registerOrg("invvalB");
    const pidA = await makePatient(orgA.accessToken, "A-Pat");

    const crossOrg = await request(app)
      .post("/api/invoices")
      .set(auth(orgB.accessToken))
      .send({ patientId: pidA, items: ITEMS });
    expect(crossOrg.status).toBe(404);

    const emptyItems = await request(app)
      .post("/api/invoices")
      .set(auth(orgA.accessToken))
      .send({ patientId: pidA, items: [] });
    expect(emptyItems.status).toBe(400);

    const inv = await request(app)
      .post("/api/invoices")
      .set(auth(orgA.accessToken))
      .send({ patientId: pidA, items: ITEMS });
    const badPay = await request(app)
      .post(`/api/invoices/${inv.body.id}/payments`)
      .set(auth(orgA.accessToken))
      .send({ amount: 0, method: "CASH" });
    expect(badPay.status).toBe(400);
  });

  it("filters the list by status", async () => {
    const { accessToken } = await registerOrg("invfilter");
    const pid = await makePatient(accessToken, "Pat");
    const a = await request(app).post("/api/invoices").set(auth(accessToken)).send({ patientId: pid, items: ITEMS });
    await request(app).post("/api/invoices").set(auth(accessToken)).send({ patientId: pid, items: ITEMS });
    await request(app).post(`/api/invoices/${a.body.id}/cancel`).set(auth(accessToken));

    const cancelled = await request(app).get("/api/invoices?status=CANCELLED").set(auth(accessToken));
    expect(cancelled.body).toHaveLength(1);
    expect(cancelled.body[0].status).toBe("CANCELLED");

    const unpaid = await request(app).get("/api/invoices?status=UNPAID").set(auth(accessToken));
    expect(unpaid.body).toHaveLength(1);
  });
});
