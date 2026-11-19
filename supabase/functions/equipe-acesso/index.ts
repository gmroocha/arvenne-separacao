// Acesso por nome de usuário e senha, criado pelo gestor no Time. O Supabase exige e-mail, então o login usa um e-mail
// interno (<usuario>@equipe.arvenne.invalid) que ninguém vê (regra em _shared/usuario.ts).
//
// Entrada (POST, só gestor logado): { acao, membro_id, usuario?, senha? }
//   criar         membro_id, usuario, senha  → cria o login e grava equipe.usuario e equipe.user_id
//   trocar_senha  membro_id, senha           → muda a senha do login
//   bloquear      membro_id                  → impede de entrar (pessoa desativada ou excluída)
//   desbloquear   membro_id                  → volta a poder entrar
// Saída: { ok: true, ... } ou { erro } em português simples, com status 4xx/5xx.

import { admin, comoUsuario, cors, json } from "../_shared/http.ts";
import { emailInterno, normalizarUsuario, usuarioValido } from "../_shared/usuario.ts";

const BLOQUEIO = "876000h"; // cerca de 100 anos: na prática, para sempre

type Membro = { id: string; nome: string; ativo: boolean; usuario: string | null; user_id: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);

  // Só passa quem está logado E é gestor. O CRON_SECRET não vale aqui.
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ erro: "Entre no app para fazer isso." }, 401);
  const { data: ehGestor, error: erroGestor } = await comoUsuario(req).rpc("sou_gestor");
  if (erroGestor || ehGestor !== true) return json({ erro: "Só o gestor pode criar ou mudar acessos." }, 403);

  try {
    const corpo = (await req.json().catch(() => ({}))) as { acao?: string; membro_id?: string; usuario?: string; senha?: string };
    const sb = admin();
    const { data: membro, error: erroMembro } = await sb
      .from("equipe").select("id, nome, ativo, usuario, user_id").eq("id", corpo.membro_id ?? "").maybeSingle();
    if (erroMembro) throw new Error(erroMembro.message);
    if (!membro) return json({ erro: "Pessoa não encontrada no Time." }, 404);
    const m = membro as Membro;

    if (corpo.acao === "criar") {
      const usuario = normalizarUsuario(corpo.usuario ?? "");
      if (!usuarioValido(usuario)) return json({ erro: "O usuário precisa ter de 2 a 30 letras ou números, sem espaço nem acento." }, 400);
      const senha = corpo.senha ?? "";
      if (senha.length < 6) return json({ erro: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      if (senha.length > 72) return json({ erro: "A senha é longa demais (máximo 72 caracteres)." }, 400);
      if (m.user_id) return json({ erro: "Esta pessoa já tem acesso. Use Trocar senha." }, 409);

      const { data: criado, error: erroCriar } = await sb.auth.admin.createUser({
        email: emailInterno(usuario), password: senha, email_confirm: true,
      });
      if (erroCriar || !criado?.user) {
        if (erroCriar && /already|registered|exists|duplicate/i.test(erroCriar.message)) {
          return json({ erro: "Este usuário já existe. Escolha outro." }, 409);
        }
        throw new Error(erroCriar?.message ?? "Não foi possível criar o acesso.");
      }
      const { error: erroGravar } = await sb.from("equipe").update({ usuario, user_id: criado.user.id }).eq("id", m.id);
      if (erroGravar) {
        await sb.auth.admin.deleteUser(criado.user.id); // não deixa login solto
        if ((erroGravar as { code?: string }).code === "23505") return json({ erro: "Este usuário já existe. Escolha outro." }, 409);
        throw new Error(erroGravar.message);
      }
      // Pessoa desativada não entra, mesmo com o acesso recém-criado.
      if (!m.ativo) await sb.auth.admin.updateUserById(criado.user.id, { ban_duration: BLOQUEIO });
      return json({ ok: true, usuario });
    }

    if (corpo.acao === "trocar_senha") {
      if (!m.user_id) return json({ erro: "Esta pessoa ainda não tem acesso. Use Criar acesso." }, 400);
      const senha = corpo.senha ?? "";
      if (senha.length < 6) return json({ erro: "A senha precisa ter pelo menos 6 caracteres." }, 400);
      if (senha.length > 72) return json({ erro: "A senha é longa demais (máximo 72 caracteres)." }, 400);
      const { error } = await sb.auth.admin.updateUserById(m.user_id, { password: senha });
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    if (corpo.acao === "bloquear" || corpo.acao === "desbloquear") {
      // Quem entra só com e-mail (o gestor) não tem acesso por usuário: nada a bloquear aqui.
      if (!m.user_id) return json({ ok: true, sem_acesso: true });
      const { error } = await sb.auth.admin.updateUserById(m.user_id, { ban_duration: corpo.acao === "bloquear" ? BLOQUEIO : "none" });
      if (error) throw new Error(error.message);
      return json({ ok: true });
    }

    return json({ erro: "Ação desconhecida." }, 400);
  } catch (e) {
    console.error("equipe-acesso", e instanceof Error ? e.message : e);
    return json({ erro: "Não foi possível concluir agora. Tente de novo em instantes." }, 500);
  }
});
