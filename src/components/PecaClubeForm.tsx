import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { ExternalLink, ImagePlus, RefreshCw, Sparkles, X } from "lucide-react"
import CampoReais from "@/components/CampoReais"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AspectRatio } from "@/components/ui/aspect-ratio"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import CampoVariante from "@/components/clube/CampoVariante"
import EditorVariantes from "@/components/clube/EditorVariantes"
import { useAtualizarPecaClube, useCriarPecaClube, useSalvarModeloClube } from "@/lib/api"
import { errosDoProduto, novaLinhaVariante, variantesParaSalvar, type LinhaVariante } from "@/lib/clubeModelos"
import { enviarFoto } from "@/lib/foto"
import { lerNumero, numeroParaTexto } from "@/lib/formato"
import { lerVariante, montarVariante, type ParteVariante } from "@/lib/varianteClube"
import type { ModeloClube, PecaClube } from "@/lib/tipos"

// Endereço do agente do GPT que melhora as fotos. Fica em .env.local / Cloudflare, para trocar sem código.
const LINK_AGENTE_FOTO = import.meta.env.VITE_LINK_AGENTE_FOTO as string | undefined

// O Supabase devolve erros que nem sempre são `Error`; sem isto a tela só mostrava o texto genérico.
function mensagem(err: unknown, padrao: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message)
  return padrao
}

