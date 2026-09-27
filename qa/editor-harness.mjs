import * as openingShapeEditor from '../src/opening-shape-editor.js';
import * as diagnosticTargets from '../src/diagnostic-targets.js';
import * as checkReport from '../src/check-report.js';
import * as profileGeometry from '../src/wall-profile-geometry.js';
import * as wallTypeEditor from '../src/wall-type-editor.js';
import * as wallTypes from '../src/wall-types.js';
// Minimal DOM adapter for exercising real editor handlers in Node.
// This is NOT a browser or a CSS/layout test. Canvas rendering is optional.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import * as regions from '../src/regions.js';
import * as polygonAreas from '../src/polygon-areas.js';
import * as model from '../src/model.js';
import * as exporter from '../src/exporter.js';
import * as authoring from '../src/authoring.js';
import * as wallEdit from '../src/wall-edit.js';
import * as selection from '../src/selection.js';
import * as groupEdit from '../src/group-edit.js';
import * as floorStack from '../src/floor-stack.js';
import * as markers from '../src/markers.js';
import * as validation from '../src/validation.js';
import * as buildingDocument from '../src/document.js';
import * as examples from '../src/examples.js';
import { createHistory } from '../src/history.js';
import { WebPreview3D, webReviewDescription } from '../src/preview-web.js';
export async function createEditorHarness(){
  const require=createRequire(import.meta.url);
  const createCanvas=process.env.CANVAS_MODULE?require(process.env.CANVAS_MODULE).createCanvas:null;
  const noop=()=>{};
  class Element {
    constructor(tag='div'){
      this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.dataset={};this.style={};this.listeners={};this._value='';this._text='';this.className='';
      this.classList={add:c=>this.classList.toggle(c,true),remove:c=>this.classList.toggle(c,false),contains:c=>this.className.split(/\s+/).includes(c),
        toggle:(c,value)=>{const parts=new Set(this.className.split(/\s+/).filter(Boolean));value??=!parts.has(c);value?parts.add(c):parts.delete(c);this.className=[...parts].join(' ');return value;}};
      if(tag==='canvas'&&createCanvas)this.native=createCanvas(1100,760);
    }
    get value(){if(this.tagName==='SELECT'&&!this._valueSet)return this.children.find(c=>c.selected)?.value??this.children[0]?.value??'';return this._value;}
    set value(v){this._value=String(v);this._valueSet=true;}
    get valueAsNumber(){return this.value.trim()===''?NaN:Number(this.value);}
    set width(n){if(this.native)this.native.width=n;this._width=n;}
    get width(){return this.native?.width||this._width||1100;}
    set height(n){if(this.native)this.native.height=n;this._height=n;}
    get height(){return this.native?.height||this._height||760;}
    get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
    set textContent(s){this.children=[];this._text=String(s);}
    set innerHTML(s){this.children=[];this._text=s;this._value='';this._valueSet=false;}
    get innerHTML(){return this._text;}
    append(...nodes){for(const node of nodes){this.children.push(node);node.parentElement=this;}}
    appendChild(n){this.append(n);return n;}
    replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes);}
    contains(node){return this===node||this.children.some(c=>c.contains(node));}
    setAttribute(k,v){
      this.attrs[k]=String(v);
      if(k==='class')this.className=String(v);
      if(k==='id'||k==='type'||k==='value')this[k]=v;
      if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=v;
      if(['checked','disabled','hidden','open','selected'].includes(k))this[k]=true;
    }
    getAttribute(k){return this.attrs[k]??(k==='type'||k==='id'?this[k]??null:null);}
    matches(selector){
      return selector.split(',').some(raw=>{
        const parts=raw.trim().split(/\s+/),simple=parts.pop();
        const tag=/^[a-z][\w-]*/i.exec(simple)?.[0];
        if(tag&&this.tagName!==tag.toUpperCase())return false;
        if([...simple.matchAll(/#([\w-]+)/g)].some(m=>this.id!==m[1]))return false;
        if([...simple.matchAll(/\.([\w-]+)/g)].some(m=>!this.classList.contains(m[1])))return false;
        if([...simple.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)].some(m=>this.getAttribute(m[1])===null||(m[2]!==undefined&&this.getAttribute(m[1])!==m[2])))return false;
        if(parts.length){let parent=this.parentElement;while(parent&&!parent.matches(parts.join(' ')))parent=parent.parentElement;if(!parent)return false;}
        return true;
      });
    }
    querySelectorAll(s){return this.children.flatMap(c=>[...(c.matches(s)?[c]:[]),...c.querySelectorAll(s)]);}
    querySelector(s){return this.querySelectorAll(s)[0]||null;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    async dispatch(type,details={}){const e={target:this,button:0,pointerId:1,preventDefault:noop,...details};for(const fn of this.listeners[type]||[])await fn(e);}
    click(){return this.dispatch('click');}
    focus(){document.activeElement=this;}
    scrollIntoView(options){this.lastScrollOptions=options;}
    setPointerCapture(){}
    releasePointerCapture(){}
    getBoundingClientRect(){return {left:0,top:0,width:1100,height:760};}
    getContext(){return this.native?.getContext('2d')||new Proxy({measureText:t=>({width:t.length*7})},{get:(o,k)=>o[k]||noop,set:(o,k,v)=>{o[k]=v;return true;}});}
  }
  const document=new Element('document'),stack=[document];
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const voids=new Set(['meta','link','input','br','hr','img']);
  for(const token of html.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)){
    if(token.startsWith('<!'))continue;
    if(token.startsWith('</')){stack.pop();continue;}
    if(token.startsWith('<')){
      const tag=/^<([\w-]+)/.exec(token)?.[1];if(!tag)continue;
      const el=new Element(tag);
      for(const m of token.slice(tag.length+1,-1).matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))el.setAttribute(m[1],m[2]??m[3]??m[4]??'');
      stack.at(-1).append(el);if(!voids.has(tag)&&!token.endsWith('/>'))stack.push(el);
    }else stack.at(-1)._text+=token.replace(/&amp;/g,'&');
  }
  document.createElement=tag=>new Element(tag);
  document.createTextNode=text=>{const el=new Element('#text');el.textContent=text;return el;};
  const window=new Element('window');
  const storage=new Map(),localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
  const ResizeObserver=class {observe(){}};
  const errors=[],consoleProxy={...console,error:(...v)=>errors.push(v.map(String).join(' '))};
  class Preview3D extends WebPreview3D {
    constructor(canvas){super(canvas,{interactive:false});}
    draw(){if(createCanvas)super.draw();}
    resize(){}
  }
  const imported={...checkReport,...diagnosticTargets,...openingShapeEditor,...profileGeometry,...wallTypeEditor,...wallTypes,...regions,...polygonAreas,...model,...exporter,...authoring,...wallEdit,...selection,...groupEdit,...floorStack,...markers,...validation,...buildingDocument,...examples,createHistory,Preview3D,webReviewDescription,document,window,localStorage,ResizeObserver,devicePixelRatio:1,console:consoleProxy};
  const source=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8').replace(/^import\s+[\s\S]*?from\s+['"][^'"]+['"];\s*/gm,'');
  const api=new Function(...Object.keys(imported),'"use strict";\n'+source+'\nreturn {snapshot:()=>structuredClone(building),coordinates:worldToScreen,loadBuildingData,chooseSelection,selection:()=>structuredClone(selected),selections:()=>structuredClone(selectionItems()),pending:()=>({regionPoints:structuredClone(regionPoints),wallStart,wallOrigin,regionStart,endpointDrag,groupDrag,selectionBox}),drawPlan,preview};')(...Object.values(imported));
  return {...api,document,window,errors,$:s=>document.querySelector(s)};
}
