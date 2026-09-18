/*
 * Writes every row of the platform database to one JSON file.
 *
 * Supabase's free plan takes no backups, so this is the copy to take before a release
 * that changes the database. Run it from platform/apps/api with the connection string in
 * the environment, so the password is never typed on the command line or stored here:
 *
 *   $env:BACKUP_DATABASE_URL = "postgresql://...supabase..."
 *   node scripts/backup-database.cjs
 *
 * The file lands beside the repository unless BACKUP_FILE names somewhere else. It holds
 * every account's password hash and every certificate, so keep it off shared drives and
 * out of the repository — .gitignore already excludes *.backup.json.
 *
 * To restore, copy it back with scripts/copy-database.cjs, or ask for a restore script.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const URL = process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;
if (!URL) {
  console.error('Set BACKUP_DATABASE_URL to the database connection string first.');
  process.exit(1);
}

/** Same order copy-database.cjs writes in, so a restore can replay the file top to bottom. */
const TABLES = [
  'level',
  'category',
  'user',
  'refreshToken',
  'studentProfile',
  'track',
  'module',
  'topic',
  'competency',
  'moduleQuiz',
  'trackAssessment',
  'quizQuestion',
  'quizAttempt',
  'enrollment',
  'topicProgress',
  'submission',
  'submissionRubricCheck',
  'storedFile',
  'credential',
  'auditLog',
  'officeHourSlot',
  'officeHourBooking',
  'bookmark',
  'collection',
  'collectionItem',
  'notification',
];

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file =
    process.env.BACKUP_FILE || path.resolve(process.cwd(), `dojo-hub-${stamp}.backup.json`);

  const prisma = new PrismaClient({ datasources: { db: { url: URL } } });
  const data = {};
  let rows = 0;

  try {
    for (const table of TABLES) {
      const model = prisma[table];
      if (!model) {
        console.error(`  ! no such table: ${table}`);
        continue;
      }
      // The whole platform is a few hundred rows; one read per table keeps this simple
      // and means no row can be missed or repeated between pages.
      const collected = await model.findMany();
      data[table] = collected;
      rows += collected.length;
      console.log(`  ${String(collected.length).padStart(5)}  ${table}`);
    }

    fs.writeFileSync(
      file,
      JSON.stringify({ takenAt: new Date().toISOString(), tables: data }, null, 2),
    );
    const mb = (fs.statSync(file).size / (1024 * 1024)).toFixed(2);
    console.log(`\nBacked up ${rows} rows from ${TABLES.length} tables.`);
    console.log(`Saved to ${file} (${mb} MB)`);
    console.log('This file contains personal data and password hashes — keep it private.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('\nBackup failed:', error.message);
  process.exit(1);
});
