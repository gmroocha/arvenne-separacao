import { useState } from "react"
import { StickyNote } from "lucide-react"
import type { ItemAcao } from "@/components/MenuAcoes"
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

// Opção "Nota" do menu "…" das peças: um recado sobre aquela peça para quem pegar o pedido depois
// (aparece no cartão da peça em todas as etapas). Uma janela por tela.
export function useNotaPeca() {
  const [item, setItem] = useState<Item | null>(null)
  const acao = (i: Item): ItemAcao => ({ rotulo: i.nota ? "Editar nota" : "Nota", icone: StickyNote, aoClicar: () => setItem(i) })
  const dialogo = (
    <RespDialog
      aberto={item !== null}
      aoMudar={(a) => !a && setItem(null)}
      titulo="Nota da peça"
      descricao="Aparece no cartão desta peça em todas as etapas do pedido."
    >
      {item && <Formulario key={item.id} item={item} aoSalvar={() => setItem(null)} />}
    </RespDialog>
  )
  return { acao, dialogo }
}

// Nota mostrada no cartão/linha da peça.
export function NotaNaPeca({ nota, titulo }: { nota: string; titulo?: string }) {
  return (
    <div className="flex items-start gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground">
      <StickyNote className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 break-words">
        <span className="sr-only">Nota: </span>
        {titulo && <span className="font-medium">{titulo}: </span>}
        {nota}
      </span>
    </div>
  )
}
