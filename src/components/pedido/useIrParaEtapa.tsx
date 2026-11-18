import { useState, type ReactNode } from "react"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { passosDe, type StatusPedido } from "@/lib/status"

// Etapas em que cada peça anda sozinha: abrem sempre, com as peças que já chegaram lá.
const ETAPAS_DE_PECA = ["separacao", "conferencia", "bipagem"]

const lista = (nomes: string[]) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}` : nomes[0])

// Ir para uma etapa só muda o que aparece na tela (a "vista"), nunca o status do pedido. Etapas de peça abrem sempre; as de
// documentos à frente da atual pedem aviso (Dialog) antes de abrir. Serve à linha de etapas e à barra inferior.
export function useIrParaEtapa(atual: number, aoVer: (vista: StatusPedido | null) => void, origem?: string | null): { ir: (i: number) => void; dialogo: ReactNode } {
  const PASSOS = passosDe(origem)
  const [bloqueada, setBloqueada] = useState<number | null>(null) // etapa à frente que a pessoa tentou abrir
  const ir = (i: number) => {
    if (atual < 0) return
    if (i === atual) return aoVer(null)
    if (i > atual && !ETAPAS_DE_PECA.includes(PASSOS[i].id)) return setBloqueada(i)
    aoVer(PASSOS[i].id)
  }
  const faltam = bloqueada !== null ? PASSOS.slice(atual, bloqueada).map((p) => p.nome) : []
  const dialogo = (
    <RespDialog
      aberto={bloqueada !== null}
      aoMudar={(a) => !a && setBloqueada(null)}
      titulo="Etapa ainda não liberada"
      descricao={bloqueada !== null ? `Para chegar em ${PASSOS[bloqueada].nome}, conclua antes: ${lista(faltam)}.` : undefined}
    >
      <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse sm:justify-start">
        <Button size="toque" onClick={() => setBloqueada(null)}>
          Ok
        </Button>
        <Button
          size="toque"
          variant="outline"
          onClick={() => {
            if (bloqueada !== null) aoVer(PASSOS[bloqueada].id)
            setBloqueada(null)
          }}
        >
          Ver mesmo assim
        </Button>
      </div>
    </RespDialog>
  )
  return { ir, dialogo }
}
