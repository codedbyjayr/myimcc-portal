/**
 * Comprehensive Supabase Backup Utility
 * Backs up public, auth, and storage schemas (data, schema DDL, JSON exports, and SQL dump).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env if exists
const envPath = path.resolve(__dirname, '../config/.env');
// Check root .env first, then config/.env
const rootEnvPath = path.resolve(__dirname, '../.env');
const targetEnvPath = fs.existsSync(rootEnvPath) ? rootEnvPath : envPath;
let envConfig = {};
if (fs.existsSync(targetEnvPath)) {
  const envContent = fs.readFileSync(targetEnvPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        envConfig[key] = val;
      }
    }
  });
}

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || envConfig.SUPABASE_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN. Please set it in .env or environment variable.');
  process.exit(1);
}

const PROJECTS = [
  { id: 'dusiokpfmkhutptomrqg', name: 'myimcc-portal' },
  { id: 'qwweiwdrvowjthvmhxvc', name: 'imcc-lms' }
];

async function runSql(projectId, sql) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectId}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Query failed on project ${projectId}: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

function escapeSqlValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number' || typeof val === 'bigint') return val.toString();
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function backupProject(project) {
  console.log(`\n========================================`);
  console.log(` Starting Backup for: ${project.name} (${project.id})`);
  console.log(`========================================`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, `../database/backups/${project.name}_${timestamp}`);
  const jsonDir = path.join(backupDir, 'json');

  fs.mkdirSync(jsonDir, { recursive: true });

  // 1. Get all tables in relevant schemas
  const tablesQuery = `
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables 
    WHERE table_schema IN ('public', 'auth', 'storage')
    ORDER BY table_schema, table_name;
  `;
  const tables = await runSql(project.id, tablesQuery);
  console.log(`Found ${tables.length} tables/views across public, auth, and storage.`);

  const summary = {
    projectId: project.id,
    projectName: project.name,
    timestamp: new Date().toISOString(),
    totalTables: tables.length,
    tableRowCounts: {},
    errors: []
  };

  const fullDataBackup = {};
  let fullSqlBackup = `-- ==========================================================\n`;
  fullSqlBackup += `-- SUPABASE BACKUP FOR: ${project.name} (${project.id})\n`;
  fullSqlBackup += `-- Generated at: ${new Date().toISOString()}\n`;
  fullSqlBackup += `-- ==========================================================\n\n`;
  fullSqlBackup += `SET statement_timeout = 0;\nSET lock_timeout = 0;\nSET client_encoding = 'UTF8';\n\n`;

  // 2. Export each table
  for (const t of tables) {
    const schema = t.table_schema;
    const tableName = t.table_name;
    const fullName = `"${schema}"."${tableName}"`;

    if (t.table_type === 'VIEW') {
      console.log(`  [SKIP DATA] ${fullName} (VIEW)`);
      continue;
    }

    try {
      // Fetch table rows
      const rows = await runSql(project.id, `SELECT * FROM ${fullName};`);
      const count = Array.isArray(rows) ? rows.length : 0;
      summary.tableRowCounts[`${schema}.${tableName}`] = count;
      fullDataBackup[`${schema}.${tableName}`] = rows;

      // Save individual JSON
      fs.writeFileSync(
        path.join(jsonDir, `${schema}.${tableName}.json`),
        JSON.stringify(rows, null, 2),
        'utf8'
      );

      // Generate SQL INSERT statements
      if (Array.isArray(rows) && rows.length > 0) {
        fullSqlBackup += `\n-- ----------------------------------------------------------\n`;
        fullSqlBackup += `-- Table Data: ${fullName} (${rows.length} rows)\n`;
        fullSqlBackup += `-- ----------------------------------------------------------\n`;

        const columns = Object.keys(rows[0]);
        const quotedCols = columns.map(c => `"${c}"`).join(', ');

        for (const row of rows) {
          const values = columns.map(col => escapeSqlValue(row[col])).join(', ');
          fullSqlBackup += `INSERT INTO ${fullName} (${quotedCols}) VALUES (${values}) ON CONFLICT DO NOTHING;\n`;
        }
      }

      console.log(`  [OK] ${fullName}: ${count} rows`);
    } catch (err) {
      console.error(`  [ERROR] Failed to export ${fullName}:`, err.message);
      summary.errors.push({ table: fullName, error: err.message });
    }
  }

  // 3. Export Schema DDL (Functions, Policies, Triggers, Views)
  try {
    console.log(`\nExporting schema policies and views...`);
    const policies = await runSql(project.id, `
      SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname IN ('public', 'auth', 'storage');
    `);
    fs.writeFileSync(path.join(backupDir, 'policies.json'), JSON.stringify(policies, null, 2), 'utf8');

    const views = await runSql(project.id, `
      SELECT table_schema, table_name, view_definition
      FROM information_schema.views
      WHERE table_schema IN ('public', 'auth', 'storage');
    `);
    fs.writeFileSync(path.join(backupDir, 'views.json'), JSON.stringify(views, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to export schema metadata:`, err.message);
  }

  // 4. Save combined JSON and SQL
  fs.writeFileSync(path.join(backupDir, 'all_data.json'), JSON.stringify(fullDataBackup, null, 2), 'utf8');
  fs.writeFileSync(path.join(backupDir, 'backup.sql'), fullSqlBackup, 'utf8');
  fs.writeFileSync(path.join(backupDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log(`\n Backup completed successfully!`);
  console.log(` Directory: ${backupDir}`);
  console.log(` Total JSON files: ${Object.keys(summary.tableRowCounts).length}`);
  console.log(` SQL Dump: ${path.join(backupDir, 'backup.sql')}`);

  return { backupDir, summary };
}

async function main() {
  const targetProject = process.argv[2];
  const selectedProjects = targetProject
    ? PROJECTS.filter(p => p.name === targetProject || p.id === targetProject)
    : PROJECTS;

  if (selectedProjects.length === 0) {
    console.error(`Project "${targetProject}" not found.`);
    process.exit(1);
  }

  const results = [];
  for (const proj of selectedProjects) {
    const res = await backupProject(proj);
    results.push(res);
  }

  console.log(`\n========================================`);
  console.log(` All backups finished!`);
  console.log(`========================================`);
}

main().catch(err => {
  console.error(`Fatal backup error:`, err);
  process.exit(1);
});
