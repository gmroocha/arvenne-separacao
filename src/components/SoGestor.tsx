import { Navigate, Outlet } from "react-router"
import { Spinner } from "@/components/ui/spinner"
import { useSouGestor } from "@/lib/api"

// Páginas do gestor (Vendas, Concluídos, Time...): a funcionária volta para a Expedição. A conferência de verdade é do banco
// (RLS); aqui só se evita mostrar tela vazia.
export default function SoGestor() {
  const gestor = useSouGestor()
  if (gestor === undefined)
    return (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner />
      </div>
    )
  return gestor ? <Outlet /> : <Navigate to="/" replace />
}
