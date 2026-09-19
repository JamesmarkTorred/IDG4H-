import { prisma } from './src/db/connection';

async function main() {
  const result = await prisma.$queryRaw<
    Array<{
      table_schema: string;
      table_name: string;
    }>
  >`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `;

  console.table(result);

  const patients = await prisma.$queryRaw<
    Array<{ count: bigint }>
  >`
    SELECT COUNT(*)::bigint AS count
    FROM public.patients;
  `;

  console.log('patients count:', patients[0]?.count?.toString());
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
