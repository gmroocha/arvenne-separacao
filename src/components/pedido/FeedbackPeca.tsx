import { useState } from "react"
import { useLocation } from "react-router"
import { LinhaPeca } from "@/components/comum/Peca"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useEnviarFeedback } from "@/lib/api"
import type { Item } from "@/lib/tipos"

function Formulario({ item, aoEnviado }: { item: Item; aoEnviado: () => void }) {
  const [texto, setTexto] = useState("")
  const { pathname } = useLocation()
  const enviar = useEnviarFeedback()
  return (
    <div className="flex flex-col gap-3">
      <LinhaPeca item={{ foto_url: item.foto_url, nome: item.nome, sku: item.sku, variante: item.variante }} tamanho="lg" />
      <Textarea
        autoFocus
        aria-label="Feedback da peça"
        placeholder="Ex.: a foto está bem diferente da peça, o código não bate, a pedra é de outra cor..."
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="min-h-28"
      />
      <Button
        size="xl"
        disabled={!texto.trim() || enviar.isPending}
        onClick={() =>
          enviar.mutate(
            { texto: texto.trim(), pagina: pathname, pedido_id: item.pedido_id, item_id: item.id, sku: item.sku },
            { onSuccess: aoEnviado },
          )
        }
      >
        {enviar.isPending && <Spinner />} Enviar feedback
      </Button>
    </div>
  )
}

// Janela "Feedback da peça": aberta com a peça escolhida, fecha sozinha ao enviar.
export default function FeedbackPeca({ item, aoFechar }: { item: Item | null; aoFechar: () => void }) {
  return (
    <RespDialog
      aberto={item !== null}
      aoMudar={(a) => !a && aoFechar()}
      titulo="Feedback da peça"
      descricao="Fica guardado na página Feedbacks, com a foto e o código desta peça."
    >
      {item && <Formulario key={item.id} item={item} aoEnviado={aoFechar} />}
    </RespDialog>
  )
}
