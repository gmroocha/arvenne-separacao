import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import type { Etiqueta } from "@/lib/etiquetas"

type Props = { etiquetas: Etiqueta[]; aoPronta: () => void; aoErro: (mensagem: string) => void }

// Código de barras em SVG (Code 128) que ocupa a largura útil da etiqueta.
async function desenhar(svg: SVGSVGElement, sku: string) {
  const { default: JsBarcode } = await import("jsbarcode")
  JsBarcode(svg, sku, { format: "CODE128", displayValue: false, margin: 0, width: 2, height: 60 })
  const w = svg.getAttribute("width")
  const h = svg.getAttribute("height")
  if (w && h) svg.setAttribute("viewBox", `0 0 ${parseFloat(w)} ${parseFloat(h)}`)
  svg.removeAttribute("width")
  svg.removeAttribute("height")
  svg.setAttribute("preserveAspectRatio", "none")
}

// Folha só para impressão: uma etiqueta de 50 x 30 mm por página. Fica escondida na tela (ver src/index.css).
// Quando todos os códigos estão desenhados, chama aoPronta (a hora de abrir o diálogo de impressão).
export default function FolhaEtiquetas({ etiquetas, aoPronta, aoErro }: Props) {
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    const svgs = Array.from(raiz.current?.querySelectorAll<SVGSVGElement>("svg[data-sku]") ?? [])
    Promise.all(svgs.map((s) => desenhar(s, s.dataset.sku ?? "")))
      .then(() => {
        if (vivo) aoPronta()
      })
      .catch((e) => {
        if (vivo) aoErro(`Não foi possível desenhar o código de barras: ${e instanceof Error ? e.message : "código inválido"}`)
      })
    return () => {
      vivo = false
    }
    // aoPronta muda a cada render do pai; só importa quando as etiquetas mudam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etiquetas])

  return createPortal(
    <div id="folha-etiquetas" ref={raiz} aria-hidden>
      {etiquetas.map((e, n) =>
        e.tipo === "separador" ? (
          <div key={n} className="etiqueta etiqueta-separador">
            <div className="etiqueta-faixa" />
            <div className="etiqueta-titulo">{e.titulo}</div>
            <div className="etiqueta-subtitulo">{e.subtitulo}</div>
            <div className="etiqueta-faixa" />
          </div>
        ) : (
          <div key={n} className="etiqueta">
            <div className="etiqueta-sku" style={{ fontSize: e.sku.length > 18 ? "8pt" : e.sku.length > 14 ? "9pt" : "12pt" }}>
              SKU: {e.sku}
            </div>
            <svg data-sku={e.sku} className="etiqueta-barras" />
          </div>
        ),
      )}
    </div>,
    document.body,
  )
}
