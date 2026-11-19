import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router"
import { TriangleAlert } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import ErrorBoundary from "@/components/ErrorBoundary"
const Layout = lazy(() => import("@/components/Layout"))
const Protegido = lazy(() => import("@/components/Protegido"))
const SoGestor = lazy(() => import("@/components/SoGestor"))

// Igual a `configurado` de lib/supabase, sem puxar o pacote do Supabase para o início.
const configurado = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
const Login = lazy(() => import("@/pages/Login"))
const Expedicao = lazy(() => import("@/pages/Expedicao"))
const Arquivo = lazy(() => import("@/pages/Arquivo"))
const Concluidos = lazy(() => import("@/pages/Concluidos"))
const Vendas = lazy(() => import("@/pages/Vendas"))
const Venda = lazy(() => import("@/pages/Venda"))
const NovaVenda = lazy(() => import("@/pages/NovaVenda"))
const Romaneio = lazy(() => import("@/pages/Romaneio"))
const Troca = lazy(() => import("@/pages/Troca"))
const Pedido = lazy(() => import("@/pages/Pedido"))
const Repetidas = lazy(() => import("@/pages/Repetidas"))
const Clube = lazy(() => import("@/pages/Clube"))
const Catalogo = lazy(() => import("@/pages/Catalogo"))
const Feedbacks = lazy(() => import("@/pages/Feedbacks"))
const Time = lazy(() => import("@/pages/Time"))
const Indicadores = lazy(() => import("@/pages/Indicadores"))

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
    <ErrorBoundary>
    <Suspense fallback={<div className="flex min-h-svh items-center justify-center"><Spinner className="size-6" /></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/r/:token" element={<Romaneio />} />
      <Route path="/t/:token" element={<Troca />} />
      <Route element={<Protegido />}>
        <Route element={<Layout />}>
          <Route index element={<Expedicao />} />
          <Route path="pedidos/:id" element={<Pedido />} />
          {/* Só o gestor: a funcionária vê a Expedição e o pedido que está com ela. */}
          <Route element={<SoGestor />}>
            <Route path="vendas" element={<Vendas />} />
            <Route path="vendas/nova" element={<NovaVenda />} />
            <Route path="vendas/:id" element={<Venda />} />
            <Route path="concluidos" element={<Concluidos />} />
            <Route path="arquivo" element={<Arquivo />} />
            <Route path="repetidas" element={<Repetidas />} />
            <Route path="clube" element={<Clube />} />
            <Route path="catalogo" element={<Catalogo />} />
            <Route path="feedbacks" element={<Feedbacks />} />
            <Route path="time" element={<Time />} />
            <Route path="indicadores" element={<Indicadores />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
