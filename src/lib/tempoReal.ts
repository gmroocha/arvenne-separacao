import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

// Mudanças feitas por outra pessoa aparecem na hora.
export function useTempoReal() {
  const qc = useQueryClient()
  useEffect(() => {
    const atualizar = () => {
      qc.invalidateQueries({ queryKey: ["pedidos"] })
      qc.invalidateQueries({ queryKey: ["pedido"] })
      qc.invalidateQueries({ queryKey: ["repetidas"] })
    }
    const canal = supabase
      .channel("tempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, atualizar)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedido_itens" }, atualizar)
      .subscribe()
    return () => {
      supabase.removeChannel(canal)
    }
  }, [qc])
}
