import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { montarVariante, proximoTipo, TIPOS_PARTE, type ParteVariante, type TipoParte } from "@/lib/varianteClube"

// Construtor da variante por partes (tamanho, cor, outra), igual ao que a peça do Clube já usava. Serve ao formulário da
// peça simples e a cada variante do produto. `prefixo` deixa os nomes acessíveis únicos quando há várias na tela.
export default function CampoVariante({
  partes, aoMudar, prefixo = "", titulo = "Variante", comPrevia = true, rotuloAdicionar,
}: { partes: ParteVariante[]; aoMudar: (partes: ParteVariante[]) => void; prefixo?: string; titulo?: string; comPrevia?: boolean; rotuloAdicionar?: string }) {
  const mudarParte = (i: number, parcial: Partial<ParteVariante>) => aoMudar(partes.map((p, n) => (n === i ? { ...p, ...parcial } : p)))
  const adicionarParte = () => aoMudar([...partes, { tipo: proximoTipo(partes), valor: "" }])
  const removerParte = (i: number) => aoMudar(partes.filter((_, n) => n !== i))
  const pre = prefixo ? `${prefixo}: ` : ""
  return (
    <FieldSet className="gap-3">
      <FieldLegend variant="label">{titulo}</FieldLegend>
      {partes.map((parte, i) => {
        const tipo = TIPOS_PARTE.find((t) => t.valor === parte.tipo) ?? TIPOS_PARTE[0]
        return (
          <div key={i} className="flex items-center gap-2">
            <Select value={parte.tipo} onValueChange={(t) => mudarParte(i, { tipo: t as TipoParte })}>
              <SelectTrigger aria-label={`${pre}Tipo da variante ${i + 1}`} className="w-32 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_PARTE.map((t) => (
                  <SelectItem key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label={`${pre}${tipo.rotulo}`}
              className="min-w-0 uppercase placeholder:normal-case"
              placeholder={tipo.exemplo}
              value={parte.valor}
              onChange={(e) => mudarParte(i, { valor: e.target.value })}
            />
            <Button type="button" variant="ghost" size="icon-toque" aria-label={`${pre}Remover ${tipo.rotulo.toLowerCase()}`} onClick={() => removerParte(i)}>
              <X />
            </Button>
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={adicionarParte}>
        <Plus /> {rotuloAdicionar ?? (partes.length ? "Adicionar outra variante" : "Adicionar variante")}
      </Button>
      {comPrevia && partes.length > 0 && (
        <FieldDescription>
          Fica assim: <span className="font-medium text-foreground">{montarVariante(partes) ?? "—"}</span>
        </FieldDescription>
      )}
    </FieldSet>
  )
}
