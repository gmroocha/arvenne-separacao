import { supabase } from "@/lib/supabase"

// Reduz a foto para no máximo 1200 px e converte para webp.
export async function comprimirFoto(arquivo: File): Promise<Blob> {
  const img = await createImageBitmap(arquivo)
  const escala = Math.min(1, 1200 / Math.max(img.width, img.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(img.width * escala)
  canvas.height = Math.round(img.height * escala)
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não foi possível comprimir a foto"))), "image/webp", 0.8),
  )
}

// Comprime, sobe no bucket "fotos" e devolve a URL pública.
export async function enviarFoto(arquivo: File): Promise<string> {
  const blob = await comprimirFoto(arquivo)
  const caminho = `clube/${crypto.randomUUID()}.webp`
  const { error } = await supabase.storage.from("fotos").upload(caminho, blob, { contentType: "image/webp" })
  if (error) throw new Error(error.message)
  return supabase.storage.from("fotos").getPublicUrl(caminho).data.publicUrl
}
