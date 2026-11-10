import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

// Mudanças feitas por outra pessoa aparecem na hora.
export function useTempoReal() {
  const qc = useQueryClient()
  useEffect(() => {
    // As próprias gravações também chegam aqui. Espera juntar as mudanças e não atualiza no meio de
    // uma gravação nossa, para a tela não piscar com dado velho.
    let espera: ReturnType<typeof setTimeout> | undefined
    const atualizar = () => {
      clearTimeout(espera)
      espera = setTimeout(function rodar() {
        if (qc.isMutating() > 0) {
          espera = setTimeout(rodar, 800)
          return
        }
        qc.invalidateQueries({ queryKey: ["pedidos"] })
        qc.invalidateQueries({ queryKey: ["pedido"] })
        qc.invalidateQueries({ queryKey: ["repetidas"] })
        qc.invalidateQueries({ queryKey: ["trocas"] })
      }, 800)
    }
    const canal = supabase
      .channel("tempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, atualizar)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_itens" }, atualizar)
      .on("postgres_changes", { event: "*", schema: "public", table: "trocas" }, atualizar)
      .subscribe()
    return () => {
      clearTimeout(espera)
      supabase.removeChannel(canal)
    }
  }, [qc])
}
