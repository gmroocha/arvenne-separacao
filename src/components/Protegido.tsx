import { useEffect, useState } from "react"
import { Navigate, Outlet } from "react-router"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { Spinner } from "@/components/ui/spinner"

export default function Protegido() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (sessao === undefined)
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Spinner />
      </div>
    )
  if (!sessao) return <Navigate to="/login" replace />
  return <Outlet />
}
