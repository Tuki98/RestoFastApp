const { PrismaClient } = require('./dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const fs = require('fs');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://restobar_app:restobar_pass@localhost:5432/restobar?schema=public' });
const prisma = new PrismaClient({ adapter });

async function main() {
  const sql = fs.readFileSync('prisma/cleanup_open_orders.sql', 'utf8');
  const stmts = sql.split(/;\s*(?:\r?\n|$)/).filter((s) => {
    const t = s.trim();
    if (!t) return false;
    if (t.startsWith('--')) return false;
    return true;
  });
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i].trim();
    if (!s) continue;
    try {
      await prisma.$executeRawUnsafe(s);
      console.log('OK', i);
    } catch (e) {
      console.log('ERR', i, e.message);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
