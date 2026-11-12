import { readFileSync, readdirSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"

export let db
export const one = async (sql, args = []) => (await db.query(sql, args)).rows[0]

export async function criarBanco({ ate, antesDe, prepararAntes } = {}) {
  const banco = new PGlite()
  // Só infraestrutura é simulada. Regras, RLS, funções e gatilhos vêm dos arquivos reais.
  await banco.exec(`create role anon; create role authenticated; create role service_role; create role supabase_read_only_user;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key, bucket_id text);
    grant usage on schema public to anon;
    create schema cron;
    create table cron.job (jobid bigint generated always as identity primary key, jobname text unique, schedule text, command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values ($1,$2,$3)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid;
    $$;`)
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    if (ate && file.slice(0, 14) > ate) break
    if (antesDe && file.slice(0, 14) === antesDe) await prepararAntes(banco)
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8")
    // PGlite não possui servidor de replicação; os objetos de negócio ficam intactos.
    await banco.exec(sql.replace(/^alter publication .*;$/gm, "")
      .replace(/^create extension if not exists pg_cron with schema pg_catalog;$/gm, ""))
  }
  return banco
}

export async function preparar() {
  db = await criarBanco()
}

export async function fechar() {
  await db?.close()
}
