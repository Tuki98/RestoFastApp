-- Folio de comanda por turno de caja:
-- - Ya no es autoincrement global: cada caja abierta genera folios 1, 2, 3... (nextFolio).
-- - El folio queda único por (caja/turno, comanda): Order_cashSessionId_folio_key.

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "folio" DROP DEFAULT;

-- DropIndex
DROP INDEX IF EXISTS "Order_folio_key";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "cashSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_cashSessionId_folio_key" ON "Order"("cashSessionId","folio");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CashSession" ADD COLUMN "nextFolio" INTEGER NOT NULL DEFAULT 0;
