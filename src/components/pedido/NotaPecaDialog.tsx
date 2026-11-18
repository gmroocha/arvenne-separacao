import { useState } from "react"
import { LinhaPeca } from "@/components/comum/Peca"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useAnotarItem } from "@/lib/api"
import type { Item } from "@/lib/tipos"

function Formulario({ item, aoSalvar }: { item: Item; aoSalvar: () => void }) {
  const [texto, setTexto] = useState(item.nota ?? "")
  const anotar = useAnotarItem()
  const salvar = (nota: string) => anotar.mutate({ itemId: item.id, nota }, { onSuccess: aoSalvar })
  const mudou = texto.trim() !== (item.nota ?? "")
  return (
    <div className="flex flex-col gap-3">
      <LinhaPeca item={{ foto_url: item.foto_url, nome: item.nome, sku: item.sku, variante: item.variante }} tamanho="lg" />
      <Textarea
        autoFocus
        aria-label="Nota da peça"
        placeholder="Ex.: peça de montagem, temos as partes mas falta montar"
        maxLength={500}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="min-h-28"
      />
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <Button size="xl" className="sm:flex-1" disabled={!texto.trim() || !mudou || anotar.isPending} onClick={() => salvar(texto)}>
          {anotar.isPending && <Spinner />} Salvar nota
        </Button>
        {item.nota && (
          <Button size="xl" variant="outline" disabled={anotar.isPending} onClick={() => salvar("")}>
            Apagar nota
          </Button>
        )}
      </div>
    </div>
  )
}

// Janela "Nota da peça": aberta com a peça escolhida, fecha sozinha ao salvar ou apagar.
export default function NotaPecaDialog({ item, aoFechar }: { item: Item | null; aoFechar: () => void }) {
  return (
    <RespDialog
      teclado
      aberto={item !== null}
      aoMudar={(a) => !a && aoFechar()}
      titulo="Nota da peça"
      descricao="Aparece no cartão desta peça em todas as etapas do pedido."
    >
      {item && <Formulario key={item.id} item={item} aoSalvar={aoFechar} />}
    </RespDialog>
  )
}
