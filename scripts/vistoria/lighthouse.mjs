// Lighthouse só na página de login: sem sessão, dados ou requisições de escrita ao banco.
import { chromium } from '@playwright/test'
import {writeFileSync} from 'node:fs'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const exec=promisify(execFile)
const nav=await chromium.launch({args:['--remote-debugging-port=9225']})
try{
 const {stdout}=await exec('npx',['--yes','lighthouse','https://arvenne-separacao.gmroocha.workers.dev/login','--port=9225','--only-categories=performance,accessibility,best-practices','--output=json','--output-path=/tmp/arvenne-vistoria2-lighthouse.json','--quiet'],{maxBuffer:1e6})
 if(stdout)writeFileSync('/tmp/arvenne-vistoria2-lighthouse-stdout.log',stdout)
}finally{await nav.close()}
