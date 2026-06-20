-- CreateEnum
CREATE TYPE "LabOrderStatus" AS ENUM ('ORDERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabResultFlag" AS ENUM ('NORMAL', 'ABNORMAL', 'HIGH', 'LOW');

-- CreateTable
CREATE TABLE "LabOrder" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "status" "LabOrderStatus" NOT NULL DEFAULT 'ORDERED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabTest" (
    "id" TEXT NOT NULL,
    "labOrderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resultValue" TEXT,
    "unit" TEXT,
    "referenceRange" TEXT,
    "flag" "LabResultFlag",

    CONSTRAINT "LabTest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabOrder" ADD CONSTRAINT "LabOrder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabTest" ADD CONSTRAINT "LabTest_labOrderId_fkey" FOREIGN KEY ("labOrderId") REFERENCES "LabOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
