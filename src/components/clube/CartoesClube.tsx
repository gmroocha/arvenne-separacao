import { Pencil, Printer } from "lucide-react"
import Foto from "@/components/Foto"
import PecaClubeForm from "@/components/PecaClubeForm"
import { Quantidade } from "@/components/comum/Quantidade"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { usePecasDoModelo } from "@/lib/api"
import { rotulosDeVariantes, type GrupoClube } from "@/lib/clubeModelos"
import { diaMes, reais } from "@/lib/formato"
import type { ModeloClube, PecaClube } from "@/lib/tipos"

export type Peca = PecaClube & { ativo: boolean }

// Edita o produto inteiro (o pai e as variantes, ativas ou não): busca as variantes e abre o formulário.
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

// Cartão de um produto com variantes: o pai (foto, código, nome, preço) e uma linha por variante com o botão de ativar e o lápis.
export function CartaoProduto({ grupo, aoEditarProduto, aoEditarPeca, aoAtivar, etiquetas }: { grupo: GrupoClube<Peca>; aoEditarProduto: () => void; aoEditarPeca: (p: Peca) => void; aoAtivar: (p: Peca, ativo: boolean) => void; etiquetas?: Etiquetas }) {
  const primeira = grupo.pecas[0]
  const rotulos = rotulosDeVariantes(grupo.pecas.map((p) => p.variante))
  const codigo = grupo.modelo?.codigo_base ?? primeira.codigo
  const preco = grupo.modelo?.preco ?? primeira.preco
  const todasInativas = grupo.pecas.every((p) => !p.ativo)
  return (
    <Card className={todasInativas ? "opacity-50" : ""} aria-label={`Produto ${codigo}`}>
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
            <li key={p.id} className={`flex flex-wrap items-center gap-2 ${p.ativo ? "" : "opacity-50"}`}>
              <Badge variant="outline" className="shrink-0">{rotulos[i]}</Badge>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground" title={p.codigo}>{p.codigo}</span>
              {p.preco != null && p.preco !== preco && <span className="text-xs font-medium tabular-nums">{reais(p.preco)}</span>}
              {etiquetas && p.ativo && <EscolherEtiqueta peca={p} etiquetas={etiquetas} />}
              <Switch size="sm" checked={p.ativo} aria-label={`Ativa ${p.codigo}`} onCheckedChange={(a) => aoAtivar(p, a)} />
              <Button variant="ghost" size="icon-xs" aria-label={`Editar variante ${p.codigo}`} onClick={() => aoEditarPeca(p)}>
                <Pencil />
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


// Cartão de uma peça simples (sem produto pai): foto, código, nome, variante, preço, editar e ativar.
export function CartaoSimples({ peca, aoEditar, aoAtivar, etiquetas }: { peca: Peca; aoEditar: () => void; aoAtivar: (ativo: boolean) => void; etiquetas?: Etiquetas }) {
  return (
    <Card className={peca.ativo ? "" : "opacity-50"}>
      <CardContent className="flex flex-col gap-3">
        <Foto url={peca.foto_url} alt={peca.nome} ampliar />
        <div>
          <div className="font-mono text-sm font-semibold">{peca.codigo}</div>
          <div className="text-sm">{peca.nome}</div>
          {peca.variante && <div className="text-sm font-medium">{peca.variante}</div>}
          <div className="text-sm font-medium tabular-nums">{reais(peca.preco)}</div>
          <SeloLive liveEm={peca.live_em} />
        </div>
        {etiquetas && peca.ativo && (
          <div className="flex justify-start">
            <EscolherEtiqueta peca={peca} etiquetas={etiquetas} />
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" className="mr-auto -ml-2 text-muted-foreground" onClick={aoEditar}>
            <Pencil /> Editar
          </Button>
          <Label htmlFor={`a-${peca.id}`} className="text-xs">
            Ativa
          </Label>
          <Switch id={`a-${peca.id}`} checked={peca.ativo} onCheckedChange={aoAtivar} />
        </div>
      </CardContent>
    </Card>
  )
}
