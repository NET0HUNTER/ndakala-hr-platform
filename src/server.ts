import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const prisma = new PrismaClient();

const app = createApp(prisma);

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Ndakala Advisory LLP - HR & People Operations Platform`);
  console.log(` Service: Production API v1.0.0`);
  console.log(` Port: ${PORT} | Timezone: Africa/Nairobi | Currency: KES`);
  console.log(` Health: http://localhost:${PORT}/api/v1/health`);
  console.log(` Ready:  http://localhost:${PORT}/api/v1/ready`);
  console.log(`=======================================================`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Disconnecting Prisma...');
  await prisma.$disconnect();
  process.exit(0);
});
