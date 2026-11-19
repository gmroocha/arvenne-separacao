import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { agendarAtualizacaoOperacional, ehEcoProprio } from "@/lib/atualizacaoOperacional"
import { supabase } from "@/lib/supabase"
import { PACOTE_ATUAL, haVersaoNova, lerPacotePublicado, recarregarUmaVez } from "@/lib/versaoNova"

// Com o canal ao vivo as listas só se atualizam por reserva (5 min); sem ele, a cada 60 s.
let canalAtivo = false
export const intervaloListas = () => (canalAtivo ? 300_000 : 60_000)

// Espera antes de reler tudo depois de uma queda do canal: espalha os aparelhos (2 a 15 s).
export const atrasoReconexao = () => 2_000 + Math.floor(Math.random() * 13_000)

type Aviso = { t?: string; p?: unknown }
const idDe = (v: unknown) => (typeof v === "string" ? v : null)
const escondida = () => typeof document !== "undefined" && document.hidden

// Mudanças feitas por outra pessoa aparecem na hora.
export function useTempoReal() {
  const qc = useQueryClient()
  useEffect(() => {
    let teveQueda = false
    let adiado = false
    // Versão nova no ar: recarrega sozinha quando a aba volta a aparecer, nada está sendo salvo e já passaram 5 min da
    // última checagem. Só vale em produção (o pacote principal tem hash no nome).
    let ultimaChecagem = 0
    const verificarVersao = async () => {
      if (escondida() || Date.now() - ultimaChecagem < 5 * 60_000 || !PACOTE_ATUAL) return
      ultimaChecagem = Date.now()
      if (!haVersaoNova(PACOTE_ATUAL, await lerPacotePublicado())) return
      if (qc.isMutating() > 0) { ultimaChecagem = 0; return } // tenta de novo na próxima vez
      recarregarUmaVez()
    }
    const aoMostrar = () => {
      void verificarVersao()
      if (escondida() || !adiado) return
      adiado = false
      qc.invalidateQueries({ queryKey: ["pedidos"] })
      qc.invalidateQueries({ queryKey: ["pedido"] })
      qc.invalidateQueries({ queryKey: ["troca"] })
      qc.invalidateQueries({ queryKey: ["acerto"] })
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
      const pesado = t !== "troca_pecas" && t !== "troca_opcoes"
      const todos = (Array.isArray(p) ? p : []).map(idDe).filter((x): x is string => !!x)
      // O que esta aba mesma acabou de gravar já está na tela: o eco do aviso não relê o pedido.
      const ids = todos.filter((id) => !ehEcoProprio(qc, id))
      if (todos.length > 0 && ids.length === 0) return
      if (escondida()) adiado = true
      agendarAtualizacaoOperacional(qc, ids, { troca, pesado, tudo: pesado && !ids.length })
    }

    let ativo = true
    let releitura: ReturnType<typeof setTimeout> | undefined
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
          // V115: quando o banco engasga, todos os aparelhos caem e voltam juntos; reler tudo na mesma hora derruba o banco de
          // novo. Cada aparelho espera um tempo aleatório (2 a 15 s) e relê só o que está na tela (consultas ativas).
          else {
            clearTimeout(releitura)
            releitura = setTimeout(() => {
              if (ativo) qc.invalidateQueries({ refetchType: "active" })
            }, atrasoReconexao())
          }
        } else if (!canalAtivo) teveQueda = true
      })
    }
    void Promise.resolve()
      .then(() => supabase.realtime.setAuth())
      .catch(() => {})
      .then(assinar)
    return () => {
      ativo = false
      clearTimeout(releitura)
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", aoMostrar)
      }
      canalAtivo = false
      supabase.removeChannel(canal)
    }
  }, [qc])
}
