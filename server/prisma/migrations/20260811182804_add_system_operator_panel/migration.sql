-- AlterEnum
ALTER TYPE "RoleName" ADD VALUE 'SUPERADMIN';

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_organizationId_fkey";

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "maxUsers" INTEGER,
ADD COLUMN     "usersPanelPasswordHash" TEXT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
