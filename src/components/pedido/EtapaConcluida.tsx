import { CircleCheck } from "lucide-react"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"

export type Concluida = { de: string; ate: string; agora: string; pedidoConcluido: boolean }

// Aviso curto depois de qualquer avanço do pedido (botão da barra, última peça marcada, botão do documento ou menu):
// "Etapa X concluída → agora Y". "Continuar" fecha o aviso e deixa a tela na etapa nova.
export default function EtapaConcluida({ dados, aoContinuar }: { dados: Concluida | null; aoContinuar: () => void }) {
  const varias = dados !== null && dados.de !== dados.ate
  return (
    <RespDialog
      aberto={dados !== null}
      aoMudar={(a) => !a && aoContinuar()}
      titulo={dados ? (varias ? `Etapas concluídas: ${dados.de} a ${dados.ate}` : `Etapa ${dados.de} concluída`) : "Etapa concluída"}
      descricao={dados ? (dados.pedidoConcluido ? "Agora o pedido está concluído." : `Agora o pedido está em ${dados.agora}.`) : undefined}
    >
      <div className="flex items-center gap-2 py-1 text-sm text-success">
        <CircleCheck className="size-5 shrink-0" aria-hidden />
        <span>{dados ? (dados.pedidoConcluido ? `${dados.de} concluída → pedido concluído` : `${dados.de} concluída → agora ${dados.agora}`) : ""}</span>
      </div>
      <div className="flex flex-col gap-2 pt-3 sm:flex-row-reverse sm:justify-start">
        <Button size="toque" onClick={aoContinuar} autoFocus>
          Continuar
        </Button>
      </div>
    </RespDialog>
  )
}
