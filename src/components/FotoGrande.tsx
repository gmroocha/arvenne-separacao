import { useState, type CSSProperties } from "react"
import { cn } from "@/lib/utils"

type Props = {
  url: string
  // Miniatura já carregada na tela: aparece na hora, no tamanho final, enquanto a grande chega.
  previa?: string | null
  // Largura ÷ altura da foto (da miniatura). Sem ela, quadrada.
  proporcao?: number
  alt: string
  className?: string
  style?: CSSProperties
}

// Foto ampliada que já nasce no tamanho certo: sem o quadro vazio (com o X no meio) antes da foto chegar.
export default function FotoGrande({ url, previa, proporcao = 1, alt, className, style }: Props) {
  const [pronta, setPronta] = useState(false)
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-muted", className)} style={{ aspectRatio: proporcao, ...style }}>
      {previa && !pronta && <img draggable={false} src={previa} alt="" aria-hidden className="absolute inset-0 size-full object-contain" />}
      <img
        draggable={false}
        src={url}
        alt={alt}
        ref={(el) => {
          if (el?.complete && el.naturalWidth > 0) setPronta(true)
        }}
        onLoad={() => setPronta(true)}
        className={cn("absolute inset-0 size-full object-contain transition-opacity duration-150", pronta ? "opacity-100" : "opacity-0")}
      />
    </div>
  )
}
