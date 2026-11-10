import { useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useCriarPecaClube } from "@/lib/api"
import { enviarFoto } from "@/lib/foto"
import type { PecaClube } from "@/lib/tipos"

export default function PecaClubeForm({ aoSalvar }: { aoSalvar: (peca: PecaClube) => void }) {
  const criar = useCriarPecaClube()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [codigo, setCodigo] = useState("")
  const [nome, setNome] = useState("")
  const [variante, setVariante] = useState("")
  const [preco, setPreco] = useState("")
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    try {
      const foto_url = arquivo ? await enviarFoto(arquivo) : null
      const peca = await criar.mutateAsync({
        codigo: codigo.trim(),
        nome: nome.trim(),
        variante: variante.trim() || null,
        preco: preco ? Number(preco.replace(",", ".")) : null,
        foto_url,
      })
      toast.success("Peça salva no Clube")
      aoSalvar(peca)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar a foto")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="foto">
            <Camera className="size-4" /> Foto
          </FieldLabel>
          <Input
            id="foto"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="codigo">Código</FieldLabel>
          <Input id="codigo" required value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="nome">Nome</FieldLabel>
          <Input id="nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="variante">Variante</FieldLabel>
          <Input id="variante" placeholder="Ex.: aro 16" value={variante} onChange={(e) => setVariante(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="preco">Preço (R$)</FieldLabel>
          <Input id="preco" inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} />
        </Field>
        <Button type="submit" disabled={enviando}>
          {enviando && <Spinner />} Salvar peça
        </Button>
      </FieldGroup>
    </form>
  )
}
