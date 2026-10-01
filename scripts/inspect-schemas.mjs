import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });

async function probeTable(client, schema, table) {
  const q = client.schema(schema).from(table).select('*').limit(1);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  const cols = data?.[0] ? Object.keys(data[0]) : [];
  return { ok: true, cols };
}

async function inspect(label, url, key, tables) {
  console.log(`\n=== ${label} ===`);
  const client = createClient(url, key, { auth: { persistSession: false } });
  for (const { schema, table } of tables) {
    const r = await probeTable(client, schema, table);
    if (!r.ok) console.log(`${schema}.${table}: ERROR ${r.error}`);
    else console.log(`${schema}.${table}: ${r.cols.join(', ')}`);
  }
}

await inspect('ANCHOR', process.env.ANCHOR_SUPABASE_URL, process.env.ANCHOR_SUPABASE_SERVICE_ROLE_KEY, [
  { schema: 'qv_360', table: 'clientes_cadastro' },
  { schema: 'qv_360', table: 'clientes_legado' },
]);

await inspect('PHARUS APP', process.env.PHARUS_SUPABASE_URL, process.env.PHARUS_SUPABASE_SERVICE_ROLE_KEY, [
  { schema: 'core', table: 'personal_info' },
  { schema: 'core', table: 'users' },
  { schema: 'core', table: 'profiles' },
  { schema: 'public', table: 'profiles' },
  { schema: 'public', table: 'users' },
]);
