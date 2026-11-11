import { MoreHorizontal, Printer, Tag, TriangleAlert } from "lucide-react"
import MenuAcoes from "@/components/MenuAcoes"
import { useImprimirEtiquetas } from "@/components/etiquetas/useImprimirEtiquetas"
import { etiquetasDe, skuCabe } from "@/lib/etiquetas"
import type { Item } from "@/lib/tipos"
import { Button } from "@/components/ui/button"
import type { AcaoItem, PedidoDetalhe } from "@/lib/api"
import { etapaCompleta } from "@/lib/etapa"
import { FaixaFeitas, GradePecas, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"

type Props = { pedido: PedidoDetalhe; acao: AcaoItem; aoConcluir: () => void }

// Etiquetagem peça por peça: imprime, cola no saquinho e marca "Etiquetada" (sempre à mão).
export default function Etiquetagem({ pedido, acao, aoConcluir }: Props) {
  const achadas = pedido.pedido_itens.filter((i) => i.status === "encontrado")
  const aEtiquetar = achadas.filter((i) => !i.etiquetado_em)
  const feitas = achadas.filter((i) => i.etiquetado_em)
  const { zebra, imprimindo, dialogo, imprimir, imprimirTeste } = useImprimirEtiquetas()

  // Uma etiqueta por unidade. Imprimir não marca nada como etiquetada.
  const grupoDe = (itens: Item[]) => {
    const { etiquetas, itemIds } = etiquetasDe(itens)
    return [{ numero: pedido.numero, cliente: pedido.cliente_nome, etiquetas, itemIds }]
  }
  const todas = etiquetasDe(aEtiquetar)
  const longos = aEtiquetar.filter((i) => i.sku && !skuCabe(i.sku.trim()))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ProgressoEtapa titulo="Etiquetagem" feitas={feitas.length} total={achadas.length} unidade="peças" />
        <p className="text-sm text-muted-foreground">Imprima, cole a etiqueta no saquinho de cada peça e marque "Etiquetada".</p>
        <div className="flex items-center gap-2">
          <Button className="h-11 min-w-0 flex-1 text-sm sm:flex-none" disabled={todas.etiquetas.length === 0 || imprimindo} onClick={() => imprimir(grupoDe(aEtiquetar))}>
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
                <div className="flex w-full items-center gap-1.5">
                  <Button
                    className="h-10 min-w-0 flex-1 text-sm"
                    onClick={() => acao(i, { etiquetado_em: new Date().toISOString(), etiqueta_previa: false })}
                  >
                    <Tag /> Etiquetada
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="size-10 shrink-0"
                    aria-label={`Imprimir etiqueta de ${i.sku ?? i.nome}`}
                    title="Imprimir esta etiqueta"
                    disabled={!i.sku || imprimindo}
                    onClick={() => imprimir(grupoDe([i]))}
                  >
                    <Printer />
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
        aoReimprimir={(i) => imprimir(grupoDe([i]))}
        nota={(i) => (i.etiqueta_previa ? "já tinha etiqueta" : null)}
      />

      {dialogo}

      <Button className="h-11 w-full text-base" disabled={!etapaCompleta("etiquetagem", pedido.pedido_itens)} onClick={aoConcluir}>
        Concluir etiquetagem
      </Button>
    </div>
  )
}
