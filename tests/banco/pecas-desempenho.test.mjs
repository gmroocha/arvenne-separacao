import { expect, test } from "vitest"
import { db, one } from "./suporte.mjs"

test("V78: avançar as peças não recalcula as regras de retorno do pedido a cada unidade", async () => {
  const p = await one("insert into pedidos(origem,status,cliente_nome) values('whatsapp','novo','Teste') returning id")
  const i = await one("insert into pedido_itens(pedido_id,origem,nome,sku,qtd,preco) values($1,'avulso','Peça','PC-1',10,10) returning id", [p.id])
  // Instrumenta a função real, sem usar tempos frágeis para medir desempenho.
  await db.exec(`alter function public.reavaliar_etapa(uuid) rename to reavaliar_etapa_original;
    create temp table reavaliacoes (pedido uuid);
    create function public.reavaliar_etapa(p_pedido uuid) returns void language plpgsql as $$
    begin insert into reavaliacoes values(p_pedido); perform public.reavaliar_etapa_original(p_pedido); end $$;`)
  await one("select alterar_item($1,'{\"status\":\"encontrado\"}')", [i.id])
  await db.query("update pedidos set status='conferencia' where id=$1", [p.id])
  await one("select alterar_item($1,jsonb_build_object('conferido_em',now()))", [i.id])
  await db.query("update pedidos set status='bipagem' where id=$1", [p.id])
  for (let n = 0; n < 10; n++) await one("select bipar($1,$2,'PC-1')", [p.id, i.id])
  expect(Number((await one("select count(*) n from reavaliacoes")).n)).toBe(0)
  expect((await one("select qtd_bipada from pedido_itens where id=$1", [i.id])).qtd_bipada).toBe(10)
  // Desfazer continua reabrindo o trabalho e retornando à etapa correta.
  await db.query("update pedidos set status='faturamento' where id=$1", [p.id])
  await one("select bipar_ajustar($1,-1)", [i.id])
  expect((await one("select status from pedidos where id=$1", [p.id])).status).toBe("bipagem")
  expect(Number((await one("select count(*) n from reavaliacoes")).n)).toBe(1)
})
