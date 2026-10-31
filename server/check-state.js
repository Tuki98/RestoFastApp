const { PrismaClient } = require('./dist/generated/prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL || 'postgresql://restobar_app:restobar_pass@localhost:5433/restobar?schema=public' });
const p = new PrismaClient({ adapter });

(async () => {
  const sessions = await p.cashSession.findMany({ orderBy: { openedAt: 'desc' }, take: 5 });
  console.log('===SESIONES===');
  sessions.forEach((s) => {
    console.log(s.id.slice(0,8), 'org:'+s.organizationId.slice(0,8), 'opened:'+s.openedAt.toISOString(), 'closed:' + (s.closedAt ? s.closedAt.toISOString() : 'null'));
  });
  const orders = await p.order.findMany({ orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, folio: true, cashSessionId: true, status: true, createdAt: true, organizationId: true } });
  console.log('\n===COMANDAS===');
  orders.forEach((o) => {
    console.log('folio:'+o.folio, 'cashSession:' + (o.cashSessionId ? o.cashSessionId.slice(0,8) : 'null'), 'status:'+o.status, o.createdAt.toISOString());
  });
  await p.$disconnect();
})();
