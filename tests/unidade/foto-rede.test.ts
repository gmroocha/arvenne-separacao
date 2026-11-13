import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {expect,test} from 'vitest'
import Foto from '@/components/Foto'

test('V54: miniatura Shopify limita a foto original sem alterar URLs externas ou miniaturas menores',()=>{
 const html=(url:string)=>renderToStaticMarkup(createElement(Foto,{url,alt:'Anel'}))
 expect(html('https://cdn.shopify.com/s/files/1/anel.jpg?v=7')).toContain('width=600')
 expect(html('https://cdn.shopify.com/s/files/1/anel.jpg?width=1200')).toContain('width=600')
 expect(html('https://cdn.shopify.com/s/files/1/anel.jpg?width=140')).toContain('width=140')
 expect(html('https://foto.ficticia.test/anel.jpg?v=7')).toContain('https://foto.ficticia.test/anel.jpg?v=7')
})
