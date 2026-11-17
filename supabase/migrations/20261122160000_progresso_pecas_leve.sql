-- V78: Achei/Conferida/Etiquetada/+1 só avançam o trabalho. Não precisam somar novamente todas as
-- peças e avaliar as regras de retorno a cada clique. Preserva a trava de pedido arquivado, a ordem
-- de bloqueio e a reavaliação completa em inserções, restaurações, mudanças de quantidade e desfazer.
create or replace function public.tg_trabalho_reaberto() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids uuid[];
  v_reavaliar uuid[];
  v record;
begin
  if tg_op='UPDATE' then
    if exists (
      select 1 from novos n join antigos a using(id)
      where n.pedido_id<>a.pedido_id and not exists (
        select 1 from public.pedidos s where s.id=a.pedido_id and s.status='somada'
          and s.somar_em=n.pedido_id and n.adicional and n.venda_origem_id=s.id)) then
      raise exception 'Peças só mudam de pedido pela operação de somar uma venda';
    end if;
    select array_agg(distinct n.pedido_id) into v_ids from novos n join antigos a using(id)
    where (n.pedido_id,n.status,n.qtd,n.conferido_em,n.etiquetado_em,n.qtd_bipada)
      is distinct from (a.pedido_id,a.status,a.qtd,a.conferido_em,a.etiquetado_em,a.qtd_bipada);

    select array_agg(distinct n.pedido_id) into v_reavaliar from novos n join antigos a using(id)
    where n.pedido_id is distinct from a.pedido_id or n.qtd is distinct from a.qtd
       or (n.status is distinct from a.status and not (n.status='encontrado' and a.status<>'removido'))
       or (a.conferido_em is not null and n.conferido_em is null)
       or (a.etiquetado_em is not null and n.etiquetado_em is null)
       or n.qtd_bipada < a.qtd_bipada;
  else
    select array_agg(distinct pedido_id) into v_ids from novos;
    v_reavaliar := v_ids;
  end if;
  if v_ids is null then return null; end if;
  for v in select id,status from public.pedidos where id=any(v_ids) order by id for update loop
    if v.status in ('enviado','cancelado','perdida','somada') then
      raise exception 'Este pedido está arquivado (%); não é possível reabrir ou acrescentar peças',v.status;
    end if;
    -- Etapas posteriores conservam todas as verificações, inclusive acerto financeiro.
    if v.status not in ('novo','separacao','conferencia','etiquetagem','bipagem')
       or v.id=any(coalesce(v_reavaliar,'{}'::uuid[])) then
      perform public.reavaliar_etapa(v.id);
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.tg_trabalho_reaberto() from public, anon, authenticated, service_role;
