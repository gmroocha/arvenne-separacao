import { ArrowDown, Check, HandCoins } from "lucide-react"
import { LinhaPeca, type PecaBasica } from "@/components/comum/Peca"
import RespDialog from "@/components/RespDialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { reais } from "@/lib/formato"
import { fraseDiferencaCarrinho, fraseSituacao, valorDaOpcao, valorPagoPeca } from "@/lib/trocaTexto"
import type { TrocaOpcao, TrocaPeca } from "@/lib/tipos"

type Props = {
  aberto: boolean
  aoMudar: (aberto: boolean) => void
  // Peça que sai do pedido (a que faltou).
  sai: PecaBasica | null
  peca: TrocaPeca | null
  // O que entra: uma opção, o carrinho inteiro da cliente, ou nada (crédito).
  entra: { opcao: TrocaOpcao; qtd: number }[]
  pendente?: boolean
  aoConfirmar: () => void
}

// Confirmação antes de trocar a peça (ou dar crédito), desenhada como "sai ↓ entra": foto e código de cada
// lado e, embaixo, o que acontece com o dinheiro (valores prontos do banco, pela view v_troca_valores).
export default function ConfirmarTroca({ aberto, aoMudar, sai, peca, entra, pendente, aoConfirmar }: Props) {
  const credito = entra.length === 0
  const valor = !peca
    ? ""
    : credito
      ? `Cliente fica com ${reais(valorPagoPeca(peca))} de crédito`
      : entra.length > 1 || (peca.carrinho?.itens.length ?? 0) > 1
        ? fraseDiferencaCarrinho(peca.carrinho?.diferenca)
        : fraseSituacao(valorDaOpcao(peca, entra[0].opcao))
  return (
    <RespDialog
      aberto={aberto}
      aoMudar={aoMudar}
      titulo={credito ? "Dar crédito?" : "Fazer a troca?"}
      descricao={credito ? "A peça sai do pedido e o valor dela vira crédito." : "A peça nova entra no pedido e a antiga sai."}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Rotulo>Sai do pedido</Rotulo>
          {sai && <LinhaPeca item={sai} tamanho="md" riscada esmaecida />}
          <ArrowDown className="mx-auto size-5 text-muted-foreground" aria-hidden />
          <Rotulo>{credito ? "Fica para a cliente" : "Entra no lugar"}</Rotulo>
          {credito ? (
            <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
              <HandCoins className="size-5 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">Crédito de {reais(peca ? valorPagoPeca(peca) : 0)}</span>
            </div>
          ) : (
            entra.map(({ opcao, qtd }) => <LinhaPeca key={opcao.id} item={{ ...opcao, qtd: qtd || sai?.qtd || 1 }} tamanho="md" />)
          )}
        </div>
        {valor && (
          <Badge variant="secondary" className="h-8 w-full justify-center text-sm font-medium tabular-nums">
            {valor.charAt(0).toUpperCase() + valor.slice(1)}
          </Badge>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" className="h-10 w-full text-sm sm:w-auto" onClick={() => aoMudar(false)}>
            Cancelar
          </Button>
          <Button className="h-10 w-full text-sm sm:w-auto" disabled={pendente} onClick={aoConfirmar}>
            {pendente ? <Spinner /> : <Check />} Confirmar
          </Button>
        </div>
      </div>
    </RespDialog>
  )
}

function Rotulo({ children }: { children: string }) {
  return <span className="text-xs font-medium text-muted-foreground">{children}</span>
}
