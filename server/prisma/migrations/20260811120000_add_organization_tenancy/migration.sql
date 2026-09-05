-- CreateEnum
CREATE TYPE "OrgPlan" AS ENUM ('TRIAL', 'ACTIVE', 'PAUSED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "OrgPlan" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- Backfill: organización demo que adopta toda la data existente.
INSERT INTO "Organization" ("id", "name", "slug", "plan", "trialEndsAt", "createdAt", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'Restobar', 'restobar', 'ACTIVE', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- DropIndex
DROP INDEX "Category_name_key";

-- DropIndex
DROP INDEX "Ingredient_name_key";

-- DropIndex
DROP INDEX "RestaurantTable_number_key";

-- AlterTable (columna nullable -> backfill -> NOT NULL)
ALTER TABLE "CashSession" ADD COLUMN     "organizationId" TEXT;
UPDATE "CashSession" SET "organizationId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "CashSession" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Category" ADD COLUMN     "organizationId" TEXT;
UPDATE "Category" SET "organizationId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "Category" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Ingredient" ADD COLUMN     "organizationId" TEXT;
UPDATE "Ingredient" SET "organizationId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "Ingredient" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Order" ADD COLUMN     "organizationId" TEXT;
UPDATE "Order" SET "organizationId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "Order" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Printer" ADD COLUMN     "organizationId" TEXT;
UPDATE "Printer" SET "organizationId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "Printer" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Product" ADD COLUMN     "organizationId" TEXT;
UPDATE "Product" SET "organizationId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "Product" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "Reservation" ADD COLUMN     "organizationId" TEXT;
UPDATE "Reservation" SET "organizationId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "Reservation" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "RestaurantTable" ADD COLUMN     "organizationId" TEXT;
UPDATE "RestaurantTable" SET "organizationId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "RestaurantTable" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN     "organizationId" TEXT;
UPDATE "User" SET "organizationId" = '00000000-0000-4000-8000-000000000001';
ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Category_organizationId_name_key" ON "Category"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_organizationId_name_key" ON "Ingredient"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_organizationId_number_key" ON "RestaurantTable"("organizationId", "number");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantTable" ADD CONSTRAINT "RestaurantTable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
