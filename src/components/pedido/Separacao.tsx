import { useState } from "react"
import { ArrowLeftRight, Check, Info, PackageX, Trash2 } from "lucide-react"
import { Quantidade } from "@/components/comum/Quantidade"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { ConcluirEtapa } from "@/components/comum/ConcluirEtapa"
import RespDialog from "@/components/RespDialog"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useMarcarFalta, type AcaoItem, type PedidoDetalhe } from "@/lib/api"
import { etapaCompleta, separarAdicionais } from "@/lib/etapa"
import { quando, reais } from "@/lib/formato"
import { chaveModelo, numeroTamanho, separarTamanho } from "@/lib/variante"
import type { Item } from "@/lib/tipos"
import LinhaPeca from "./LinhaPeca"
import Problemas from "./Problemas"
import { FaixaFeitas, GradePecas, MenuPeca, ProgressoEtapa, TileModelo, TilePeca, Vazio } from "./TilePeca"

type Props = {
  pedido: PedidoDetalhe
  acao: AcaoItem
  aoTrocar: (item: Item) => void
  aoConcluir?: () => void
}

export default function Separacao({ pedido, acao, aoTrocar, aoConcluir }: Props) {
  const itens = pedido.pedido_itens
  const pendentes = itens.filter((i) => i.status === "pendente")
  const achadas = itens.filter((i) => i.status === "encontrado")
  const removidas = itens.filter((i) => i.status === "removido")
  const vivas = itens.length - removidas.length
  // Tamanhos do mesmo modelo (mesmo produto e mesma pedra/cor) viram um bloco só; sem tamanho, um bloco por peça.
  // As peças adicionais (vieram de uma venda somada) ficam depois de um divisor: o agrupamento vale só dentro de cada metade.
  const agrupar = (pendentes: Item[]) => {
    const grupos = new Map<string, Item[]>()
    for (const i of pendentes) {
      if (!separarTamanho(i.variante).tamanho) continue
      const k = chaveModelo(i.nome, i.variante)
      grupos.set(k, [...(grupos.get(k) ?? []), i])
    }
    const vistos = new Set<string>()
    const saida: Item[][] = []
    for (const i of pendentes) {
      const k = chaveModelo(i.nome, i.variante)
      const g = grupos.get(k)
      if (!g || g.length < 2) saida.push([i])
      else if (!vistos.has(k)) {
        vistos.add(k)
        saida.push([...g].sort((a, b) => numeroTamanho(separarTamanho(a.variante).tamanho) - numeroTamanho(separarTamanho(b.variante).tamanho)))
      }
    }
    return saida
  }
  const { normais, adicionais } = separarAdicionais(pendentes)
  const blocos = agrupar(normais)
  const blocosAdicionais = agrupar(adicionais)
  const marcar = (item: Item, status: Item["status"], observacao?: string | null) =>
    acao(item, observacao === undefined ? { status } : { status, observacao })

  // "Em falta" em peça com 2 ou mais: pergunta quantas faltam (o banco divide a linha). Com 1, direto.
  const marcarFalta = useMarcarFalta(pedido.id)
  const [faltaItem, setFaltaItem] = useState<Item | null>(null)
  const [faltam, setFaltam] = useState(1)
  const pedirFalta = (i: Item) => {
    if (i.qtd >= 2) {
      setFaltam(1)
      setFaltaItem(i)
    } else marcar(i, "falta")
  }
  function confirmarFalta(n: number) {
    const i = faltaItem
    if (!i) return
    setFaltaItem(null)
    if (n >= i.qtd) marcar(i, "falta")
    else marcarFalta.mutate({ item: i, qtd: n })
  }

  const [verPartes, setVerPartes] = useState(false)
  const bloco = (g: Item[]) =>
              g.length === 1 ? (
                <TilePeca key={g[0].id} item={g[0]}>
                  <Button size="bloco" className="flex-1" onClick={() => acao(g[0], { status: "encontrado" })}>
                    <Check /> Achei
                  </Button>
                  <MenuPeca
                    itens={[
                      { rotulo: "Falta", icone: PackageX, aoClicar: () => pedirFalta(g[0]) },
                      { rotulo: "Trocar", icone: ArrowLeftRight, aoClicar: () => aoTrocar(g[0]) },
                      { rotulo: "Remover", icone: Trash2, destrutivo: true, aoClicar: () => marcar(g[0], "removido", "cliente desistiu") },
                    ]}
                  />
                </TilePeca>
              ) : (
                <TileModelo key={g[0].id} itens={g}>
                  {/* Uma chamada por tamanho (cada uma grava o seu evento); a etapa só completa na última. */}
                  <Button size="bloco" className="flex-1" onClick={() => g.forEach((i) => acao(i, { status: "encontrado" }))}>
                    <Check /> Achei
                  </Button>
                  {/* Uma seção por tamanho: título "N°16 · 2 un." e as ações embaixo. */}
                  <MenuPeca
                    rotulo="Ações por tamanho"
                    grupos={g.map((i) => ({
                      titulo: `${separarTamanho(i.variante).tamanho ?? i.variante ?? i.sku ?? i.nome}${i.qtd > 1 ? ` · ${i.qtd} un.` : ""}`,
                      itens: [
                        { rotulo: "Em falta", icone: PackageX, aoClicar: () => pedirFalta(i) },
                        { rotulo: "Trocar", icone: ArrowLeftRight, aoClicar: () => aoTrocar(i) },
                        { rotulo: "Remover", icone: Trash2, destrutivo: true, aoClicar: () => marcar(i, "removido", "cliente desistiu") },
                      ],
                    }))}
                  />
                </TileModelo>
              )

  return (
    <div className="flex flex-col gap-4">
      <ProgressoEtapa titulo="Separação" feitas={achadas.length} total={vivas} unidade="peças" />

      <Problemas pedido={pedido} acao={acao} aoTrocar={aoTrocar} />

      <section className="flex flex-col gap-2" aria-label="A encontrar">
        <TituloSecao as="h3" contagem={pendentes.length}>
          A encontrar
        </TituloSecao>
        {pendentes.length === 0 ? (
          <Vazio>{itens.length === 0 ? "Este pedido ainda não tem peças." : "Nenhuma peça pendente."}</Vazio>
        ) : (
          <>
            {blocos.length > 0 && <GradePecas>{blocos.map(bloco)}</GradePecas>}
            {adicionais.length > 0 && (
              <>
                <Separator className="my-1" />
                {/* Os valores da venda somada só aparecem atrás do (i): a separação não mostra dinheiro. */}
                <TituloSecao
                  as="h3"
                  contagem={adicionais.length}
                  acao={
                    <Button variant="ghost" size="icon-toque" aria-label="Sobre as peças adicionais" onClick={() => setVerPartes(true)}>
                      <Info />
                    </Button>
                  }
                >
                  Peças adicionais
                </TituloSecao>
                <GradePecas>{blocosAdicionais.map(bloco)}</GradePecas>
              </>
            )}
          </>
        )}
      </section>

      <FaixaFeitas titulo="Encontradas" itens={achadas} aoDesfazer={(i) => marcar(i, "pendente")} aoDesfazerTudo={() => achadas.forEach((i) => marcar(i, "pendente"))} />

      {removidas.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 h-9 text-muted-foreground">
              Removidas ({removidas.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-1.5 pt-1">
            {removidas.map((i) => (
              <LinhaPeca key={i.id} item={i} compacta esmaecida>
                <Button variant="ghost" size="toque" onClick={() => marcar(i, "pendente", null)}>
                  Restaurar
                </Button>
              </LinhaPeca>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}

      <RespDialog aberto={verPartes} aoMudar={setVerPartes} titulo="Peças adicionais" descricao="Vendas somadas a este pedido">
        <ul className="flex flex-col gap-3 pt-2">
          {(pedido.partes ?? []).map((p) => (
            <li key={p.id} className="flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <span className="font-semibold">Venda {p.numero}</span>
              <span className="text-muted-foreground tabular-nums">
                {[p.pago_em ? `paga ${quando(p.pago_em)}` : null, p.forma_pagamento, reais(p.valor_pago), `${p.qtd_pecas} ${p.qtd_pecas === 1 ? "peça" : "peças"}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </RespDialog>

      <RespDialog aberto={!!faltaItem} aoMudar={(a) => !a && setFaltaItem(null)} titulo="Quantas faltam?" descricao={faltaItem ? `${faltaItem.sku ?? faltaItem.nome} · o pedido tem ${faltaItem.qtd}` : undefined}>
        {faltaItem && (
          <div className="flex flex-col gap-5 pt-2">
            <Quantidade tamanho="grande" valor={faltam} min={1} max={faltaItem.qtd} de={faltaItem.qtd} rotulo="uma" aoMudar={setFaltam} />
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-center text-sm text-muted-foreground">
              {faltam >= faltaItem.qtd ? "Todas as unidades vão para a troca." : `${faltaItem.qtd - faltam} ${faltaItem.qtd - faltam === 1 ? "segue" : "seguem"} na separação e ${faltam} ${faltam === 1 ? "vai" : "vão"} para a troca.`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="xl" onClick={() => confirmarFalta(faltaItem.qtd)}>
                Todas ({faltaItem.qtd})
              </Button>
              <Button size="xl" onClick={() => confirmarFalta(faltam)}>
                <Check /> Confirmar {faltam}
              </Button>
            </div>
          </div>
        )}
      </RespDialog>


      {aoConcluir && (
        <ConcluirEtapa disabled={!etapaCompleta(pedido.status, itens)} onClick={aoConcluir}>
          Concluir separação
        </ConcluirEtapa>
      )}
    </div>
  )
}
