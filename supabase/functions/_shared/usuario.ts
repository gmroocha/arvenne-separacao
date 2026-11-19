// Login por nome de usuário. O Supabase só aceita e-mail, então cada pessoa recebe um e-mail interno que ninguém vê:
// <usuario>@equipe.arvenne.invalid (".invalid" nunca existe de verdade, então nenhuma mensagem sai para lá).
// A MESMA regra vive em src/lib/loginInterno.ts (o app monta o e-mail ao entrar); tests/unidade/loginInterno.test.ts
// garante que as duas ficam iguais. Sem importações: serve para o Deno e para o app.

export const DOMINIO_INTERNO = "equipe.arvenne.invalid";

// Minúsculas, sem acento e sem espaço; só letras, números, ponto, hífen e sublinhado.
export function normalizarUsuario(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9._-]/g, "");
}

// Mesmo formato do check da coluna equipe.usuario.
export function usuarioValido(usuario: string): boolean {
  return /^[a-z0-9._-]{2,30}$/.test(usuario);
}

export function emailInterno(usuario: string): string {
  return `${normalizarUsuario(usuario)}@${DOMINIO_INTERNO}`;
}
