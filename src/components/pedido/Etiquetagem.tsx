import { Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AcaoItem, PedidoDetalhe } from "@/lib/api"
import { etapaCompleta } from "@/lib/etapa"
import { FaixaFeitas, GradePecas, ProgressoEtapa, TilePeca, Vazio } from "./TilePeca"

type Props = { pedido: PedidoDetalhe; acao: AcaoItem; aoConcluir: () => void }

// Etiquetagem peça por peça: algumas já vêm etiquetadas do fornecedor ("Já tinha etiqueta").
export default function Etiquetagem({ pedido, acao, aoConcluir }: Props) {
  const achadas = pedido.pedido_itens.filter((i) => i.status === "encontrado")
  const aEtiquetar = achadas.filter((i) => !i.etiquetado_em)
  const feitas = achadas.filter((i) => i.etiquetado_em)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ProgressoEtapa titulo="Etiquetagem" feitas={feitas.length} total={achadas.length} unidade="peças" />
        <p className="text-sm text-muted-foreground">Coloque a etiqueta em cada peça. Se já veio etiquetada, marque "Já tinha etiqueta".</p>
        {/* Futuro: botão "Imprimir etiquetas pendentes (n)" para a impressora Zebra (ZPL via Zebra Browser Print).
            Entra aqui, acima da grade, quando tivermos modelo da impressora e tamanho da etiqueta. */}
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
                <Button
                  className="h-11 w-full text-base"
                  onClick={() => acao(i, { etiquetado_em: new Date().toISOString(), etiqueta_previa: false })}
                >
                  <Tag /> Etiquetada
                </Button>
                <Button
                  variant="outline"
                  className="h-11 w-full"
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
        nota={(i) => (i.etiqueta_previa ? "já tinha etiqueta" : null)}
      />

      <Button className="h-11 w-full text-base" disabled={!etapaCompleta("etiquetagem", pedido.pedido_itens)} onClick={aoConcluir}>
        Concluir etiquetagem
      </Button>
    </div>
  )
}
