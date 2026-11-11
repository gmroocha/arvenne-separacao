import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

// Com o canal ao vivo as listas só se atualizam por reserva (5 min); sem ele, a cada 60 s.
let canalAtivo = false
export const intervaloListas = () => (canalAtivo ? 300_000 : 60_000)

type Payload = { new?: Record<string, unknown>; old?: Record<string, unknown> }
const idDe = (v: unknown) => (typeof v === "string" ? v : null)

// Mudanças feitas por outra pessoa aparecem na hora.
export function useTempoReal() {
  const qc = useQueryClient()
  useEffect(() => {
    // As próprias gravações também chegam aqui. Espera juntar as mudanças e não atualiza no meio de
    // uma gravação nossa, para a tela não piscar com dado velho.
    let espera: ReturnType<typeof setTimeout> | undefined
    const pedidos = new Set<string>()
    let trocas = false
    let tudo = false
    let teveQueda = false
    let pesado = false // algo além de peça/opção de troca mudou: recarrega os pedidos também
    const agendar = () => {
      clearTimeout(espera)
      espera = setTimeout(function rodar() {
        if (qc.isMutating() > 0) {
          espera = setTimeout(rodar, 800)
          return
        }
        if (!pesado) {
          qc.invalidateQueries({ queryKey: ["troca"] })
          qc.invalidateQueries({ queryKey: ["acerto"] })
        } else {
          qc.invalidateQueries({ queryKey: ["pedidos"] })
          qc.invalidateQueries({ queryKey: ["repetidas"] })
          qc.invalidateQueries({ queryKey: ["acerto"] })
          qc.invalidateQueries({ queryKey: ["etiquetar"] })
          if (tudo) qc.invalidateQueries({ queryKey: ["pedido"] })
          else for (const x of pedidos) qc.invalidateQueries({ queryKey: ["pedido", x] })
          if (trocas) qc.invalidateQueries({ queryKey: ["troca"] })
        }
        pedidos.clear()
        trocas = false
        tudo = false
        pesado = false
      }, 800)
    }
    // leve: só peças/opções da troca. Os demais eventos pedem recarregar pedidos também.
    const anotar = (campo: "id" | "pedido_id", troca: boolean, leve = false) => (p: Payload) => {
      const id = idDe(p.new?.[campo]) ?? idDe(p.old?.[campo])
      if (!leve) {
        pesado = true
        if (id) pedidos.add(id)
        else tudo = true
      }
      if (troca) trocas = true
      agendar()
    }
    const canal = supabase
      .channel("tempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, anotar("id", false))
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_itens" }, anotar("pedido_id", false))
      .on("postgres_changes", { event: "*", schema: "public", table: "trocas" }, anotar("pedido_id", true))
      .on("postgres_changes", { event: "*", schema: "public", table: "troca_pecas" }, anotar("pedido_id", true, true))
      .on("postgres_changes", { event: "*", schema: "public", table: "troca_opcoes" }, anotar("pedido_id", true, true))
      .subscribe((status) => {
        canalAtivo = status === "SUBSCRIBED"
        // Voltou depois de uma queda: pode ter perdido eventos, então recarrega tudo uma vez.
        if (canalAtivo && teveQueda) {
          teveQueda = false
          qc.invalidateQueries()
        } else if (!canalAtivo) teveQueda = true
      })
    return () => {
      clearTimeout(espera)
      canalAtivo = false
      supabase.removeChannel(canal)
    }
  }, [qc])
}
