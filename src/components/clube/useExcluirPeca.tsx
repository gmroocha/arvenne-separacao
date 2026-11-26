import { useState } from "react"
import { toast } from "sonner"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useAtivarPecaClube } from "@/lib/api"
import type { PecaClube } from "@/lib/tipos"

// Excluir peça do Clube/Live: some do catálogo e da busca (no banco fica ativo = false, porque pedidos antigos apontam
// para ela). Pedidos que já têm a peça não mudam. Devolve a função que pede a confirmação e o diálogo para pôr na página.
export function useExcluirPeca() {
  const excluir = useAtivarPecaClube()
  const [peca, setPeca] = useState<PecaClube | null>(null)
  const dialogo = (
    <RespDialog
      aberto={peca !== null}
      aoMudar={(a) => !a && setPeca(null)}
      titulo={peca ? `Excluir ${peca.codigo}?` : "Excluir peça?"}
      descricao="A peça sai do catálogo e da busca. Pedidos que já têm esta peça continuam iguais."
    >
      <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse sm:justify-start">
        <Button
          variant="destructive"
          size="toque"
          disabled={excluir.isPending}
          onClick={() => peca && excluir.mutate({ id: peca.id, ativo: false }, { onSuccess: () => { toast.success("Peça excluída"); setPeca(null) } })}
        >
          {excluir.isPending && <Spinner />} Excluir
        </Button>
        <Button variant="outline" size="toque" onClick={() => setPeca(null)}>
          Voltar
        </Button>
      </div>
    </RespDialog>
  )
  return { pedir: setPeca, dialogo }
}
