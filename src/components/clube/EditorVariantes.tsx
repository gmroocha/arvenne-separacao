import { Plus, X } from "lucide-react"
import CampoReais from "@/components/CampoReais"
import CampoVariante from "@/components/clube/CampoVariante"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { codigoDaLinha, codigoSugerido, erroDaVariante, novaLinhaVariante, type LinhaVariante } from "@/lib/clubeModelos"
import { cn } from "@/lib/utils"

// Lista de variantes de um produto do Clube: cada uma tem a variante (por partes), o código (sugerido como BASE-SUFIXO, dá para
// trocar) e um preço opcional (vazio = o do produto). `mostrarErros` marca o que falta em cada linha.
export default function EditorVariantes({
  base, linhas, aoMudar, mostrarErros, precoBase, prefixo = "Variante",
}: { base: string; linhas: LinhaVariante[]; aoMudar: (linhas: LinhaVariante[]) => void; mostrarErros?: boolean; precoBase?: string; prefixo?: string }) {
  const mudar = (i: number, parcial: Partial<LinhaVariante>) => aoMudar(linhas.map((l, n) => (n === i ? { ...l, ...parcial } : l)))
  return (
    <div className="flex flex-col gap-3">
      {linhas.map((l, i) => {
        const erro = mostrarErros ? erroDaVariante(base, l) : null
        const nome = `${prefixo} ${i + 1}`
        return (
          <div key={l.chave} className={cn("flex flex-col gap-3 rounded-lg border p-3", erro && "border-destructive/60")}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{nome}</span>
              <Button type="button" variant="ghost" size="icon-toque" className="-mt-2 -mr-2" aria-label={`Remover ${nome.toLowerCase()}`} onClick={() => aoMudar(linhas.filter((_, n) => n !== i))}>
                <X />
              </Button>
            </div>
            <CampoVariante partes={l.partes} aoMudar={(partes) => mudar(i, { partes })} prefixo={nome} titulo="Tamanho, cor..." comPrevia={false} rotuloAdicionar={`Adicionar tamanho ou cor (${nome.toLowerCase()})`} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={`cod-${l.chave}`}>Código</FieldLabel>
                <Input
                  id={`cod-${l.chave}`}
                  aria-label={`${nome}: Código`}
                  value={l.codigoManual ?? codigoSugerido(base, l.partes)}
                  placeholder="Ex.: AN-SOL-16"
                  onChange={(e) => mudar(i, { codigoManual: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`preco-${l.chave}`}>Preço (opcional)</FieldLabel>
                <CampoReais id={`preco-${l.chave}`} aria-label={`${nome}: Preço`} value={l.preco} onValueChange={(preco) => mudar(i, { preco })} placeholder={precoBase?.trim() ? `Igual ao do produto (${precoBase})` : "Igual ao do produto"} />
              </Field>
            </div>
            {erro && <p role="alert" className="text-xs text-destructive">{erro}</p>}
            {/* Código digitado: dá para voltar à sugestão. */}
            {l.codigoManual !== null && codigoSugerido(base, l.partes) && l.codigoManual.trim() !== codigoDaLinha(base, { ...l, codigoManual: null }) && (
              <Button type="button" variant="ghost" size="xs" className="w-fit text-muted-foreground" onClick={() => mudar(i, { codigoManual: null })}>
                Usar o código sugerido
              </Button>
            )}
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => aoMudar([...linhas, novaLinhaVariante([{ tipo: "tamanho", valor: "" }])])}>
        <Plus /> Adicionar variante
      </Button>
    </div>
  )
}