// Sem "peca": cadastra uma nova (simples, ou "produto com variantes" no seletor). Com "peca": edita aquela (a foto atual
// fica, a menos que troque ou remova). Com "produto": edita o produto com variantes (o pai e todas as variantes juntos).
// Produto com variantes grava tudo numa chamada só (salvar_modelo_clube): se algo falha, nada fica salvo.
type Produto = { modelo: ModeloClube; pecas: PecaClube[] }
export default function PecaClubeForm({ peca, produto, aoSalvar }: { peca?: PecaClube; produto?: Produto; aoSalvar: (peca: PecaClube | null) => void }) {
  const criar = useCriarPecaClube()
  const atualizar = useAtualizarPecaClube()
  const salvarModelo = useSalvarModeloClube()
  const base = produto?.modelo ?? peca
  const [comVariantes, setComVariantes] = useState(!!produto)
  const [linhas, setLinhas] = useState<LinhaVariante[]>(() =>
    produto
      ? produto.pecas.map((p) => ({
          chave: p.id, id: p.id, partes: lerVariante(p.variante), codigoManual: p.codigo,
          preco: p.preco != null && p.preco !== produto.modelo.preco ? numeroParaTexto(p.preco) : "",
        }))
      : [novaLinhaVariante([{ tipo: "tamanho", valor: "" }])],
  )
  const [mostrarErros, setMostrarErros] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [fotoAtual, setFotoAtual] = useState<string | null>(base?.foto_url ?? null)
  const [codigo, setCodigo] = useState(produto ? produto.modelo.codigo_base : (peca?.codigo ?? ""))
  const [nome, setNome] = useState(base?.nome ?? "")
  const [partes, setPartes] = useState<ParteVariante[]>(() => lerVariante(peca?.variante))
  const [preco, setPreco] = useState(numeroParaTexto(base?.preco ?? null))
  const [enviando, setEnviando] = useState(false)

  const novaPrevia = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo])
  const previa = novaPrevia ?? fotoAtual
  useEffect(() => {
    return () => {
      if (novaPrevia) URL.revokeObjectURL(novaPrevia)
    }
  }, [novaPrevia])

  function remover() {
    setArquivo(null)
    setFotoAtual(null)
    if (entrada.current) entrada.current.value = ""
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const precoLido = preco.trim() ? lerNumero(preco) : null
    if (preco.trim() && precoLido == null) return void toast.error("Preço não entendido. Use, por exemplo, 49,90")
    if (comVariantes) {
      const erros = errosDoProduto({ codigo, nome, preco, linhas })
      if (erros.length || linhas.length === 0) {
        setMostrarErros(true)
        return void toast.error(linhas.length === 0 ? "Adicione ao menos uma variante" : erros[0])
      }
    }
    setEnviando(true)
    let foto_url: string | null = fotoAtual
    try {
      if (arquivo) foto_url = await enviarFoto(arquivo)
    } catch (err) {
      toast.error(`Não foi possível enviar a foto: ${mensagem(err, "erro desconhecido")}`)
      setEnviando(false)
      return
    }
    try {
      if (comVariantes) {
        await salvarModelo.mutateAsync({
          ...(produto ? { id: produto.modelo.id } : {}),
          codigo: codigo.trim(), nome: nome.trim(), preco: precoLido, foto_url, variantes: variantesParaSalvar(codigo, linhas),
        })
        toast.success(produto ? "Produto atualizado" : "Produto salvo no Clube com as variantes")
        aoSalvar(null)
        return
      }
      const dados = { codigo: codigo.trim(), nome: nome.trim(), variante: montarVariante(partes), preco: precoLido, foto_url }
      const salva = peca ? await atualizar.mutateAsync({ id: peca.id, ...dados }) : await criar.mutateAsync(dados)
      toast.success(peca ? "Peça do Clube atualizada" : "Peça salva no Clube")
      aoSalvar(salva)
    } catch (err) {
      toast.error(`Não foi possível salvar a peça: ${mensagem(err, "erro desconhecido")}`)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="grid grid-cols-1 gap-6 sm:grid-cols-[13rem_1fr]">
      <Alert className="sm:col-span-2">
        <Sparkles />
        <AlertTitle>Melhore a foto antes de enviar</AlertTitle>
        <AlertDescription>
          Passe a foto pelo agente do GPT (qualidade, nitidez e contraste) e suba aqui a versão melhorada.
        </AlertDescription>
        {LINK_AGENTE_FOTO && (
          <AlertAction>
            <Button asChild variant="outline" size="sm">
              <a href={LINK_AGENTE_FOTO} target="_blank" rel="noreferrer">
                Abrir agente <ExternalLink />
              </a>
            </Button>
          </AlertAction>
        )}
      </Alert>
      <div className="mx-auto flex w-full max-w-48 flex-col gap-2 sm:mx-0 sm:max-w-none">
        <AspectRatio ratio={4 / 5}>
          <label className="relative flex size-full cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed bg-muted/40 text-sm text-muted-foreground transition-colors hover:bg-muted has-focus-visible:border-ring has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50">
            {previa ? (
              <img src={previa} alt="Prévia da foto" className="size-full object-cover" />
            ) : (
              <>
                <ImagePlus className="size-6" />
                <span>Adicionar foto</span>
              </>
            )}
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            />
          </label>
        </AspectRatio>
        {previa && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => entrada.current?.click()}>
              <RefreshCw /> Trocar
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={remover}>
              <X /> Remover
            </Button>
          </div>
        )}
      </div>

      <FieldGroup>
        {!peca && !produto && (
          <Field orientation="horizontal">
            <Switch id="com-variantes" checked={comVariantes} onCheckedChange={setComVariantes} />
            <FieldLabel htmlFor="com-variantes">Produto com variantes</FieldLabel>
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="codigo">{comVariantes ? "Código do produto" : "Código"}</FieldLabel>
            <Input id="codigo" required value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="preco">Preço</FieldLabel>
            <CampoReais id="preco" value={preco} onValueChange={setPreco} />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="nome">Nome</FieldLabel>
          <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        {comVariantes ? (
          <EditorVariantes base={codigo} linhas={linhas} aoMudar={setLinhas} mostrarErros={mostrarErros} precoBase={preco} />
        ) : (
          <CampoVariante partes={partes} aoMudar={setPartes} />
        )}
        <Button type="submit" disabled={enviando}>
          {enviando && <Spinner />} {peca || produto ? "Salvar alterações" : comVariantes ? "Salvar produto" : "Salvar peça"}
        </Button>
      </FieldGroup>
    </form>
  )
}
