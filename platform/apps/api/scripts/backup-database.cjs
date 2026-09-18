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
 * It reads the tables directly with SELECT *, not through the app's models, so it works
 * whatever version of the code is checked out — a backup taken before a release must not
 * depend on the release it is protecting against. Tables and columns that do not exist yet
 * are simply reported and skipped.
 *
 * The file lands in the current directory unless BACKUP_FILE names somewhere else. It
 * holds every account's password hash and every certificate, so keep it off shared drives
 * and out of the repository — .gitignore excludes *.backup.json.
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
  'Level',
  'Category',
  'User',
  'RefreshToken',
  'StudentProfile',
  'Track',
  'Module',
  'Topic',
  'Competency',
  'ModuleQuiz',
  'TrackAssessment',
  'QuizQuestion',
  'QuizAttempt',
  'Enrollment',
  'TopicProgress',
  'Submission',
  'SubmissionRubricCheck',
  'StoredFile',
  'Credential',
  'AuditLog',
  'OfficeHourSlot',
  'OfficeHourBooking',
  'Bookmark',
  'Collection',
  'CollectionItem',
  'Notification',
];

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file =
    process.env.BACKUP_FILE || path.resolve(process.cwd(), `dojo-hub-${stamp}.backup.json`);

  const prisma = new PrismaClient({ datasources: { db: { url: URL } } });
  const data = {};
  const missing = [];
  let rows = 0;

  try {
    for (const table of TABLES) {
      try {
        // Double-quoted so the mixed-case table names resolve; no user input goes in here.
        const collected = await prisma.$queryRawUnsafe(`SELECT * FROM "${table}"`);
        data[table] = collected;
        rows += collected.length;
        console.log(`  ${String(collected.length).padStart(5)}  ${table}`);
      } catch (error) {
        missing.push(table);
        console.log(`      -  ${table} (skipped: ${error.message.split('\n')[0]})`);
      }
    }

    fs.writeFileSync(
      file,
      JSON.stringify(
        { takenAt: new Date().toISOString(), tables: data },
        // Row counts can come back as BigInt from Postgres; keep them readable.
        (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
        2,
      ),
    );
    const mb = (fs.statSync(file).size / (1024 * 1024)).toFixed(2);
    console.log(`\nBacked up ${rows} rows from ${TABLES.length - missing.length} tables.`);
    if (missing.length) console.log(`Skipped (not in this database): ${missing.join(', ')}`);
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
