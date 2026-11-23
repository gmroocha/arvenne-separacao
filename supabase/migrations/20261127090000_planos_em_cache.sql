-- Lentidão de 23/11/2026 (278 "statement timeout" numa manhã, só 57 pedidos): o banco gastava o processador PLANEJANDO
-- consultas, não lendo dados. troca_painel era SQL puro: o Postgres 17 replaneja função SQL a cada chamada (0,1 a 0,3 s de
-- CPU só de plano, por causa das views de troca), e ela era a leitura mais chamada.
--
-- 1. troca_painel vira plpgsql: o plano fica guardado na conexão e é reaproveitado. Sem troca ativa, sai antes de montar
--    a consulta grande. Mesma resposta, mesma segurança (security invoker: a RLS de quem chama continua valendo).
-- 2. plan_cache_mode = force_generic_plan nas funções plpgsql quentes: o plpgsql planeja de novo nas 5 primeiras chamadas de
--    cada conexão (plano "sob medida"); aqui ele guarda o plano já na primeira. As consultas são por id (índice), o plano
--    genérico é o mesmo. Nenhuma regra muda.

create or replace function public.troca_painel(p_pedido uuid) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp
set plan_cache_mode = force_generic_plan as $$
declare
  v_troca uuid;
begin
  select t.id into v_troca from public.trocas t
   where t.pedido_id = p_pedido and t.status in ('rascunho','enviada','respondida')
   limit 1;
  if v_troca is null then return null; end if;
  return (
    select to_jsonb(t) || jsonb_build_object(
      'pecas', coalesce((
        select jsonb_agg(to_jsonb(tp) || jsonb_build_object(
          'opcoes', coalesce((select jsonb_agg(to_jsonb(o) order by o.ordem) from public.troca_opcoes o where o.troca_peca_id = tp.id), '[]'::jsonb),
          'escolhas', coalesce((select jsonb_agg(to_jsonb(e) order by e.seq) from public.troca_escolhas e where e.troca_peca_id = tp.id), '[]'::jsonb),
          'valores', coalesce((select jsonb_agg(to_jsonb(v)) from public.v_troca_valores v where v.troca_peca_id = tp.id), '[]'::jsonb),
          'carrinho', (select to_jsonb(c) from public.v_troca_carrinho c where c.troca_peca_id = tp.id),
          'coberto', (select cv.coberto from public.v_cobertura_troca_peca cv where cv.troca_peca_id = tp.id),
          'cliente_paga', (select (greatest(tp.resultado_diferenca, 0) - cv.coberto) from public.v_cobertura_troca_peca cv
                            where cv.troca_peca_id = tp.id and tp.resultado_diferenca is not null)
        ) order by tp.created_at) from public.troca_pecas tp where tp.troca_id = t.id), '[]'::jsonb),
      'resumo', (select to_jsonb(r) from public.v_troca_resumo r where r.troca_id = t.id))
    from public.trocas t
    where t.id = v_troca);
end $$;
revoke all on function public.troca_painel(uuid) from public, anon;
grant execute on function public.troca_painel(uuid) to authenticated;

-- Página da cliente (anon, limite de 3 s) e romaneio: plano guardado desde a primeira chamada.
alter function public.troca_publica(uuid) set plan_cache_mode = force_generic_plan;
alter function public.romaneio_publico(uuid) set plan_cache_mode = force_generic_plan;
