// Só registra tamanhos/nomes; valores do ambiente nunca saem do processo.
import {gzipSync} from 'node:zlib'
import {readdirSync,readFileSync,writeFileSync} from 'node:fs'
process.loadEnvFile('.env.local')
const chaves=[...readFileSync('.env.local','utf8').matchAll(/^\s*(?:export\s+)?([A-Za-z_]\w*)\s*=/gm)].map(x=>x[1])
const privadas=chaves.filter(k=>!k.startsWith('VITE_')).map(k=>process.env[k]).filter(v=>v&&v.length>=8)
const anon=process.env.VITE_SUPABASE_ANON_KEY??''
if(!anon.startsWith('sb_publishable_')){
 let role
 try{role=JSON.parse(Buffer.from(anon.split('.')[1],'base64url')).role}catch{throw Error('Chave pública com formato inesperado (valor omitido)')}
 if(role!=='anon')throw Error('Chave do frontend não tem papel anon (valor omitido)')
}
const arquivos=readdirSync('dist/assets').sort().map(nome=>{
 const b=readFileSync(`dist/assets/${nome}`)
 if(/\.(?:js|css)$/.test(nome)&&privadas.some(v=>b.includes(Buffer.from(v))))throw Error('Valor privado do ambiente encontrado no bundle; valor omitido')
 return{arquivo:nome,bytes:b.length,gzipBytes:gzipSync(b).length}
})
const resultado={ambientePrivadoVerificado:privadas.length,chaveFrontend:'anon/publishable',arquivos}
writeFileSync('docs/VISTORIA-2-BUNDLE-DEPOIS.json',JSON.stringify(resultado,null,2)+'\n')
console.log(JSON.stringify({arquivos:arquivos.length,segredosConhecidosAusentes:privadas.length,chaveFrontend:resultado.chaveFrontend}))
