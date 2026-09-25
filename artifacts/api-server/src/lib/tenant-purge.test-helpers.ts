import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Delete test tenants and EVERY app-DB row that references them, however deep:
 * the foreign-key graph is read from `pg_constraint`, and each table's
 * dependants are deleted before the table itself (settings rows seeded lazily
 * by code paths — milestone_board_settings, caption templates, drafts and
 * their revisions, tracked links, … — included, without listing them by hand).
 *
 * Best-effort by design, for `afterAll`: every delete is isolated in its own
 * try/catch so one failure never strands the rest, and it is safe to call when
 * `beforeAll` failed part-way (unknown / undefined ids are ignored). Test-only:
 * ids are integers, so the raw WHERE text is never user input.
 */
export async function purgeTestTenants(ids: Array<number | undefined | null>): Promise<void> {
  const tenantIds = ids.filter((id): id is number => Number.isInteger(id));
  if (tenantIds.length === 0) return;

  const fkRows = await db.execute(sql`
    select c.conrelid::regclass::text as child, a.attname as child_col,
           c.confrelid::regclass::text as parent, af.attname as parent_col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
    join pg_namespace n on n.oid = c.connamespace
    where c.contype = 'f' and array_length(c.conkey, 1) = 1 and n.nspname = 'public'
  `);
  const fks = fkRows.rows as {
    child: string;
    child_col: string;
    parent: string;
    parent_col: string;
  }[];

  const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;
  const errors: unknown[] = [];

  // `path` holds the tables above this one, so an FK cycle can't recurse forever.
  const purge = async (table: string, where: string, path: string[]): Promise<void> => {
    if (path.length > 8) return;
    for (const fk of fks) {
      if (fk.parent !== table || fk.child === table || path.includes(fk.child)) continue;
      await purge(
        fk.child,
        `${q(fk.child_col)} in (select ${q(fk.parent_col)} from ${table} where ${where})`,
        [...path, table],
      );
    }
    try {
      await db.execute(sql.raw(`delete from ${table} where ${where}`));
    } catch (err) {
      errors.push(err);
    }
  };

  await purge("tenants", `"id" in (${tenantIds.join(",")})`, []);
  if (errors.length > 0)
    console.warn(`purgeTestTenants: ${errors.length} delete(s) failed`, errors[0]);
}
