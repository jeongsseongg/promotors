const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');

test('native snapshot executes the exact deployed filter against 21 privacy and branch counterexamples', async () => {
  const root = path.join(__dirname, '../');
  const sql = fs.readFileSync(path.join(root, 'native-sync-read.sql'), 'utf8');
  const scenarios = fs.readFileSync(path.join(__dirname, 'native-sync-read.synthetic.sql'), 'utf8');
  const body = value => value.split('AS $function$')[1].split('$function$;')[0].replaceAll('\r\n', '\n');
  assert.match(sql, /SECURITY INVOKER SET search_path = ''/);
  assert.equal(body(scenarios), body(sql).replace('public.pm_sync_read(p_token)', 'pg_temp.native_sync_guard(p_token)'));
  const db = new PGlite();
  try {
    const result = await db.exec(scenarios);
    const rows = result.flatMap(value => value.rows || []);
    assert.equal(rows.length, 21);
    for (const row of rows) assert.equal(row.passed, true, row.scenario);
  } finally {await db.close();}
});
