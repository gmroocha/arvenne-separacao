import { toast } from "sonner"

export function copiar(texto: string, aviso = "Copiado") {
  navigator.clipboard.writeText(texto).then(() => toast.success(aviso), () => toast.error("Não foi possível copiar"))
}
