import { z } from "zod";

// --- Auth ---
export const registerSchema = z.object({
  clinicName: z.string().min(1, "Clinic name is required"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

// --- Patients ---
export const patientCreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email().optional(),
  dob: z.string().datetime().optional(), // ISO 8601
  gender: z.string().optional(),
  bloodGroup: z.string().optional(),
  address: z.string().optional(),
});
export const patientUpdateSchema = patientCreateSchema.partial();

// --- Appointments ---
const appointmentStatus = z.enum([
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
]);

export const appointmentCreateSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  slot: z.string().datetime(), // ISO 8601
  type: z.string().optional(),
  notes: z.string().optional(),
});

export const appointmentUpdateSchema = z.object({
  slot: z.string().datetime().optional(),
  status: appointmentStatus.optional(),
  type: z.string().optional(),
  notes: z.string().optional(),
});

// --- Users (admin) ---
const role = z.enum(["ADMIN", "DOCTOR", "RECEPTIONIST", "LAB_TECHNICIAN"]);

export const userCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role,
});

export const userUpdateSchema = z.object({
  role: role.optional(),
  isActive: z.boolean().optional(),
});

// --- Org ---
export const orgUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  plan: z.string().optional(),
});

// --- Prescriptions ---
const prescriptionItemSchema = z.object({
  drugName: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1),
  duration: z.string().min(1),
  instructions: z.string().optional(),
});

export const prescriptionCreateSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(prescriptionItemSchema).min(1, "At least one medication is required"),
});

export const prescriptionUpdateSchema = z.object({
  diagnosis: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(["ACTIVE", "CANCELLED"]).optional(),
  appointmentId: z.string().min(1).optional(),
  items: z.array(prescriptionItemSchema).min(1).optional(),
});

// --- Billing (invoices + payments) ---
const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().int().min(0),
});

export const invoiceCreateSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  notes: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
});

export const paymentCreateSchema = z.object({
  amount: z.number().int().min(1),
  method: z.enum(["CASH", "CARD", "UPI", "BANK_TRANSFER", "OTHER"]),
  reference: z.string().optional(),
  paidAt: z.string().datetime().optional(),
});

// --- Labs (lab orders + results) ---
const labTestSchema = z.object({
  name: z.string().min(1),
});

export const labOrderCreateSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  notes: z.string().optional(),
  tests: z.array(labTestSchema).min(1, "At least one test is required"),
});

const labResultItemSchema = z.object({
  testId: z.string().min(1),
  resultValue: z.string().min(1),
  unit: z.string().optional(),
  referenceRange: z.string().optional(),
  flag: z.enum(["NORMAL", "ABNORMAL", "HIGH", "LOW"]).optional(),
});

export const labResultsSchema = z.object({
  results: z.array(labResultItemSchema).min(1, "At least one result is required"),
});
