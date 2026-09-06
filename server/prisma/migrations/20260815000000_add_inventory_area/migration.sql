-- CreateEnum
CREATE TYPE "InventoryArea" AS ENUM ('BARRA', 'COCINA');

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN "area" "InventoryArea" NOT NULL DEFAULT 'BARRA';
ALTER TABLE "InventoryMovement" ADD COLUMN "area" "InventoryArea";

-- Backfill: los movimientos existentes heredan el área actual de su ingrediente.
UPDATE "InventoryMovement" SET "area" = i."area"
FROM "Ingredient" i
WHERE "InventoryMovement"."ingredientId" = i."id";

-- AlterTable
ALTER TABLE "InventoryMovement" ALTER COLUMN "area" SET NOT NULL;