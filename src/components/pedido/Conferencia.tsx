import { ArrowLeftRight, Check, PackageX, Trash2 } from "lucide-react"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { Button } from "@/components/ui/button"
import type { AcaoItem, PedidoDetalhe } from "@/lib/api"
import type { Item } from "@/lib/tipos"
import AvisoConferencia from "./AvisoConferencia"
import { useFeedbackPeca } from "./useFeedbackPeca"
import { useEtiquetaPeca } from "@/components/etiquetas/useEtiquetaPeca"
import { useNotaPeca } from "@/components/pedido/useNotaPeca"
import Problemas from "./Problemas"
import { FaixaFeitas, GradePecas, InstrucaoTile, MenuPeca, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"

type Props = { pedido: PedidoDetalhe; acao: AcaoItem; aoTrocar: (item: Item) => void }

// Pega o saquinho do modelo, separa a quantidade certa, confere defeitos (peça com problema vai como falta) e cola a
// etiqueta. "Conferida" leva a peça para a Bipagem; o pedido segue sozinho quando todas estiverem conferidas.
export default function Conferencia({ pedido, acao, aoTrocar }: Props) {
  const achadas = pedido.pedido_itens.filter((i) => i.status === "encontrado")
  const aConferir = achadas.filter((i) => !i.conferido_em)
  const conferidas = achadas.filter((i) => i.conferido_em)
  const naSeparacao = pedido.pedido_itens.filter((i) => i.status === "pendente").length
  const feedback = useFeedbackPeca()
  const nota = useNotaPeca()
  const etiqueta = useEtiquetaPeca()

  const tile = (i: Item) => (
    <TilePeca
      key={i.id}
      item={i}
      instrucao={
        <>
          <InstrucaoTile>Separe {i.qtd}</InstrucaoTile>
          <p className="text-center text-xs text-muted-foreground">Confira e cole a etiqueta</p>
        </>
      }
    >
      <Button size="bloco" className="flex-1" onClick={() => acao(i, { conferido_em: new Date().toISOString() })}>
        <Check /> Conferida
      </Button>
      <MenuPeca
        itens={[
          { rotulo: "Falta", icone: PackageX, aoClicar: () => acao(i, { status: "falta" }) },
          { rotulo: "Trocar", icone: ArrowLeftRight, aoClicar: () => aoTrocar(i) },
          etiqueta.acao(i),
          nota.acao(i),
          feedback.acao(i),
          { rotulo: "Remover", icone: Trash2, destrutivo: true, aoClicar: () => acao(i, { status: "removido", observacao: "cliente desistiu" }) },
        ]}
      />
    </TilePeca>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ProgressoEtapa titulo="Conferência" feitas={conferidas.length} total={achadas.length} unidade="peças" />
        <AvisoConferencia />
        {naSeparacao > 0 && (
          <p className="text-sm text-muted-foreground">
            {naSeparacao === 1 ? "1 peça ainda está na Separação" : `${naSeparacao} peças ainda estão na Separação`}: elas chegam aqui quando você marcar "Achei".
          </p>
        )}
      </div>

      <Problemas pedido={pedido} acao={acao} aoTrocar={aoTrocar} />

      <section className="flex flex-col gap-2" aria-label="A conferir">
        <TituloSecao as="h3" contagem={aConferir.length}>
          A conferir
        </TituloSecao>
        {aConferir.length === 0 ? (
          <Vazio>{achadas.length === 0 ? "Nenhuma peça chegou da Separação ainda." : "Nenhuma peça a conferir."}</Vazio>
        ) : (
          <GradePecas>{aConferir.map(tile)}</GradePecas>
        )}
      </section>

      {feedback.dialogo}

      {nota.dialogo}
      {etiqueta.dialogo}

      <FaixaFeitas titulo="Conferidas" itens={conferidas} aoDesfazer={(i) => acao(i, { conferido_em: null })} aoDesfazerTudo={() => conferidas.forEach((i) => acao(i, { conferido_em: null }))} />
    </div>
  )
}
