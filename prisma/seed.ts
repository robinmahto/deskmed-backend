import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/bcrypt";

const DEMO_ORG_SLUG = "deskmed-demo";
const PASSWORD = "password123";

const USERS = [
  { name: "Asha Admin", email: "admin@deskmed.in", role: "ADMIN" },
  { name: "Dr. Dev Rao", email: "doctor@deskmed.in", role: "DOCTOR" },
  { name: "Riya Reception", email: "reception@deskmed.in", role: "RECEPTIONIST" },
  { name: "Lina Lab", email: "lab@deskmed.in", role: "LAB_TECHNICIAN" },
];

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: DEMO_ORG_SLUG },
    update: {},
    create: { name: "DeskMed Demo Clinic", slug: DEMO_ORG_SLUG },
  });
  const passwordHash = await hashPassword(PASSWORD);
  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { organizationId: org.id, name: u.name, email: u.email, passwordHash, role: u.role as never },
    });
  }
  const doctor = await prisma.user.findUniqueOrThrow({ where: { email: "doctor@deskmed.in" } });

  const PATIENTS = [
    { id: "demo_p_001", name: "Anita Sharma", phone: "+91 98200 11223", email: "anita.sharma@example.in", dob: new Date("1992-04-12"), gender: "FEMALE", bloodGroup: "B+", address: "12 MG Road, Bengaluru" },
    { id: "demo_p_002", name: "Rahul Verma", phone: "+91 98765 44556", email: "rahul.verma@example.in", dob: new Date("1981-09-03"), gender: "MALE", bloodGroup: "O+", address: "44 Park Street, Kolkata" },
    { id: "demo_p_003", name: "Meera Iyer", phone: "+91 91234 77889", email: "meera.iyer@example.in", dob: new Date("1997-01-22"), gender: "FEMALE", bloodGroup: "A+", address: "7 Anna Salai, Chennai" },
    { id: "demo_p_004", name: "Sanjay Gupta", phone: "+91 99887 66554", email: "sanjay.gupta@example.in", dob: new Date("1974-11-30"), gender: "MALE", bloodGroup: "AB+", address: "9 Linking Road, Mumbai" },
    { id: "demo_p_005", name: "Priya Nair", phone: "+91 90000 12345", email: "priya.nair@example.in", dob: new Date("1988-06-15"), gender: "FEMALE", bloodGroup: "O-", address: "21 Marine Drive, Kochi" },
  ];
  for (const p of PATIENTS) {
    await prisma.patient.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id, organizationId: org.id, name: p.name, phone: p.phone, email: p.email,
        dob: p.dob, gender: p.gender, bloodGroup: p.bloodGroup, address: p.address,
      },
    });
  }

  const APPTS = [
    { id: "demo_a_001", patientId: "demo_p_001", slot: new Date("2026-06-02T09:30:00Z"), type: "Consultation", notes: "Fever and cough — prescribed rest and antipyretics.", status: "COMPLETED" },
    { id: "demo_a_002", patientId: "demo_p_001", slot: new Date("2026-03-18T10:00:00Z"), type: "Check-up", notes: "Routine check-up — vitals normal.", status: "COMPLETED" },
    { id: "demo_a_003", patientId: "demo_p_002", slot: new Date("2026-05-28T11:15:00Z"), type: "Follow-up", notes: "Hypertension follow-up — BP 140/90; adjusted medication.", status: "COMPLETED" },
    { id: "demo_a_004", patientId: "demo_p_003", slot: new Date("2025-12-10T14:30:00Z"), type: "Consultation", notes: "Migraine — referred to neurology.", status: "COMPLETED" },
    { id: "demo_a_005", patientId: "demo_p_004", slot: new Date("2026-06-05T09:00:00Z"), type: "Review", notes: "Diabetes review — HbA1c 7.2; diet counselling.", status: "COMPLETED" },
    { id: "demo_a_006", patientId: "demo_p_005", slot: new Date("2026-06-01T16:00:00Z"), type: "Consultation", notes: "Back pain — physiotherapy advised.", status: "COMPLETED" },
  ];
  for (const a of APPTS) {
    await prisma.appointment.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id, organizationId: org.id, patientId: a.patientId, doctorId: doctor.id,
        slot: a.slot, type: a.type, notes: a.notes, status: a.status as never,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded demo org (${org.slug}) with ${USERS.length} users, ${PATIENTS.length} patients, ${APPTS.length} appointments.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
