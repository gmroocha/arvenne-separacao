import { Navigate, Route, Routes } from "react-router"
import { TriangleAlert } from "lucide-react"
import { configurado } from "@/lib/supabase"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import Layout from "@/components/Layout"
import Protegido from "@/components/Protegido"
import Login from "@/pages/Login"
import Expedicao from "@/pages/Expedicao"
import Arquivo from "@/pages/Arquivo"
import Vendas from "@/pages/Vendas"
import Venda from "@/pages/Venda"
import NovaVenda from "@/pages/NovaVenda"
import Romaneio from "@/pages/Romaneio"
import Pedido from "@/pages/Pedido"
import Repetidas from "@/pages/Repetidas"
import Clube from "@/pages/Clube"
import Feedbacks from "@/pages/Feedbacks"

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
      <Route path="/r/:token" element={<Romaneio />} />
      <Route element={<Protegido />}>
        <Route element={<Layout />}>
          <Route index element={<Expedicao />} />
          <Route path="vendas" element={<Vendas />} />
          <Route path="vendas/nova" element={<NovaVenda />} />
          <Route path="vendas/:id" element={<Venda />} />
          <Route path="pedidos/:id" element={<Pedido />} />
          <Route path="arquivo" element={<Arquivo />} />
          <Route path="repetidas" element={<Repetidas />} />
          <Route path="clube" element={<Clube />} />
          <Route path="feedbacks" element={<Feedbacks />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
