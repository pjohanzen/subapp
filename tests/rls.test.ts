/**
 * Runs the real migration against an in-process Postgres (PGlite) with minimal stand-ins for Supabase's
 * auth schema/roles, then proves row-level security: user A cannot read or write user B's rows.
 * This verifies the policies' SQL logic. It does NOT replace a smoke test against a real Supabase project.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
let db: PGlite;

async function as(user: string | null, fn: () => Promise<void>) {
  await db.exec(user ? `select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;` : "reset role;");
  try { await fn(); } finally { await db.exec("reset role;"); }
}
const rows = async (sql: string, params: unknown[] = []) => (await db.query(sql, params)).rows as Record<string, unknown>[];
const fails = async (sql: string, params: unknown[] = []) => {
  try { await db.query(sql, params); return false; } catch { return true; }
};

let catA = "", pmA = "", catB = "", pmB = "";

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  await db.exec(readFileSync(path.join(__dirname, "../supabase/migrations/20261108000001_initial_schema.sql"), "utf8"));
  // Supabase grants table/function access to its roles by default; RLS is what restricts rows.
  await db.exec(`
    grant usage on schema public, auth to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(`insert into auth.users values ('${A}','a@example.com'), ('${B}','b@example.com');`);
  catA = (await rows(`select id from public.categories where user_id='${A}' and name='Other'`))[0].id as string;
  pmA = (await rows(`select id from public.payment_methods where user_id='${A}' and name='Other'`))[0].id as string;
  catB = (await rows(`select id from public.categories where user_id='${B}' and name='Other'`))[0].id as string;
  pmB = (await rows(`select id from public.payment_methods where user_id='${B}' and name='Other'`))[0].id as string;
});
afterAll(async () => { await db.close(); });

const insertSub = (user: string, cat: string, pm: string, name = "Netflix") =>
  db.query<{ id: string }>(
    `insert into public.subscriptions (user_id,name,amount_minor,currency,cycle,next_renewal,category_id,payment_method_id) values ($1,$2,54900,'PHP','monthly','2026-12-01',$3,$4) returning id`,
    [user, name, cat, pm],
  );

describe("schema + signup trigger", () => {
  it("creates profile, default categories, payment methods and reminders for a new user", async () => {
    expect((await rows(`select home_currency, timezone from public.profiles where id='${A}'`))[0]).toEqual({ home_currency: "PHP", timezone: "Asia/Manila" });
    expect((await rows(`select count(*)::int n from public.categories where user_id='${A}'`))[0].n).toBe(9);
    expect((await rows(`select count(*)::int n from public.payment_methods where user_id='${A}'`))[0].n).toBe(5);
    expect((await rows(`select days_before from public.reminders where user_id='${A}' order by 1`)).map((r) => r.days_before)).toEqual([1, 3, 7]);
  });
  it("RLS is enabled on every public table", async () => {
    const off = await rows(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    expect(off).toEqual([]);
  });
});

describe("RLS: user A cannot touch user B's rows", () => {
  let subA = "";
  it("A can create and read own subscription", async () => {
    await as(A, async () => {
      subA = (await insertSub(A, catA, pmA)).rows[0].id;
      expect((await rows(`select id from public.subscriptions`)).map((r) => r.id)).toEqual([subA]);
    });
  });
  it("B cannot read A's subscription or categories", async () => {
    await as(B, async () => {
      expect(await rows(`select id from public.subscriptions`)).toEqual([]);
      expect((await rows(`select id from public.categories where user_id='${A}'`))).toEqual([]);
      expect((await rows(`select id from public.profiles where id='${A}'`))).toEqual([]);
    });
  });
  it("B cannot update or delete A's subscription (0 rows affected)", async () => {
    await as(B, async () => {
      expect((await db.query(`update public.subscriptions set name='pwned' where id=$1`, [subA])).affectedRows).toBe(0);
      expect((await db.query(`delete from public.subscriptions where id=$1`, [subA])).affectedRows).toBe(0);
      expect((await db.query(`update public.profiles set home_currency='USD' where id=$1`, [A])).affectedRows).toBe(0);
    });
    expect((await rows(`select name from public.subscriptions where id='${subA}'`))[0].name).toBe("Netflix");
  });
  it("B cannot insert a row owned by A", async () => {
    await as(B, async () => { expect(await fails(`insert into public.categories (user_id,name) values ('${A}','Evil')`)).toBe(true); });
  });
  it("B cannot attach their subscription to A's category (composite FK)", async () => {
    await as(B, async () => { expect(await fails(`insert into public.subscriptions (user_id,name,amount_minor,currency,cycle,next_renewal,category_id,payment_method_id) values ('${B}','x',1,'USD','monthly','2026-12-01','${catA}','${pmB}')`)).toBe(true); });
  });
  it("B cannot reassign A's category via the delete RPC", async () => {
    await as(B, async () => { expect(await fails(`select public.delete_category('${catB}', '${catA}')`)).toBe(true); });
  });
  it("payments and reminder_log are read-only for users", async () => {
    await db.exec(`insert into public.payments (user_id,subscription_id,paid_on,amount_minor,currency) values ('${A}','${subA}','2026-11-01',54900,'PHP');
                   insert into public.reminder_log (user_id,subscription_id,renewal_date,days_before,driver) values ('${A}','${subA}','2026-12-01',7,'log');`);
    await as(A, async () => {
      expect((await rows(`select 1 from public.payments`)).length).toBe(1);
      expect((await rows(`select 1 from public.reminder_log`)).length).toBe(1);
      expect(await fails(`insert into public.payments (user_id,subscription_id,paid_on,amount_minor,currency) values ('${A}','${subA}','2026-10-01',1,'PHP')`)).toBe(true);
      expect(await fails(`insert into public.reminder_log (user_id,subscription_id,renewal_date,days_before,driver) values ('${A}','${subA}','2026-12-01',3,'log')`)).toBe(true);
    });
    await as(B, async () => {
      expect(await rows(`select 1 from public.payments`)).toEqual([]);
      expect(await rows(`select 1 from public.reminder_log`)).toEqual([]);
    });
  });
  it("exchange_rates: users can read, not write", async () => {
    await db.exec(`insert into public.exchange_rates (base_currency,currency,rate,rate_date) values ('USD','PHP',58,'2026-11-08')`);
    await as(B, async () => {
      expect((await rows(`select rate from public.exchange_rates`)).length).toBe(1);
      expect(await fails(`insert into public.exchange_rates (base_currency,currency,rate,rate_date) values ('USD','EUR',0.9,'2026-11-08')`)).toBe(true);
      expect((await db.query(`update public.exchange_rates set rate=1`)).affectedRows).toBe(0);
    });
  });
  it("signed-out (anon) callers see nothing", async () => {
    await db.exec("set role anon;");
    expect(await fails(`select * from public.subscriptions`)).toBe(true); // no table privilege at all
    await db.exec("reset role;");
  });
});

describe("integrity", () => {
  it("a category in use cannot be deleted directly (never orphaned)", async () => {
    await as(A, async () => { expect(await fails(`delete from public.categories where id='${catA}'`)).toBe(true); });
  });
  it("delete_category reassigns subscriptions, then deletes", async () => {
    await as(A, async () => {
      const other = (await rows(`select id from public.categories where name='Music'`))[0].id as string;
      await db.query(`select public.delete_category($1,$2)`, [catA, other]);
      expect((await rows(`select category_id from public.subscriptions`))[0].category_id).toBe(other);
      expect(await rows(`select 1 from public.categories where id='${catA}'`)).toEqual([]);
      expect(await fails(`select public.delete_category($1,$1)`, [other])).toBe(true);
    });
  });
  it("delete_payment_method reassigns too", async () => {
    await as(A, async () => {
      const other = (await rows(`select id from public.payment_methods where name='E-wallet'`))[0].id as string;
      await db.query(`select public.delete_payment_method($1,$2)`, [pmA, other]);
      expect((await rows(`select payment_method_id from public.subscriptions`))[0].payment_method_id).toBe(other);
    });
  });
  it("payments and reminder_log unique keys hold", async () => {
    const sid = (await rows(`select id from public.subscriptions where user_id='${A}'`))[0].id as string;
    expect(await fails(`insert into public.payments (user_id,subscription_id,paid_on,amount_minor,currency) values ('${A}','${sid}','2026-11-01',1,'PHP')`)).toBe(true);
    expect(await fails(`insert into public.reminder_log (user_id,subscription_id,renewal_date,days_before,driver) values ('${A}','${sid}','2026-12-01',7,'log')`)).toBe(true);
  });
  it("money/currency/status constraints reject bad data", async () => {
    const [c, p] = [(await rows(`select id from public.categories where user_id='${B}' limit 1`))[0].id, pmB];
    for (const bad of [`-5,'USD','monthly','active'`, `5,'usd','monthly','active'`, `5,'USD','daily','active'`, `5,'USD','monthly','gone'`]) {
      expect(await fails(`insert into public.subscriptions (user_id,name,amount_minor,currency,cycle,status,next_renewal,category_id,payment_method_id) values ('${B}','x',${bad.split(",").slice(0,1)},${bad.split(",").slice(1,2)},${bad.split(",").slice(2,3)},${bad.split(",").slice(3,4)},'2026-12-01','${c}','${p}')`)).toBe(true);
    }
  });
  it("deleting a user cascades to all their data", async () => {
    await db.exec(`delete from auth.users where id='${A}'`);
    for (const t of ["profiles", "categories", "payment_methods", "subscriptions", "payments", "reminders", "reminder_log"]) {
      const col = t === "profiles" ? "id" : "user_id";
      expect((await rows(`select count(*)::int n from public.${t} where ${col}='${A}'`))[0].n).toBe(0);
    }
  });
});
