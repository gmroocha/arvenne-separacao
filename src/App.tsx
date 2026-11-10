import { Navigate, Route, Routes } from "react-router"
import { TriangleAlert } from "lucide-react"
import { configurado } from "@/lib/supabase"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import Layout from "@/components/Layout"
import Protegido from "@/components/Protegido"
import Login from "@/pages/Login"
import Pedidos from "@/pages/Pedidos"
import Pedido from "@/pages/Pedido"
import NovoPedido from "@/pages/NovoPedido"
import Repetidas from "@/pages/Repetidas"
import Clube from "@/pages/Clube"

function Configure() {
  return (
    <div className="mx-auto flex min-h-svh max-w-lg items-center p-4">
      <Alert>
        <TriangleAlert />
        <AlertTitle>Configure o Supabase</AlertTitle>
        <AlertDescription>
          Crie o arquivo <code>.env.local</code> com <code>VITE_SUPABASE_URL</code> e{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> e reinicie o servidor. O passo a passo está no README.
        </AlertDescription>
      </Alert>
    </div>
  )
}

export default function App() {
  if (!configurado) return <Configure />
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protegido />}>
        <Route element={<Layout />}>
          <Route index element={<Pedidos />} />
          <Route path="pedidos/novo" element={<NovoPedido />} />
          <Route path="pedidos/:id" element={<Pedido />} />
          <Route path="repetidas" element={<Repetidas />} />
          <Route path="clube" element={<Clube />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
