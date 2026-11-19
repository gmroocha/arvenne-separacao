import type { PedidoDetalhe } from "@/lib/api"
import { Embalagem } from "./Fechamento"
import Frete from "./Frete"
import { Faltando, type Patch } from "./NotaFrete"

// Etapa "Embalagem e frete": dois passos com botão próprio ("Embalado" e "Frete gerado"), em qualquer ordem. O pedido só
// vai para a Postagem quando os dois estão marcados (o banco avança sozinho).
export default function EmbalagemFrete({ pedido, patch }: { pedido: PedidoDetalhe; patch: Patch }) {
  return (
    <div className="flex flex-col gap-4">
      <Faltando pedido={pedido} patch={patch} />
      <Embalagem pedido={pedido} patch={patch} />
      <Frete pedido={pedido} patch={patch} />
    </div>
  )
}
