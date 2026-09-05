-- AlterTable
ALTER TABLE "Order" ADD COLUMN "customerToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_customerToken_key" ON "Order"("customerToken");
