-- V45: search_path=public sozinho deixa o schema temporário ser procurado ANTES de public.
-- Nomear pg_temp por último impede que uma tabela temporária homônima desvie funções privilegiadas.
alter function public.horas_uteis(timestamptz,timestamptz) set search_path = public, pg_temp;
alter function public.tg_itens_depois() set search_path = public, pg_temp;
alter function public.tg_pedidos_depois() set search_path = public, pg_temp;
alter function public.tg_troca_pecas_depois() set search_path = public, pg_temp;
