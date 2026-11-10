import { ArrowLeftRight, Check, PackageX, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AcaoItem, PedidoDetalhe } from "@/lib/api"
import { etapaCompleta } from "@/lib/etapa"
import type { Item } from "@/lib/tipos"
import AvisoConferencia from "./AvisoConferencia"
import { FaixaFeitas, GradePecas, MenuPeca, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"

type Props = { pedido: PedidoDetalhe; acao: AcaoItem; aoTrocar: (item: Item) => void; aoConcluir: () => void }

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

      <section className="flex flex-col gap-2" aria-label="A conferir">
        <h3 className="text-sm font-semibold">A conferir ({aConferir.length})</h3>
        {aConferir.length === 0 ? (
          <Vazio>Nenhuma peça a conferir.</Vazio>
        ) : (
          <GradePecas>
            {aConferir.map((i) => (
              <TilePeca
                key={i.id}
                item={i}
                instrucao={
                  <div className="rounded-lg bg-primary/10 px-2 py-1.5 text-center text-lg font-semibold text-primary tabular-nums">
                    Separe {i.qtd}
                  </div>
                }
              >
                <Button className="h-10 flex-1 text-sm" onClick={() => acao(i, { conferido_em: new Date().toISOString() })}>
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

      <Button className="h-11 w-full text-base" disabled={!etapaCompleta("conferencia", pedido.pedido_itens)} onClick={aoConcluir}>
        Concluir conferência
      </Button>
    </div>
  )
}
