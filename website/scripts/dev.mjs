import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {Readable} from 'node:stream';
const root=path.resolve(import.meta.dirname,'..');
const {default:worker}=await import(pathToFileURL(path.join(process.env.MUSHAFI_WEB_OUTPUT||root+'/dist','server/index.js')));
const ctx={waitUntil:p=>p.catch(()=>{})};
const server=http.createServer(async(req,res)=>{try{const request=new Request('http://127.0.0.1:8787'+req.url,{method:req.method,headers:req.headers}),result=await worker.fetch(request,{},ctx);res.writeHead(result.status,Object.fromEntries(result.headers));if(result.body)Readable.fromWeb(result.body).pipe(res);else res.end()}catch(e){res.writeHead(500);res.end('Local preview error')}});server.listen(8787,'0.0.0.0',()=>console.log('Local: http://127.0.0.1:8787'));
