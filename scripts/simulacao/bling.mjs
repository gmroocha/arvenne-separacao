// Função Edge `bling` de mentira para a simulação e os testes e2e: nenhuma chamada ao Bling, ao Supabase real ou a segredo.
// Responde no mesmo formato da função de verdade (supabase/functions/bling), com um "Bling" fictício em memória
// (`estado.produtos`: código -> { id, nome, preco }) e grava só no banco em memória da simulação.
// O que cada ação recebe fica em `estado.chamadas`, para o teste conferir o que a tela enviou.

export function criarEstadoBling() {
  return { produtos: {}, chamadas: [], contatos: [], proximoNumero: 5001, erro: null, papel: undefined }
}

const total = (linhas) => Math.round(linhas.reduce((s, l) => s + Math.round(l.valor * 100) * l.qtd, 0)) / 100

export async function responderBling(dados, { banco, estado, cors }) {
  estado.chamadas.push(dados)
  const resp = (status, json) => ({ status, json, headers: cors })
  const ok = (extra = {}) => resp(200, { ok: true, ...extra })
  if (estado.erro) return resp(estado.erro.status ?? 502, { erro: estado.erro.mensagem })
  const gestor = estado.papel !== "funcionaria"
  const gestorSo = ["conectar_inicio", "conectar_fim", "contatos", "definir_contato", "salvar_codigo", "apagar_codigo"]
  if ((gestorSo.includes(dados.acao) || ((dados.acao === "preparar" || dados.acao === "gerar") && !dados.pedido_id)) && !gestor)
    return resp(403, { erro: "Só o gestor pode fazer isso." })

  if (dados.acao === "conectar_inicio") return ok({ url: "https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=ficticio&state=ficticio" })
  if (dados.acao === "conectar_fim") {
    await banco.query(`insert into bling_conexao(id, access_token, refresh_token, expira_em, conectado_em) values (true,'t','r', now() + interval '6 hours', now())
      on conflict (id) do update set access_token='t', refresh_token='r', expira_em=now() + interval '6 hours', conectado_em=now()`)
    return ok()
  }
  if (dados.acao === "contatos") return ok({ contatos: estado.contatos })
  if (dados.acao === "definir_contato") {
    await banco.query("update bling_conexao set contato_id=$1, contato_nome=$2 where id", [dados.id, dados.nome])
    return ok()
  }
  if (dados.acao === "salvar_codigo") {
    await banco.query("insert into bling_codigos(sku, codigo_bling) values ($1,$2) on conflict (sku) do update set codigo_bling=excluded.codigo_bling", [dados.sku, dados.codigo])
    return ok()
  }
  if (dados.acao === "apagar_codigo") {
    await banco.query("delete from bling_codigos where sku=$1", [dados.sku])
    return ok()
  }

  if (dados.acao === "preparar" || dados.acao === "gerar") {
    const mapa = Object.fromEntries((await banco.query("select sku, codigo_bling from bling_codigos")).rows.map((r) => [r.sku, r.codigo_bling]))
    const linhas = (dados.itens ?? []).map((i) => {
      const sku = i.sku ?? null
      const escrito = (i.codigo ?? "").trim()
      const codigo = dados.acao === "preparar" ? (escrito && escrito !== sku ? escrito : (sku && mapa[sku]) || escrito || sku || "") : escrito
      const p = estado.produtos[codigo]
      return { sku, codigo, qtd: i.qtd, p, valor: i.valor ?? p?.preco ?? null, lembrado: !!(sku && mapa[sku] && codigo === mapa[sku]) }
    })
    const anterior = dados.pedido_id
      ? (await banco.query("select bling_numero, bling_id, criado_em from bling_pedidos where pedido_id=$1 order by criado_em desc limit 1", [dados.pedido_id])).rows[0]
      : null
    const soma = total(linhas.filter((l) => l.p).map((l) => ({ qtd: l.qtd, valor: l.valor })))
    if (dados.acao === "preparar") {
      return ok({
        ja_gerado: anterior ? { numero: anterior.bling_numero, bling_id: Number(anterior.bling_id), criado_em: anterior.criado_em } : null,
        linhas: linhas.map((l) => ({ sku: l.sku, codigo: l.codigo, qtd: l.qtd, lembrado: l.lembrado, achou: !!l.p, descricao: l.p?.nome ?? null, valor: l.p ? l.valor : null, valor_bling: l.p?.preco ?? null })),
        total: soma,
      })
    }
    if (anterior && dados.confirmar_repetido !== true) return resp(409, { erro: `Este pedido já foi gerado no Bling (nº ${anterior.bling_numero}). Confirme para gerar outro.` })
    const faltam = linhas.filter((l) => !l.p).map((l) => l.codigo)
    if (faltam.length) return resp(400, { erro: `Não achei no Bling: ${faltam.join(", ")}. Corrija o código e confira de novo.` })
    const numero = String(estado.proximoNumero++)
    await banco.query("insert into bling_pedidos(pedido_id, bling_id, bling_numero, itens, total, criado_por) values ($1,$2,$3,$4,$5,'Teste')",
      [dados.pedido_id ?? null, 90000 + estado.proximoNumero, numero, JSON.stringify(linhas.map((l) => ({ sku: l.sku, codigo: l.codigo, descricao: l.p.nome, qtd: l.qtd, valor: l.valor }))), soma])
    for (const l of dados.lembrar ?? [])
      await banco.query("insert into bling_codigos(sku, codigo_bling) values ($1,$2) on conflict (sku) do update set codigo_bling=excluded.codigo_bling", [l.sku, l.codigo])
    if (dados.pedido_id) await banco.query("update pedidos set pedido_fornecedor_numero=$2, pedido_fornecedor_em=coalesce(pedido_fornecedor_em, now()) where id=$1", [dados.pedido_id, numero])
    return ok({ bling_id: 90000 + estado.proximoNumero, numero, total: soma, avisos: [] })
  }
  return resp(400, { erro: "Ação desconhecida." })
}
