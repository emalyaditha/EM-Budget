// Read-only inventory of the QA tenants the screenshot harness created. Prints aggregates
// only — never another tenant's address — and issues no write. Kept in parity/ because the
// pending cleanup decision (D17) depends on these numbers being re-runnable, and because the
// same query is what a future cleanup must verify against.
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const db = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MIGRATIONS = path.join(__dirname, '..', 'supabase', 'migrations');
function tableNames() {
  const seen = new Set();
  for (const f of fs.readdirSync(MIGRATIONS)) {
    const sql = fs.readFileSync(path.join(MIGRATIONS, f), 'utf8').toLowerCase();
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/g)) {
      seen.add(m[1]);
    }
  }
  return [...seen].sort();
}

const qaEmails = async () => {
  const { data, error } = await db
    .from('auth_accounts')
    .select('email,created_at')
    .like('email', 'qa-%@example.com')
    .order('created_at', { ascending: true });
  if (error) throw new Error('auth_accounts: ' + error.message);
  return data || [];
};

// PostgREST reports an unknown column as an error, so probing is the only way to learn
// which tables are tenant-owned without a psql connection.
const ownerColumnOf = async (t) => {
  for (const col of ['user_email', 'email', 'owner_email']) {
    const { error } = await db
      .from(t)
      .select('*', { count: 'exact', head: true })
      .eq(col, '__no_such_tenant__@invalid');
    if (!error) return col;
    if (!/could not find|column/i.test(error.message)) return null;
  }
  return null;
};

const countWhere = async (t, col, email) => {
  const q = db.from(t).select('*', { count: 'exact', head: true });
  const { count, error } = email ? await q.eq(col, email) : await q;
  return error ? null : count;
};

(async () => {
  console.log('project: ' + URL.replace(/^https:\/\//, ''));
  const accounts = await countWhere('auth_accounts', 'email', null);
  const { data: first } = await db
    .from('auth_accounts')
    .select('created_at')
    .order('created_at', { ascending: true })
    .limit(1);
  const { data: last } = await db
    .from('auth_accounts')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1);
  console.log(`auth_accounts rows: ${accounts}`);
  console.log(`earliest account: ${first?.[0]?.created_at}   latest account: ${last?.[0]?.created_at}`);

  const qas = await qaEmails();
  console.log(`\nqa-* tenants: ${qas.length}`);
  for (const r of qas) console.log(`  ${r.email}  created ${r.created_at}`);

  const tables = tableNames();
  const owners = new Map();
  for (const t of tables) {
    const col = await ownerColumnOf(t);
    if (col) owners.set(t, col);
  }
  console.log(`\ntables in supabase/migrations: ${tables.length} — tenant-owned: ${owners.size}`);
  console.log(
    'not tenant-owned (a cascade from auth_accounts cannot reach them): ' +
      tables.filter((t) => !owners.has(t)).join(', '),
  );

  const short = (e) => e.replace(/^qa-/, '').replace(/@example\.com$/, '');
  console.log(
    '\n' +
      ['table', 'owner col', 'rows total', ...qas.map((q) => short(q.email))]
        .map((h) => String(h).padEnd(22))
        .join(' | '),
  );
  const qaTotals = new Map(qas.map((q) => [q.email, 0]));
  for (const [t, col] of owners) {
    const total = await countWhere(t, col, null);
    const cells = [];
    for (const q of qas) {
      const c = await countWhere(t, col, q.email);
      if (c) qaTotals.set(q.email, qaTotals.get(q.email) + c);
      cells.push(c === null ? 'n/a' : String(c));
    }
    console.log(
      [t, col, total === null ? 'n/a' : String(total), ...cells].map((s) => String(s).padEnd(22)).join(' | '),
    );
  }
  console.log('\nper-tenant row totals (every tenant-owned table):');
  for (const [email, n] of qaTotals) console.log(`  ${email}: ${n}`);
  console.log(`  TOTAL: ${[...qaTotals.values()].reduce((a, b) => a + b, 0)}`);
})().catch((e) => {
  console.error('FAILED: ' + e.message);
  process.exit(1);
});
