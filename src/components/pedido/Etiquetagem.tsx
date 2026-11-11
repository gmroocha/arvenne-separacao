import { MoreHorizontal, Printer, Tag, TriangleAlert } from "lucide-react"
import MenuAcoes from "@/components/MenuAcoes"
import { useImprimirEtiquetas } from "@/components/etiquetas/useImprimirEtiquetas"
import { etiquetasDe, skuCabe } from "@/lib/etiquetas"
import type { Item } from "@/lib/tipos"
import { Button } from "@/components/ui/button"
import type { AcaoItem, PedidoDetalhe } from "@/lib/api"
import { etapaCompleta } from "@/lib/etapa"
import { FaixaFeitas, GradePecas, MenuPeca, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"

type Props = { pedido: PedidoDetalhe; acao: AcaoItem; aoConcluir: () => void }

// Etiquetagem peça por peça: algumas já vêm etiquetadas do fornecedor ("Já tinha etiqueta").
export default function Etiquetagem({ pedido, acao, aoConcluir }: Props) {
  const achadas = pedido.pedido_itens.filter((i) => i.status === "encontrado")
  const aEtiquetar = achadas.filter((i) => !i.etiquetado_em)
  const feitas = achadas.filter((i) => i.etiquetado_em)
  const { zebra, imprimindo, dialogo, imprimir, imprimirTeste } = useImprimirEtiquetas()

  // Uma etiqueta por unidade. `marcar` = pergunta "Saiu tudo certo?" no fim; reimpressão não pergunta.
  const grupoDe = (itens: Item[], marcar: boolean) => {
    const { etiquetas, itemIds } = etiquetasDe(itens)
    return [{ numero: pedido.numero, cliente: pedido.cliente_nome, etiquetas, itemIds: marcar ? itemIds : [] }]
  }
  const todas = etiquetasDe(aEtiquetar)
  const longos = aEtiquetar.filter((i) => i.sku && !skuCabe(i.sku.trim()))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ProgressoEtapa titulo="Etiquetagem" feitas={feitas.length} total={achadas.length} unidade="peças" />
        <p className="text-sm text-muted-foreground">Coloque a etiqueta em cada peça. Se já veio etiquetada, marque "Já tinha etiqueta".</p>
        <div className="flex items-center gap-2">
          <Button className="h-11 min-w-0 flex-1 text-sm sm:flex-none" disabled={todas.etiquetas.length === 0 || imprimindo} onClick={() => imprimir(grupoDe(aEtiquetar, true))}>
            <Printer /> Imprimir etiquetas ({todas.etiquetas.length}){zebra && <span className="font-normal opacity-80"> · na Zebra</span>}
          </Button>
          <MenuAcoes
            titulo="Etiquetas"
            grupos={[{ itens: [{ rotulo: "Imprimir etiqueta de teste", icone: Printer, aoClicar: () => imprimirTeste() }] }]}
            gatilho={
              <Button variant="secondary" size="icon" aria-label="Mais opções de impressão" className="size-11 shrink-0">
                <MoreHorizontal />
              </Button>
            }
          />
        </div>
        {todas.semCodigo.length > 0 && (
          <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {todas.semCodigo.length === 1 ? "1 peça está sem código (SKU) e não será impressa." : `${todas.semCodigo.length} peças estão sem código (SKU) e não serão impressas.`}
          </p>
        )}
        {longos.length > 0 && (
          <p className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            O código {longos.map((i) => i.sku).join(", ")} é longo demais para a etiqueta e pode não ler. Confira ao imprimir.
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2" aria-label="A etiquetar">
        <h3 className="text-sm font-semibold">A etiquetar ({aEtiquetar.length})</h3>
        {aEtiquetar.length === 0 ? (
          <Vazio>Nenhuma peça a etiquetar.</Vazio>
        ) : (
          <GradePecas>
            {aEtiquetar.map((i) => (
              <TilePeca key={i.id} item={i}>
                <div className="flex w-full flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Button
                    className="h-10 min-w-0 flex-1 text-sm"
                    onClick={() => acao(i, { etiquetado_em: new Date().toISOString(), etiqueta_previa: false })}
                  >
                    <Tag /> Etiquetada
                  </Button>
                  <MenuPeca
                    itens={[{ rotulo: "Imprimir esta etiqueta", icone: Printer, desabilitado: !i.sku, aoClicar: () => imprimir(grupoDe([i], true)) }]}
                  />
                </div>
                <Button
                  variant="outline"
                  className="h-10 w-full text-sm"
                  onClick={() => acao(i, { etiquetado_em: new Date().toISOString(), etiqueta_previa: true })}
                >
                  Já tinha etiqueta
                </Button>
                </div>
              </TilePeca>
            ))}
          </GradePecas>
        )}
      </section>

      <FaixaFeitas
        titulo="Etiquetadas"
        itens={feitas}
        aoDesfazer={(i) => acao(i, { etiquetado_em: null, etiqueta_previa: false })}
        aoReimprimir={(i) => imprimir(grupoDe([i], false))}
        nota={(i) => (i.etiqueta_previa ? "já tinha etiqueta" : null)}
      />

      {dialogo}

      <Button className="h-11 w-full text-base" disabled={!etapaCompleta("etiquetagem", pedido.pedido_itens)} onClick={aoConcluir}>
        Concluir etiquetagem
      </Button>
    </div>
  )
}
