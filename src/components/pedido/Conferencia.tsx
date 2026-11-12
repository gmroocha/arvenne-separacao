import { ArrowLeftRight, Check, PackageX, Trash2 } from "lucide-react"
import { ConcluirEtapa } from "@/components/comum/ConcluirEtapa"
import { TituloSecao } from "@/components/comum/TituloSecao"
import { Button } from "@/components/ui/button"
import type { AcaoItem, PedidoDetalhe } from "@/lib/api"
import { etapaCompleta } from "@/lib/etapa"
import type { Item } from "@/lib/tipos"
import AvisoConferencia from "./AvisoConferencia"
import Problemas from "./Problemas"
import { FaixaFeitas, GradePecas, InstrucaoTile, MenuPeca, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"

type Props = { pedido: PedidoDetalhe; acao: AcaoItem; aoTrocar: (item: Item) => void; aoConcluir?: () => void }

// Pega o saquinho do modelo, separa a quantidade certa e confere defeitos (peça com problema vai como falta).
export default function Conferencia({ pedido, acao, aoTrocar, aoConcluir }: Props) {
  const achadas = pedido.pedido_itens.filter((i) => i.status === "encontrado")
  const aConferir = achadas.filter((i) => !i.conferido_em)
  const conferidas = achadas.filter((i) => i.conferido_em)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ProgressoEtapa titulo="Conferência" feitas={conferidas.length} total={achadas.length} unidade="peças" />
        <AvisoConferencia />
      </div>

      <Problemas pedido={pedido} acao={acao} aoTrocar={aoTrocar} />

      <section className="flex flex-col gap-2" aria-label="A conferir">
        <TituloSecao as="h3" contagem={aConferir.length}>
          A conferir
        </TituloSecao>
        {aConferir.length === 0 ? (
          <Vazio>Nenhuma peça a conferir.</Vazio>
        ) : (
          <GradePecas>
            {aConferir.map((i) => (
              <TilePeca
                key={i.id}
                item={i}
                instrucao={<InstrucaoTile>Separe {i.qtd}</InstrucaoTile>}
              >
                <Button size="bloco" className="flex-1" onClick={() => acao(i, { conferido_em: new Date().toISOString() })}>
                  <Check /> Conferida
                </Button>
                <MenuPeca
                  itens={[
                    { rotulo: "Falta", icone: PackageX, aoClicar: () => acao(i, { status: "falta" }) },
                    { rotulo: "Trocar", icone: ArrowLeftRight, aoClicar: () => aoTrocar(i) },
                    { rotulo: "Remover", icone: Trash2, destrutivo: true, aoClicar: () => acao(i, { status: "removido", observacao: "cliente desistiu" }) },
                  ]}
                />
              </TilePeca>
            ))}
          </GradePecas>
        )}
      </section>

      <FaixaFeitas titulo="Conferidas" itens={conferidas} aoDesfazer={(i) => acao(i, { conferido_em: null })} />

      {aoConcluir && (
        <ConcluirEtapa disabled={!etapaCompleta("conferencia", pedido.pedido_itens)} onClick={aoConcluir}>
          Concluir conferência
        </ConcluirEtapa>
      )}
    </div>
  )
}
