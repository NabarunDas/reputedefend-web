/**
 * Rehearsal harness: builds a PostgreSQL database from the migration chain in
 * the manifest order, with no cherry-picking.
 *
 * Rehearsals run against an in-process PGlite database. They never connect to
 * `profilerelaunch-dev` and never replay a migration against a live database.
 * The only accommodation made for PGlite is that `pgcrypto` is unavailable, so
 * the extension statement is replaced with equivalent functions in the
 * `extensions` schema.
 */

import { readFileSync, readdirSync } from "node:fs"
import { chainThrough, migrationChain, type MigrationEntry } from "./manifest"

export type MigrationExecutor = { exec(sql: string): Promise<unknown> }

const migrationsDirectory = new URL("../../../../supabase/migrations/", import.meta.url)

const pgcryptoStatement = "CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;"

/**
 * PGlite ships without pgcrypto. `gen_random_uuid` is a core function, and the
 * digest used by the schema only needs to be deterministic for rehearsal
 * purposes, so it is stubbed rather than reimplemented.
 */
const pgcryptoStub = [
  "CREATE FUNCTION extensions.gen_random_uuid() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';",
  "CREATE FUNCTION extensions.gen_random_bytes(n integer) RETURNS bytea LANGUAGE sql AS 'SELECT substring(decode(replace(gen_random_uuid()::text,''-'',''''),''hex'') from 1 for n)';",
  "CREATE FUNCTION extensions.digest(data bytea, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT decode(md5(encode(data,''hex'')) || md5(coalesce(algo,''sha256'') || encode(data,''hex'')),''hex'')';",
  "CREATE FUNCTION extensions.digest(data text, algo text) RETURNS bytea LANGUAGE sql IMMUTABLE AS 'SELECT extensions.digest(convert_to(data,''UTF8''), algo)';",
].join(" ")

/**
 * Roles and the `auth` schema are provided by the Supabase platform rather
 * than by a migration, so a rehearsal has to create them before the chain runs.
 */
export const platformPrelude = `create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(
  id uuid primary key,
  email text,
  email_confirmed_at timestamptz,
  deleted_at timestamptz,
  banned_until timestamptz
);`

export function migrationSql(filename: string): string {
  return readFileSync(new URL(filename, migrationsDirectory), "utf8")
}

/** Migration filenames on disk, in the order PostgreSQL would receive them. */
export function repositoryMigrationFilenames(): string[] {
  return readdirSync(migrationsDirectory).filter(name => name.endsWith(".sql")).sort()
}

export type AppliedMigration = { entry: MigrationEntry; durationMs: number }

export type RehearsalResult = {
  applied: AppliedMigration[]
  head: string | null
  totalMs: number
}

async function applyEntry(db: MigrationExecutor, entry: MigrationEntry): Promise<AppliedMigration> {
  const sql = migrationSql(entry.filename).replace(pgcryptoStatement, pgcryptoStub)
  const started = Date.now()
  try {
    await db.exec(sql)
  } catch (error) {
    throw new Error(`migration ${entry.filename} failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  return { entry, durationMs: Date.now() - started }
}

/** Creates the platform objects a Supabase project provides before any migration runs. */
export async function preparePlatform(db: MigrationExecutor): Promise<void> {
  await db.exec(platformPrelude)
}

/**
 * Applies the chain in manifest order. `through` stops at an earlier
 * checkpoint so an upgrade rehearsal can represent a database that is already
 * running an older schema.
 */
export async function applyChain(db: MigrationExecutor, options: { through?: string } = {}): Promise<RehearsalResult> {
  const chain = options.through ? chainThrough(options.through) : [...migrationChain]
  const applied: AppliedMigration[] = []
  const started = Date.now()
  for (const entry of chain) applied.push(await applyEntry(db, entry))
  return { applied, head: applied.at(-1)?.entry.version ?? null, totalMs: Date.now() - started }
}

/** Applies the migrations a checkpointed database has not yet received. */
export async function applyUpgrade(db: MigrationExecutor, from: string, options: { stopBefore?: string } = {}): Promise<RehearsalResult> {
  const index = migrationChain.findIndex(entry => entry.version === from)
  if (index < 0) throw new Error(`unknown migration version ${from}`)
  let pending = migrationChain.slice(index + 1)
  if (options.stopBefore) {
    const stop = pending.findIndex(entry => entry.version === options.stopBefore)
    if (stop >= 0) pending = pending.slice(0, stop)
  }
  const applied: AppliedMigration[] = []
  const started = Date.now()
  for (const entry of pending) applied.push(await applyEntry(db, entry))
  return { applied, head: applied.at(-1)?.entry.version ?? null, totalMs: Date.now() - started }
}
