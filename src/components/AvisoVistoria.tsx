import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"
import { TriangleAlert } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import RespDialog from "@/components/RespDialog"
import { supabase } from "@/lib/supabase"
import { lerAvisosVistoria } from "@/lib/vistoria"
import { quando } from "@/lib/formato"

export default function AvisoVistoria() {
  const [aberto, setAberto] = useState(false)
  const { data, isError } = useQuery({
    queryKey: ["vistoria"],
    staleTime: 300_000,
    refetchInterval: 300_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.from("v_vistoria_resumo").select("*").maybeSingle()
      // Compatibilidade enquanto a migration aguarda autorização; não há gravação automática no app.
      if (error && (error.code === "PGRST205" || error.code === "42P01")) return null
      if (error) throw error
      return data ? { ...data, consultadaEm: Date.now() } : null
    },
  })
  if (!data) return isError ? <p className="mb-3 text-xs text-muted-foreground" role="status">Verificação diária temporariamente indisponível.</p> : null
  const atrasada = !data.executada_em || data.consultadaEm - new Date(data.executada_em).getTime() > 36 * 3600_000
  const qtd = data.qtd_ocorrencias ?? 0
  if (qtd === 0 && !atrasada) return null
  const avisos = lerAvisosVistoria(data.ocorrencias)
  return (
    <>
      <Alert variant="warning" className="mb-3 items-center *:[svg]:translate-y-0">
        <TriangleAlert />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{qtd > 0 ? `Há ${qtd} ${qtd === 1 ? "aviso para conferir nos pedidos" : "avisos para conferir nos pedidos"}.` : "A verificação diária está atrasada."}</span>
          <Button variant="ghost" size="sm" onClick={() => setAberto(true)}>Ver avisos</Button>
        </AlertDescription>
      </Alert>
      <RespDialog aberto={aberto} aoMudar={setAberto} titulo="Verificação dos pedidos" descricao={data.executada_em ? `Última verificação: ${quando(data.executada_em)}.` : "Aguardando primeira verificação."}>
        {(atrasada || isError) && <p className="text-sm text-warning">A verificação não está atualizada. Confira o agendamento antes de considerar estes avisos resolvidos.</p>}
        <ul className="flex flex-col gap-3 py-2">
          {avisos.map((a, n) => (
            <li key={`${a.pedido_id}-${a.regra}-${n}`} className="flex flex-col gap-1 text-sm">
              {a.pedido_id ? <Link to={`/pedidos/${a.pedido_id}`} className="font-semibold underline underline-offset-4" onClick={() => setAberto(false)}>{a.numero}</Link> : <span className="font-semibold">{a.numero}</span>}
              <span className="text-muted-foreground">{a.detalhe}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">A verificação só avisa. Nenhum pedido é alterado por ela.</p>
      </RespDialog>
    </>
  )
}
