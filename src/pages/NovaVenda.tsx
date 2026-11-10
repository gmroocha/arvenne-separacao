import { useEffect, useRef } from "react"
import { useNavigate } from "react-router"
import { Spinner } from "@/components/ui/spinner"
import { useCriarVenda } from "@/lib/api"

// Cria o rascunho na hora e abre o editor.
export default function NovaVenda() {
  const navegar = useNavigate()
  const criar = useCriarVenda()
  const iniciou = useRef(false)

  useEffect(() => {
    if (iniciou.current) return
    iniciou.current = true
    criar.mutate(undefined, {
      onSuccess: (r) => navegar(`/vendas/${r.id}`, { replace: true }),
      onError: () => navegar("/vendas", { replace: true }),
    })
  }, [criar, navegar])

  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  )
}
