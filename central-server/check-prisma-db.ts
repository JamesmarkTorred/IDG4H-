import { prisma } from './src/db/connection';

async function main() {
  const result = await prisma.$queryRaw<
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
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
