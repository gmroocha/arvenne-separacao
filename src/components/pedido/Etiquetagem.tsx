import { ArrowLeftRight, MoreHorizontal, PackageX, Printer, Tag, Trash2, TriangleAlert } from "lucide-react"
import MenuAcoes from "@/components/MenuAcoes"
import { useImprimirEtiquetas } from "@/components/etiquetas/useImprimirEtiquetas"
import { etiquetasDe, skuCabe } from "@/lib/etiquetas"
import type { Item } from "@/lib/tipos"
import { ConcluirEtapa } from "@/components/comum/ConcluirEtapa"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { AcaoItem, PedidoDetalhe } from "@/lib/api"
import { etapaCompleta } from "@/lib/etapa"
import Problemas from "./Problemas"
import { FaixaFeitas, GradePecas, MenuPeca, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"

type Props = { pedido: PedidoDetalhe; acao: AcaoItem; aoTrocar: (item: Item) => void; aoConcluir?: () => void }

// Etiquetagem peça por peça: imprime, cola no saquinho e marca "Etiquetada" (sempre à mão).
export default function Etiquetagem({ pedido, acao, aoTrocar, aoConcluir }: Props) {
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
          <Button size="xl" className="min-w-0 flex-1 sm:flex-none" disabled={todas.etiquetas.length === 0 || imprimindo} onClick={() => imprimir(grupoDe(aEtiquetar))}>
            <Printer /> Imprimir etiquetas ({todas.etiquetas.length}){zebra && <span className="font-normal opacity-80"> · na Zebra</span>}
          </Button>
          <MenuAcoes
            titulo="Etiquetas"
            grupos={[{ itens: [{ rotulo: "Imprimir etiqueta de teste", icone: Printer, aoClicar: () => imprimirTeste() }] }]}
            gatilho={
              <Button variant="secondary" size="icon-toque" aria-label="Mais opções de impressão" className="shrink-0">
                <MoreHorizontal />
              </Button>
            }
          />
        </div>
        {todas.semCodigo.length > 0 && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>
              {todas.semCodigo.length === 1 ? "1 peça está sem código (SKU) e não será impressa." : `${todas.semCodigo.length} peças estão sem código (SKU) e não serão impressas.`}
            </AlertDescription>
          </Alert>
        )}
        {longos.length > 0 && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>O código {longos.map((i) => i.sku).join(", ")} é longo demais para a etiqueta e pode não ler. Confira ao imprimir.</AlertDescription>
          </Alert>
        )}
      </div>

      <Problemas pedido={pedido} acao={acao} aoTrocar={aoTrocar} />

      <section className="flex flex-col gap-2" aria-label="A etiquetar">
        <TituloSecao as="h3" contagem={aEtiquetar.length}>
          A etiquetar
        </TituloSecao>
        {aEtiquetar.length === 0 ? (
          <Vazio>Nenhuma peça a etiquetar.</Vazio>
        ) : (
          <GradePecas>
            {aEtiquetar.map((i) => (
              <TilePeca key={i.id} item={i}>
                <div className="flex w-full items-center gap-1.5">
                  <Button
                    size="bloco"
                    className="min-w-0 flex-1"
                    onClick={() => acao(i, { etiquetado_em: new Date().toISOString(), etiqueta_previa: false })}
                  >
                    <Tag /> Etiquetada
                  </Button>
                  <MenuPeca
                    itens={[
                      { rotulo: "Imprimir esta etiqueta", icone: Printer, desabilitado: !i.sku || imprimindo, aoClicar: () => imprimir(grupoDe([i])) },
                      { rotulo: "Falta", icone: PackageX, aoClicar: () => acao(i, { status: "falta" }) },
                      { rotulo: "Trocar", icone: ArrowLeftRight, aoClicar: () => aoTrocar(i) },
                      { rotulo: "Remover", icone: Trash2, destrutivo: true, aoClicar: () => acao(i, { status: "removido", observacao: "cliente desistiu" }) },
                    ]}
                  />
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
      />

      {dialogo}

      {aoConcluir && (
        <ConcluirEtapa disabled={!etapaCompleta("etiquetagem", pedido.pedido_itens)} onClick={aoConcluir}>
          Concluir etiquetagem
        </ConcluirEtapa>
      )}
    </div>
  )
}
