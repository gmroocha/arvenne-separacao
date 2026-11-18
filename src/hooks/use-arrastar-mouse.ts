import { useRef, type PointerEvent, type MouseEvent } from "react"

const LIMIAR = 5 // px: abaixo disso é um clique comum (não engole o clique nos cartões e botões)

type Opcoes = {
  // Acha, a partir do contêiner, o elemento que rola na horizontal. Sem isso, o próprio contêiner.
  rolagem?: (contenedor: HTMLElement) => HTMLElement | null
  // Quem começa o arrasto nestes elementos não rola a faixa (ex.: cartões que já têm o próprio arrastar).
  ignorar?: string
}

// Arrastar uma faixa que rola na horizontal com o mouse (clique segurado), como no celular com o dedo.
// Só mouse: toque e caneta já rolam sozinhos. Mexeu menos de 5 px, o clique segue normal; passou disso, a faixa
// rola e o clique que fecha o arrasto é descartado (não abre o cartão nem escolhe a etapa por engano).
export function useArrastarComMouse({ rolagem, ignorar }: Opcoes = {}) {
  const estado = useRef<{ x: number; inicio: number; id: number; el: HTMLElement; arrastou: boolean } | null>(null)
  const engolir = useRef(false)

  const fim = () => {
    const s = estado.current
    if (!s) return
    estado.current = null
    s.el.style.cursor = ""
    s.el.style.userSelect = ""
    if (s.arrastou) {
      engolir.current = true
      setTimeout(() => { engolir.current = false }, 0)
    }
  }

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.pointerType !== "mouse" || e.button !== 0) return
      if (ignorar && (e.target as Element).closest(ignorar)) return
      if ((e.target as Element).closest("input, textarea, select, [contenteditable=true]")) return
      const el = rolagem ? rolagem(e.currentTarget) : e.currentTarget
      if (!el || el.scrollWidth <= el.clientWidth) return
      estado.current = { x: e.clientX, inicio: el.scrollLeft, id: e.pointerId, el, arrastou: false }
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const s = estado.current
      if (!s || e.pointerType !== "mouse") return
      if (e.buttons === 0) return fim() // soltou fora da janela
      const dx = e.clientX - s.x
      if (!s.arrastou) {
        if (Math.abs(dx) < LIMIAR) return
        s.arrastou = true
        s.el.style.cursor = "grabbing"
        s.el.style.userSelect = "none"
        e.currentTarget.setPointerCapture?.(s.id)
      }
      s.el.scrollLeft = s.inicio - dx
    },
    onPointerUp: fim,
    onPointerCancel: fim,
    onClickCapture(e: MouseEvent<HTMLElement>) {
      if (!engolir.current) return
      engolir.current = false
      e.preventDefault()
      e.stopPropagation()
    },
  }
}
