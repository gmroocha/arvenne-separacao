import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { FORMAS_PAGAMENTO } from "@/components/venda/form"

type Props = {
  valor: string | null | undefined
  aoMudar: (forma: string | null) => void // null = desmarcou
  className?: string
}

// Escolha da forma de pagamento. O texto de "nome" é o valor gravado no banco.
export function FormaPagamento({ valor, aoMudar, className }: Props) {
  return (
    <ToggleGroup type="single" variant="outline" spacing={1} className={className ?? "flex-wrap"} value={valor ?? ""} onValueChange={(v) => aoMudar(v || null)}>
      {FORMAS_PAGAMENTO.map((f) => (
        <ToggleGroupItem key={f.nome} value={f.nome}>
          <f.icone /> {f.nome}
        </ToggleGroupItem>
      ))}
      {/* Pedido antigo com uma forma que não existe mais na lista (ex.: "Link de pagamento"): continua aparecendo. */}
      {valor && !FORMAS_PAGAMENTO.some((f) => f.nome === valor) && <ToggleGroupItem value={valor}>{valor}</ToggleGroupItem>}
    </ToggleGroup>
  )
}
