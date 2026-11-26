import { useState } from "react"
import { Printer } from "lucide-react"
import { toast } from "sonner"
import RespDialog from "@/components/RespDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { precosEtiquetaLive } from "@/lib/api"
import type { Etiqueta } from "@/lib/etiquetas"
import { reais } from "@/lib/formato"
import type { PecaClube } from "@/lib/tipos"

const SUGESTOES = [10, 15, 20, 25, 30, 40, 50]

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  // Peças a imprimir e quantas etiquetas de cada.
  pecas: { peca: PecaClube; qtd: number }[]
  aoImprimir: (etiquetas: Etiqueta[]) => Promise<void> | void
}

// "Imprimir para a live": escolhe o % de desconto e imprime SKU, preço cheio e preço com desconto (sem código de barras).
// O preço com desconto vem do banco.
export default function ImprimirParaLive({ aberto, aoMudar, pecas, aoImprimir }: Props) {
  const [pct, setPct] = useState("20")
  const [gerando, setGerando] = useState(false)
  const n = Number(pct.replace(",", "."))
  const valido = Number.isFinite(n) && n > 0 && n < 100
  const total = pecas.reduce((s, p) => s + p.qtd, 0)

  const imprimir = async () => {
    if (!valido) return
    setGerando(true)
    try {
      const precos = new Map((await precosEtiquetaLive(pecas.map((p) => p.peca.id), n)).map((r) => [r.id, r]))
      const semPreco = pecas.filter((p) => !precos.has(p.peca.id)).map((p) => p.peca.codigo)
      const etiquetas: Etiqueta[] = pecas.flatMap(({ peca, qtd }) => {
        const r = precos.get(peca.id)
        if (!r) return []
        const e: Etiqueta = { tipo: "live", sku: peca.codigo.trim(), preco: reais(r.preco), precoDesconto: reais(r.preco_desconto), pct: n }
        return Array.from({ length: qtd }, () => e)
      })
      if (semPreco.length) toast.warning(`Sem preço, ficou de fora: ${semPreco.join(", ")}`)
      if (etiquetas.length) {
        await aoImprimir(etiquetas)
        aoMudar(false)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível montar as etiquetas")
    } finally {
      setGerando(false)
    }
  }

  return (
    <RespDialog
      aberto={aberto}
      aoMudar={aoMudar}
      titulo="Imprimir para a live"
      descricao={`${total} ${total === 1 ? "etiqueta" : "etiquetas"} com o código, o preço cheio e o preço com desconto.`}
      teclado
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Desconto</Label>
          <ToggleGroup type="single" variant="outline" spacing={1} className="flex-wrap" value={SUGESTOES.includes(n) ? String(n) : ""} onValueChange={(v) => v && setPct(v)} aria-label="Desconto">
            {SUGESTOES.map((s) => (
              <ToggleGroupItem key={s} value={String(s)} className="h-11 min-w-14 tabular-nums lg:h-9">
                {s}%
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="pct-live">Outro valor (%)</Label>
          <Input id="pct-live" inputMode="decimal" className="h-11 w-32 tabular-nums lg:h-9" value={pct} onChange={(e) => setPct(e.target.value)} aria-invalid={!valido} />
          {!valido && <p className="text-sm text-destructive">Use um desconto maior que 0% e menor que 100%.</p>}
        </div>
        <Button size="xl" disabled={!valido || gerando || total === 0} onClick={imprimir}>
          {gerando ? <Spinner /> : <Printer />} Imprimir {total} {total === 1 ? "etiqueta" : "etiquetas"}
        </Button>
      </div>
    </RespDialog>
  )
}
