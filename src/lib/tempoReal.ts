import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/lib/supabase"

// Com o canal ao vivo as listas só se atualizam por reserva (5 min); sem ele, a cada 60 s.
let canalAtivo = false
export const intervaloListas = () => (canalAtivo ? 300_000 : 60_000)

type Aviso = { t?: string; p?: unknown }
const idDe = (v: unknown) => (typeof v === "string" ? v : null)
const escondida = () => typeof document !== "undefined" && document.hidden

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
        // Aba escondida não recarrega nada agora (cada aba aberta multiplicava as leituras no banco):
        // marca como desatualizado e recarrega quando a aba voltar a aparecer.
        if (escondida()) {
          adiado = true
          return
        }
        if (!pesado) {
          qc.invalidateQueries({ queryKey: ["troca"] })
          qc.invalidateQueries({ queryKey: ["acerto"] })
        } else {
          qc.invalidateQueries({ queryKey: ["pedidos"] })
          // Contagem do selo: só fica desatualizada (volta pelo intervalo dela); a página Repetidas recarrega.
          qc.invalidateQueries({ queryKey: ["repetidas"], predicate: (q) => q.queryKey[1] !== "contagem" })
          qc.invalidateQueries({ queryKey: ["repetidas", "contagem"], refetchType: "none" })
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
      }, 1200)
    }
    let adiado = false
    const aoMostrar = () => {
      if (escondida() || !adiado) return
      adiado = false
      qc.invalidateQueries({ queryKey: ["pedidos"] })
      qc.invalidateQueries({ queryKey: ["pedido"] })
      qc.invalidateQueries({ queryKey: ["troca"] })
      qc.invalidateQueries({ queryKey: ["acerto"] })
      qc.invalidateQueries({ queryKey: ["etiquetar"] })
      qc.invalidateQueries({ queryKey: ["repetidas"] })
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", aoMostrar)
    // Aviso do banco (Broadcast, canal privado "pedidos"): { t: tabela, p: ids dos pedidos afetados }.
    // Peças/opções da troca são "leves" (só a troca recarrega); o resto recarrega os pedidos também.
    const anotar = ({ t, p }: Aviso) => {
      // Mudança no time: só a lista de pessoas recarrega (nenhum pedido mudou).
      if (t === "equipe") {
        qc.invalidateQueries({ queryKey: ["equipe"] })
        return
      }
      const troca = t === "trocas" || t === "troca_pecas" || t === "troca_opcoes"
      if (t !== "troca_pecas" && t !== "troca_opcoes") {
        pesado = true
        const ids = (Array.isArray(p) ? p : []).map(idDe).filter((x): x is string => !!x)
        if (ids.length) ids.forEach((id) => pedidos.add(id))
        else tudo = true
      }
      if (troca) trocas = true
      agendar()
    }
    let ativo = true
    // Canal privado: a autorização do Realtime confere o login (política em realtime.messages).
    const canal = supabase.channel("pedidos", { config: { private: true } }).on("broadcast", { event: "mudou" }, (m: { payload?: Aviso }) => {
      if (m.payload) anotar(m.payload)
    })
    const assinar = () => {
      if (!ativo) return
      canal.subscribe((status) => {
        canalAtivo = status === "SUBSCRIBED"
        // Voltou depois de uma queda: pode ter perdido eventos, então recarrega tudo uma vez.
        if (canalAtivo && teveQueda) {
          teveQueda = false
          if (escondida()) adiado = true
          else qc.invalidateQueries()
        } else if (!canalAtivo) teveQueda = true
      })
    }
    void Promise.resolve()
      .then(() => supabase.realtime.setAuth())
      .catch(() => {})
      .then(assinar)
    return () => {
      ativo = false
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", aoMostrar)
      clearTimeout(espera)
      canalAtivo = false
      supabase.removeChannel(canal)
    }
  }, [qc])
}
