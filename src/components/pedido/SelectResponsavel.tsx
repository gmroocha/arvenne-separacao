import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEquipe } from "@/lib/api"

const NINGUEM = "ninguem"

// Escolha de uma pessoa do Time (sugestões de responsável sempre podem ser trocadas). Valor nulo = ninguém.
export default function SelectResponsavel({ valor, aoMudar, rotulo, className }: { valor: string | null; aoMudar: (id: string | null) => void; rotulo: string; className?: string }) {
  const membros = useEquipe().data ?? []
  const ativos = membros.filter((m) => m.ativo)
  const atual = valor && !ativos.some((m) => m.id === valor) ? membros.find((m) => m.id === valor) : undefined
  return (
    <Select value={valor ?? NINGUEM} onValueChange={(v) => aoMudar(v === NINGUEM ? null : v)}>
      <SelectTrigger className={className ?? "h-11 w-full md:h-9"} aria-label={rotulo}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NINGUEM}>Não sei</SelectItem>
        {ativos.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.nome}
          </SelectItem>
        ))}
        {atual && <SelectItem value={atual.id}>{atual.nome} (inativo)</SelectItem>}
      </SelectContent>
    </Select>
  )
}
