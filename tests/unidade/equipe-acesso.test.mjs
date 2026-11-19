import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'

// Função Edge equipe-acesso com o Supabase simulado: nada de rede, de login real nem de segredo.
const sim = vi.hoisted(() => ({
  handler: null, gestor: true, erroGestor: null, membro: null, criar: null, gravar: { error: null }, chamadas: [],
}))
vi.mock('../../supabase/functions/_shared/http.ts', () => ({
  cors: {},
  json: (body, status = 200) => new Response(JSON.stringify(body), { status }),
  comoUsuario: () => ({ rpc: async (nome) => { sim.chamadas.push(['rpc', nome]); return { data: sim.gestor, error: sim.erroGestor } } }),
  admin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sim.membro, error: null }) }) }),
      update: (dados) => ({ eq: async (_c, id) => { sim.chamadas.push(['update', dados, id]); return sim.gravar } }),
    }),
    auth: { admin: {
      createUser: async (a) => { sim.chamadas.push(['createUser', a]); return sim.criar },
      updateUserById: async (id, a) => { sim.chamadas.push(['updateUserById', id, a]); return { error: null } },
      deleteUser: async (id) => { sim.chamadas.push(['deleteUser', id]); return { error: null } },
    } },
  }),
}))

beforeAll(async () => { vi.stubGlobal('Deno', { serve: (fn) => { sim.handler = fn }, env: { get: () => 'x' } }); await import('../../supabase/functions/equipe-acesso/index.ts') })
afterAll(() => vi.unstubAllGlobals())
beforeEach(() => {
  sim.gestor = true; sim.erroGestor = null; sim.chamadas = []; sim.gravar = { error: null }
  sim.membro = { id: 'm1', nome: 'Ana', ativo: true, usuario: null, user_id: null }
  sim.criar = { data: { user: { id: 'u1' } }, error: null }
})
const chamar = (corpo, jwt = 'Bearer jwt-de-teste') => sim.handler(new Request('https://edge.ficticia.test', {
  method: 'POST', headers: jwt ? { Authorization: jwt } : {}, body: JSON.stringify(corpo),
}))
const chamou = (nome) => sim.chamadas.filter((c) => c[0] === nome)

test('só o gestor: funcionária, erro na conferência e chamada sem login são recusadas sem tocar em nada', async () => {
  sim.gestor = false
  const r = await chamar({ acao: 'criar', membro_id: 'm1', usuario: 'ana', senha: 'segredo1' })
  expect(r.status).toBe(403)
  expect((await r.json()).erro).toMatch(/Só o gestor/)
  sim.erroGestor = { message: 'permission denied' }; sim.gestor = null
  expect((await chamar({ acao: 'criar', membro_id: 'm1', usuario: 'ana', senha: 'segredo1' })).status).toBe(403)
  expect((await chamar({ acao: 'criar' }, '')).status).toBe(401)
  expect(chamou('createUser')).toHaveLength(0)
  expect(chamou('updateUserById')).toHaveLength(0)
})

test('criar: monta o e-mail interno, cria o login confirmado e grava usuario e user_id', async () => {
  const r = await chamar({ acao: 'criar', membro_id: 'm1', usuario: 'Ana Paula', senha: 'segredo1' })
  expect(r.status).toBe(200)
  expect(await r.json()).toEqual({ ok: true, usuario: 'anapaula' })
  expect(chamou('createUser')[0][1]).toEqual({ email: 'anapaula@equipe.arvenne.invalid', password: 'segredo1', email_confirm: true })
  expect(chamou('update')[0].slice(1)).toEqual([{ usuario: 'anapaula', user_id: 'u1' }, 'm1'])
  expect(chamou('updateUserById')).toHaveLength(0)
})

test('criar para pessoa desativada já deixa o acesso bloqueado', async () => {
  sim.membro.ativo = false
  await chamar({ acao: 'criar', membro_id: 'm1', usuario: 'ana', senha: 'segredo1' })
  expect(chamou('updateUserById')[0].slice(1)).toEqual(['u1', { ban_duration: '876000h' }])
})

test('criar: usuário que já existe volta em português e não deixa login solto', async () => {
  sim.criar = { data: { user: null }, error: { message: 'A user with this email address has already been registered' } }
  const r = await chamar({ acao: 'criar', membro_id: 'm1', usuario: 'ana', senha: 'segredo1' })
  expect(r.status).toBe(409)
  expect((await r.json()).erro).toBe('Este usuário já existe. Escolha outro.')
  expect(chamou('update')).toHaveLength(0)
  // Usuário repetido só descoberto na gravação (outra pessoa do Time): o login criado é apagado.
  sim.criar = { data: { user: { id: 'u2' } }, error: null }
  sim.gravar = { error: { code: '23505', message: 'duplicate key' } }
  const r2 = await chamar({ acao: 'criar', membro_id: 'm1', usuario: 'ana', senha: 'segredo1' })
  expect(r2.status).toBe(409)
  expect(chamou('deleteUser')[0][1]).toBe('u2')
})

test('criar: valida usuário, senha e pessoa que já tem acesso', async () => {
  expect((await chamar({ acao: 'criar', membro_id: 'm1', usuario: '!', senha: 'segredo1' })).status).toBe(400)
  const curta = await chamar({ acao: 'criar', membro_id: 'm1', usuario: 'ana', senha: '12345' })
  expect(curta.status).toBe(400)
  expect((await curta.json()).erro).toMatch(/pelo menos 6/)
  sim.membro.user_id = 'u9'
  const ja = await chamar({ acao: 'criar', membro_id: 'm1', usuario: 'ana', senha: 'segredo1' })
  expect(ja.status).toBe(409)
  expect(chamou('createUser')).toHaveLength(0)
  sim.membro = null
  expect((await chamar({ acao: 'criar', membro_id: 'nao', usuario: 'ana', senha: 'segredo1' })).status).toBe(404)
})

test('trocar senha, bloquear e desbloquear usam o login da pessoa; sem acesso, nada a fazer', async () => {
  sim.membro.user_id = 'u1'
  expect((await chamar({ acao: 'trocar_senha', membro_id: 'm1', senha: 'novasenha' })).status).toBe(200)
  expect(chamou('updateUserById')[0].slice(1)).toEqual(['u1', { password: 'novasenha' }])
  await chamar({ acao: 'bloquear', membro_id: 'm1' })
  await chamar({ acao: 'desbloquear', membro_id: 'm1' })
  expect(chamou('updateUserById').slice(1).map((c) => c[2])).toEqual([{ ban_duration: '876000h' }, { ban_duration: 'none' }])
  sim.chamadas = []; sim.membro.user_id = null
  expect(await (await chamar({ acao: 'bloquear', membro_id: 'm1' })).json()).toEqual({ ok: true, sem_acesso: true })
  const semAcesso = await chamar({ acao: 'trocar_senha', membro_id: 'm1', senha: 'novasenha' })
  expect(semAcesso.status).toBe(400)
  expect(chamou('updateUserById')).toHaveLength(0)
})
