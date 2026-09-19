import { prisma } from './src/db/connection';

async function main() {
  await prisma.$transaction(async (tx) => {
    const result = await tx.$queryRaw<
      Array<{
        current_database: string;
        current_schema: string;
        search_path: string;
      }>
    >`
      SELECT
        current_database(),
        current_schema(),
        current_setting('search_path');
    `;

    console.table(result);

    const patients = await tx.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(*)::bigint AS count
      FROM public.patients;
    `;

    console.log(
      'patients count inside transaction:',
      patients[0]?.count?.toString(),
    );
  });
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
