import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

// Área de rolagem vertical que esmaece só as pontas que têm conteúdo escondido (sem corte seco).
// Topo some quando já rolou; o pé some enquanto ainda há o que rolar.
export function AreaRolavel({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pontas, setPontas] = useState({ topo: false, pe: false })

  const medir = useCallback(() => {
    const el = ref.current
    if (!el) return
    const topo = el.scrollTop > 1
    const pe = el.scrollTop + el.clientHeight < el.scrollHeight - 1
    setPontas((p) => (p.topo === topo && p.pe === pe ? p : { topo, pe }))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    // O conteúdo muda de altura (resultados, carrinho): observa os filhos também.
    Array.from(el.children).forEach((c) => obs.observe(c))
    const mut = new MutationObserver(() => {
      Array.from(el.children).forEach((c) => obs.observe(c))
      medir()
    })
    mut.observe(el, { childList: true })
    return () => {
      obs.disconnect()
      mut.disconnect()
    }
  }, [medir])

  const m = `linear-gradient(to bottom, ${pontas.topo ? "transparent, black 20px" : "black, black"}, ${pontas.pe ? "black calc(100% - 20px), transparent" : "black, black"})`
  return (
    <div
      ref={ref}
      onScroll={medir}
      style={pontas.topo || pontas.pe ? { WebkitMaskImage: m, maskImage: m } : undefined}
      className={cn("min-h-0 overflow-y-auto", className)}
    >
      {children}
    </div>
  )
}

export default AreaRolavel
