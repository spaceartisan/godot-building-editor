import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSceneFiles, godotRenderAvailability, RenderError } from './godot-render.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const portText=process.env.PORT??'5173';
if(!/^\d+$/.test(portText)||Number(portText)>65535){
  console.error('Building Editor: PORT must be an integer from 0 through 65535 (0 chooses an available port).');
  process.exit(2);
}
const port=Number(portText);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.tscn':'text/plain; charset=utf-8'};
const MAX_BODY=64*1024*1024;
let availability=null,rendering=false;
const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};

// Godot rendering spawns a process, so API calls must come from this editor:
// a loopback Host (no DNS rebinding) and a custom header, which cross-site
// pages cannot send without a CORS preflight this server never approves.
function trusted(req){
  const host=String(req.headers.host||'').replace(/:\d+$/,'');
  return ['localhost','127.0.0.1','[::1]'].includes(host)&&req.headers['x-building-editor']==='1';
}
async function api(req,res,rel){
  if(!trusted(req))return json(res,403,{ok:false,error:'Forbidden: editor API requests must come from the local editor page.'});
  if(rel==='/api/capabilities'&&req.method==='GET'){
    availability??=godotRenderAvailability(process.env.GODOT_BIN);
    return json(res,200,{ok:true,godotRender:availability});
  }
  if(rel==='/api/godot-render'&&req.method==='POST'){
    availability??=godotRenderAvailability(process.env.GODOT_BIN);
    if(!availability.available)return json(res,503,{ok:false,error:availability.reason});
    if(rendering)return json(res,409,{ok:false,error:'A Godot render is already running; try again when it finishes.'});
    if(!/^application\/json\b/.test(req.headers['content-type']||''))return json(res,415,{ok:false,error:'Expected application/json'});
    // Claim the single render slot before awaiting the body, so a second
    // request arriving meanwhile is refused instead of starting another Godot.
    rendering=true;
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)return json(res,413,{ok:false,error:'Request too large (64 MiB limit)'});chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return json(res,400,{ok:false,error:'Invalid JSON'});}
      const result=await renderSceneFiles({executable:process.env.GODOT_BIN,files:body?.files,views:body?.views??null,extraViews:body?.extraViews??[],colorMode:body?.colorMode??'materials'});
      return json(res,200,{ok:true,engineVersion:availability.engineVersion,colorMode:result.colorMode,renderer:result.renderer,virtualDisplay:result.virtualDisplay,views:result.manifest,
        images:result.entries.map(e=>({file:e.name,png:e.data.toString('base64')}))});
    }catch(e){return json(res,e instanceof RenderError&&e.code===2?400:500,{ok:false,error:e.message});}
    finally{rendering=false;}
  }
  return json(res,404,{ok:false,error:'Unknown editor API endpoint'});
}

const server=http.createServer((req,res)=>{
  let rel;try{rel=decodeURIComponent((req.url||'/').split('?')[0]);}catch{res.writeHead(400);return res.end('Invalid URL');} if(rel==='/') rel='/index.html';
  if(rel.startsWith('/api/'))return api(req,res,rel).catch(e=>json(res,500,{ok:false,error:e.message}));
  const file=path.normalize(path.join(root,rel));
  if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);});
});
server.on('error',error=>{
  const message=error.code==='EADDRINUSE'
    ? `Port ${port} is already in use. Stop the other server or choose another port, for example PORT=5174 node server.mjs.`
    : `Could not start the local server: ${error.message}`;
  console.error(`Building Editor: ${message}`);
  process.exitCode=3;
});
server.listen(port,'127.0.0.1',()=>console.log(`Building Editor: http://localhost:${server.address().port}`));
