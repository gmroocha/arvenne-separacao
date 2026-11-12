import { useState } from "react"
import { matchPath } from "react-router"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import RespDialog from "@/components/RespDialog"
import { useEnviarFeedback } from "@/lib/api"

type Props = { aberto: boolean; aoMudar: (a: boolean) => void; pagina: string }

// Pedido da tela atual (/pedidos/:id ou /vendas/:id), para o feedback já apontar para ele.
function pedidoDaRota(pagina: string): string | null {
  const m = matchPath("/pedidos/:id", pagina) ?? matchPath("/vendas/:id", pagina)
  const id = m?.params.id
  return id && id !== "nova" ? id : null
}

function Formulario({ pagina, aoEnviado }: { pagina: string; aoEnviado: () => void }) {
  const [texto, setTexto] = useState("")
  const enviar = useEnviarFeedback()
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        autoFocus
        placeholder="O que achou? Algo que atrapalhou, uma ideia, um erro..."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="min-h-28"
      />
      <Button
        size="xl"
        disabled={!texto.trim() || enviar.isPending}
        onClick={() =>
          enviar.mutate({ texto: texto.trim(), pagina, pedido_id: pedidoDaRota(pagina) }, { onSuccess: aoEnviado })
        }
      >
        {enviar.isPending && <Spinner />} Enviar feedback
      </Button>
    </div>
  )
}

export default function FeedbackDialog({ aberto, aoMudar, pagina }: Props) {
  return (
    <RespDialog aberto={aberto} aoMudar={aoMudar} titulo="Feedback" descricao="Fica guardado e visível para toda a equipe, junto com a tela em que você estava.">
      {aberto && <Formulario pagina={pagina} aoEnviado={() => aoMudar(false)} />}
    </RespDialog>
  )
}
