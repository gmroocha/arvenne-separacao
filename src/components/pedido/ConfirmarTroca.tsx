import { Check } from "lucide-react"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  titulo: string
  // Frase pronta, com o valor vindo do banco.
  frase: string
  pendente?: boolean
  aoConfirmar: () => void
}

// Confirmação antes de trocar a peça (ou dar crédito): mostra o que vai acontecer e quanto.
export default function ConfirmarTroca({ aberto, aoMudar, titulo, frase, pendente, aoConfirmar }: Props) {
  return (
    <RespDialog aberto={aberto} aoMudar={aoMudar} titulo={titulo} descricao="A peça entra no pedido e a antiga sai. Confira antes de confirmar.">
      <div className="flex flex-col gap-4">
        <p className="rounded-lg bg-muted/50 p-3 text-sm font-medium">{frase}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-10 w-full text-sm sm:w-auto" onClick={() => aoMudar(false)}>
            Cancelar
          </Button>
          <Button className="h-10 w-full text-sm sm:w-auto" disabled={pendente} onClick={aoConfirmar}>
            {pendente ? <Spinner /> : <Check />} Confirmar
          </Button>
        </div>
      </div>
    </RespDialog>
  )
}
