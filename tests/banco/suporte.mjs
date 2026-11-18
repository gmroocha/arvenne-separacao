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
    create schema realtime;
    create table realtime.messages (id uuid primary key default gen_random_uuid(), payload jsonb, event text, topic text,
      private boolean, extension text, inserted_at timestamptz default clock_timestamp());
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to anon, authenticated; grant select on realtime.messages to anon, authenticated;
    create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
    create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
      language sql as $$ insert into realtime.messages (payload, event, topic, private, extension) values (payload, event, topic, private, 'broadcast') $$;
    create schema cron;
    create table cron.job (jobid bigint generated always as identity primary key, jobname text unique, schedule text, command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$
      insert into cron.job(jobname,schedule,command) values ($1,$2,$3)
      on conflict(jobname) do update set schedule=excluded.schedule,command=excluded.command returning jobid;
    $$;
    -- pg_net e Vault também não existem no PGlite: simulados só para exercitar a função da Shopify automática.
    -- net.chamadas guarda o que seria enviado; vault.decrypted_secrets começa vazio (o segredo é do painel, nunca do código).
    create schema net;
    create table net.chamadas (id bigint generated always as identity primary key, url text, headers jsonb, body jsonb, timeout_milliseconds int);
    create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
      returns bigint language sql as $$ insert into net.chamadas(url,headers,body,timeout_milliseconds) values ($1,$4,$2,$5) returning id $$;
    create schema vault;
    create table vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text, decrypted_secret text);`)
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    if (ate && file.slice(0, 14) > ate) break
    if (antesDe && file.slice(0, 14) === antesDe) await prepararAntes(banco)
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8")
    // PGlite não possui servidor de replicação; os objetos de negócio ficam intactos.
    await banco.exec(sql.replace(/^alter publication .*;$/gm, "")
      .replace(/^create extension if not exists (pg_cron with schema pg_catalog|pg_net with schema extensions);$/gm, ""))
  }
  return banco
}

export async function preparar() {
  db = await criarBanco()
}

export async function fechar() {
  await db?.close()
}
