import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"

type Props = {
  children: ReactNode
  className?: string
  /** Muda quando a etapa ativa muda: a faixa rola para centralizá-la. */
  chave?: string | number | null
}

// Faixa horizontal sem barra de rolagem. Um degradê suave nas bordas mostra que há mais conteúdo,
// em vez de cortar o último item. A etapa ativa (aria-current ou aria-pressed) fica centralizada.
export default function FaixaRolavel({ children, className, chave }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [borda, setBorda] = useState({ esq: false, dir: false })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () =>
      setBorda({ esq: el.scrollLeft > 4, dir: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 })
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    el.addEventListener("scroll", medir, { passive: true })
    return () => {
      ro.disconnect()
      el.removeEventListener("scroll", medir)
    }
  }, [])

  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[aria-current="step"], [aria-pressed="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" })
  }, [chave])

  const esq = borda.esq ? "transparent 0, #000 28px" : "#000 0, #000 0"
  const dir = borda.dir ? "#000 calc(100% - 28px), transparent 100%" : "#000 100%, #000 100%"
  const mascara = borda.esq || borda.dir ? `linear-gradient(to right, ${esq}, ${dir})` : undefined

  return (
    <div
      ref={ref}
      style={{ maskImage: mascara, WebkitMaskImage: mascara }}
      className={cn("overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)}
    >
      {children}
    </div>
  )
}
