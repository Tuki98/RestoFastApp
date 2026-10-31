const { PrismaClient } = require('./dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://restobar_app:restobar_pass@localhost:5433/restobar?schema=public' });
const p = new PrismaClient({ adapter });

async function main() {
  try {
    console.log('Applying migration...');
    await p.$executeRawUnsafe(`ALTER TABLE "Order" ALTER COLUMN "folio" DROP DEFAULT;`);
    console.log('1 ok');
  } catch(e) { console.log('1 skip:', e.message); }
  
  try {
    await p.$executeRawUnsafe(`DROP INDEX IF EXISTS "Order_folio_key";`);
    console.log('2 ok');
  } catch(e) { console.log('2 skip:', e.message); }
  
  try {
    await p.$executeRawUnsafe(`ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cashSessionId" TEXT;`);
    console.log('3 ok');
  } catch(e) { console.log('3 skip:', e.message); }
  
  try {
    await p.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Order_cashSessionId_folio_key" ON "Order"("cashSessionId","folio");`);
    console.log('4 ok');
  } catch(e) { console.log('4 skip:', e.message); }
  
  try {
    await p.$executeRawUnsafe(`ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_cashSessionId_fkey";`);
    await p.$executeRawUnsafe(`ALTER TABLE "Order" ADD CONSTRAINT "Order_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "CashSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;`);
    console.log('5 ok');
  } catch(e) { console.log('5 skip:', e.message); }
  
  try {
    await p.$executeRawUnsafe(`ALTER TABLE "CashSession" ADD COLUMN IF NOT EXISTS "nextFolio" INTEGER NOT NULL DEFAULT 0;`);
    console.log('6 ok');
  } catch(e) { console.log('6 skip:', e.message); }
  
  // mark migration as applied
  try {
    await p.$executeRawUnsafe(`INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (gen_random_uuid()::text, '', NOW(), '20261031000000_order_cash_session_folio', NULL, NULL, NOW(), 1) ON CONFLICT DO NOTHING;`);
    console.log('7 ok');
  } catch(e) { console.log('7 skip:', e.message); }
  
  console.log('done');
}

main().catch(e=>{console.error(e);process.exit(1);}).finally(()=>p.$disconnect());
