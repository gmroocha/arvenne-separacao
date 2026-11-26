import { Pencil, Printer, Trash2 } from "lucide-react"
import Foto from "@/components/Foto"
import PecaClubeForm from "@/components/PecaClubeForm"
import { Quantidade } from "@/components/comum/Quantidade"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { usePecasDoModelo } from "@/lib/api"
import { rotulosDeVariantes, type GrupoClube } from "@/lib/clubeModelos"
import { diaMes, reais } from "@/lib/formato"
import type { ModeloClube, PecaClube } from "@/lib/tipos"

export type Peca = PecaClube & { ativo: boolean }

// Edita o produto inteiro (o pai e as variantes que não foram excluídas): busca as variantes e abre o formulário.
export function EditarProduto({ modelo, aoSalvar }: { modelo: ModeloClube; aoSalvar: () => void }) {
  const { data } = usePecasDoModelo(modelo.id)
  if (!data) return <div className="flex justify-center py-10"><Spinner /></div>
  return <PecaClubeForm key={modelo.id} produto={{ modelo, pecas: data }} aoSalvar={aoSalvar} />
}

// Etiquetas a imprimir (página Live): quantas etiquetas de cada peça (id da peça -> quantidade).
export type Etiquetas = { qtd: (id: string) => number; aoMudar: (peca: PecaClube, n: number) => void }

function SeloLive({ liveEm }: { liveEm: string | null | undefined }) {
  return liveEm ? <Badge variant="outline" className="w-fit text-muted-foreground">Live {diaMes(liveEm)}</Badge> : null
}

// Botão "Etiqueta" que vira o seletor de quantidade quando a peça foi escolhida para imprimir.
function EscolherEtiqueta({ peca, etiquetas }: { peca: PecaClube; etiquetas: Etiquetas }) {
  const n = etiquetas.qtd(peca.id)
  if (n > 0) return <Quantidade valor={n} min={0} aoMudar={(q) => etiquetas.aoMudar(peca, q)} rotulo={`etiquetas de ${peca.codigo}`} />
  return (
    <Button variant="outline" size="sm" aria-label={`Etiquetar ${peca.codigo}`} onClick={() => etiquetas.aoMudar(peca, 1)}>
      <Printer /> Etiqueta
    </Button>
  )
}

// Cartão de um produto com variantes: o pai (foto, código, nome, preço) e uma linha por variante com o lápis e a lixeira.
export function CartaoProduto({ grupo, aoEditarProduto, aoEditarPeca, aoExcluir, etiquetas }: { grupo: GrupoClube<Peca>; aoEditarProduto: () => void; aoEditarPeca: (p: Peca) => void; aoExcluir: (p: Peca) => void; etiquetas?: Etiquetas }) {
  const primeira = grupo.pecas[0]
  const rotulos = rotulosDeVariantes(grupo.pecas.map((p) => p.variante))
  const codigo = grupo.modelo?.codigo_base ?? primeira.codigo
  const preco = grupo.modelo?.preco ?? primeira.preco
  return (
    <Card aria-label={`Produto ${codigo}`}>
      <CardContent className="flex flex-col gap-3">
        <Foto url={grupo.modelo?.foto_url ?? primeira.foto_url} alt={grupo.modelo?.nome ?? primeira.nome} ampliar />
        <div>
          <div className="font-mono text-sm font-semibold">{codigo}</div>
          <div className="text-sm">{grupo.modelo?.nome ?? primeira.nome}</div>
          <div className="text-sm font-medium tabular-nums">{reais(preco)}</div>
          <SeloLive liveEm={grupo.modelo?.live_em ?? primeira.live_em} />
        </div>
        <ul className="flex flex-col gap-1.5" aria-label="Variantes">
          {grupo.pecas.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="shrink-0">{rotulos[i]}</Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={p.codigo}>{p.codigo}</span>
              {p.preco != null && p.preco !== preco && <span className="text-xs font-medium tabular-nums">{reais(p.preco)}</span>}
              {etiquetas && <EscolherEtiqueta peca={p} etiquetas={etiquetas} />}
              <Button variant="ghost" size="icon-xs" aria-label={`Editar variante ${p.codigo}`} onClick={() => aoEditarPeca(p)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={`Excluir variante ${p.codigo}`} onClick={() => aoExcluir(p)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        {grupo.modelo && (
          <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" onClick={aoEditarProduto}>
            <Pencil /> Editar produto e variantes
          </Button>
        )}
      </CardContent>
    </Card>
  )
}


// Cartão de uma peça simples (sem produto pai): foto, código, nome, variante, preço, editar e excluir.
export function CartaoSimples({ peca, aoEditar, aoExcluir, etiquetas }: { peca: Peca; aoEditar: () => void; aoExcluir: () => void; etiquetas?: Etiquetas }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <Foto url={peca.foto_url} alt={peca.nome} ampliar />
        <div>
          <div className="font-mono text-sm font-semibold">{peca.codigo}</div>
          <div className="text-sm">{peca.nome}</div>
          {peca.variante && <div className="text-sm font-medium">{peca.variante}</div>}
          <div className="text-sm font-medium tabular-nums">{reais(peca.preco)}</div>
          <SeloLive liveEm={peca.live_em} />
        </div>
        {etiquetas && (
          <div className="flex justify-start">
            <EscolherEtiqueta peca={peca} etiquetas={etiquetas} />
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="mr-auto -ml-2 text-muted-foreground" onClick={aoEditar}>
            <Pencil /> Editar
          </Button>
          <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" onClick={aoExcluir}>
            <Trash2 /> Excluir
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
