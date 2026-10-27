/* Arbeitsfrei iPad 10.21: einseitiger PDF-Export ohne Safari-Druckkopf.
   Keine externen Dienste/Bibliotheken, keine Übertragung von Personaldaten. */
(function(){
'use strict';
const $id=id=>document.getElementById(id);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function styleValue(el){return getComputedStyle(el)}
function rectIn(el,root){let r=el.getBoundingClientRect(),b=root.getBoundingClientRect();return {x:r.left-b.left,y:r.top-b.top,w:r.width,h:r.height}}
function fillBackground(ctx,el,r){
 const st=styleValue(el),bg=st.backgroundColor;
 if(bg && bg!=='transparent' && bg!=='rgba(0, 0, 0, 0)') {ctx.fillStyle=bg;ctx.fillRect(r.x,r.y,r.w,r.h)}
 const border=parseFloat(st.borderTopWidth)||0;
 if(border>0 && st.borderTopStyle!=='none'){
  ctx.strokeStyle=st.borderTopColor;ctx.lineWidth=Math.max(.5,border);
  ctx.strokeRect(r.x+border/2,r.y+border/2,Math.max(0,r.w-border),Math.max(0,r.h-border));
 }
}
function textNode(ctx,node,root){
 if(!node.textContent.trim())return;
 const el=node.parentElement,st=styleValue(el);
 if(st.visibility==='hidden'||st.display==='none')return;
 const text=node.textContent;
 const fs=parseFloat(st.fontSize)||12;
 ctx.font=[st.fontStyle,st.fontWeight,fs+'px',st.fontFamily].join(' ');
 ctx.fillStyle=st.color||'#111';ctx.textBaseline='alphabetic';
 // Ranges liefern echte Zeilenpositionen auch bei verschachtelten Texten.
 let start=0;
 const parts=text.match(/\S+\s*|\s+/g)||[];
 for(const part of parts){
  const end=start+part.length;
  if(part.trim()){
   const range=document.createRange();range.setStart(node,start);range.setEnd(node,end);
   const rr=range.getBoundingClientRect(),base=root.getBoundingClientRect();
   if(rr.width&&rr.height)ctx.fillText(part,rr.left-base.left,rr.top-base.top+rr.height*.79);
  }
  start=end;
 }
}
async function drawNode(ctx,node,root){
 if(node.nodeType===3){textNode(ctx,node,root);return}
 if(node.nodeType!==1)return;
 const el=node,st=styleValue(el);
 if(st.display==='none'||st.visibility==='hidden'||parseFloat(st.opacity)===0)return;
 const r=rectIn(el,root);
 if(r.w<=0||r.h<=0)return;
 ctx.save();
 // Verhindert, dass Text und Streifen über die Zelle hinausragen.
 if(st.overflow==='hidden'||st.overflow==='clip') {ctx.beginPath();ctx.rect(r.x,r.y,r.w,r.h);ctx.clip()}
 fillBackground(ctx,el,r);
 if(el.tagName==='IMG'&&el.complete&&el.naturalWidth){try{ctx.drawImage(el,r.x,r.y,r.w,r.h)}catch(e){}}
 for(const child of el.childNodes)await drawNode(ctx,child,root);
 ctx.restore();
}
function pdfFromJpeg(jpeg,width,height,pixelW,pixelH){
 const b64=jpeg.split(',')[1],binary=atob(b64),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const encoder=new TextEncoder(),chunks=[],offsets=[0],W=width,H=height;
 let pos=0;
 const push=str=>{let b=encoder.encode(str);chunks.push(b);pos+=b.length};
 const raw=b=>{chunks.push(b);pos+=b.length};
 const obj=(id,content)=>{offsets[id]=pos;push(id+' 0 obj\n'+content+'\nendobj\n')};
 push('%PDF-1.4\n');
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
 offsets[4]=pos;push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width  ${pixelW} /Height ${pixelH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);raw(bytes);push('\nendstream\nendobj\n');
 const content=`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
 obj(5,`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
 const xref=pos;push('xref\n0 6\n0000000000 65535 f \n');
 for(let i=1;i<=5;i++)push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
 return new Blob(chunks,{type:'application/pdf'});
}
function showPdf(blob,name){
 const url=URL.createObjectURL(blob);
 const overlay=document.createElement('div');overlay.id='arbeitsfrei-pdf-modal';
 overlay.style.cssText='position:fixed;inset:0;z-index:999999;background:#102039ee;display:flex;flex-direction:column;gap:10px;padding:12px;box-sizing:border-box;color:white;font:15px system-ui';
 const bar=document.createElement('div');bar.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap';
 const title=document.createElement('strong');title.textContent='PDF fertig – genau eine A4-Seite';bar.append(title);
 const link=document.createElement('a');link.href=url;link.download=name;link.textContent='PDF speichern / öffnen';link.style.cssText='background:#fff;color:#15345c;padding:10px;border-radius:7px;text-decoration:none';bar.append(link);
 const share=document.createElement('button');share.textContent='Teilen / Drucken';share.onclick=async()=>{
  try{const file=new File([blob],name,{type:'application/pdf'});if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:name});return}}catch(e){if(e.name==='AbortError')return}
  window.open(url,'_blank');
 };bar.append(share);
 const close=document.createElement('button');close.textContent='Schließen';close.onclick=()=>{overlay.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)};bar.append(close);
 const viewer=document.createElement('iframe');viewer.src=url;viewer.title='PDF-Vorschau';viewer.style.cssText='flex:1;min-height:0;width:100%;background:white;border:0;border-radius:6px';
 overlay.append(bar,viewer);document.body.append(overlay);
}
async function renderPdf(){
 const request=document.body.classList.contains('print-request');
 const category=document.body.classList.contains('print-category');
 const person=document.body.classList.contains('print-person');
 const details=document.body.classList.contains('print-person-details');
 const portrait=request||details;
 const pageW=portrait?210:297,pageH=portrait?297:210;
 let source=request?$id('printRequest').querySelector('.original-pdf-exact'):
   category?$id('printCategory'):
   person?(details?$id('printPerson').querySelector('.print-details'):$id('printPerson').querySelector('.employee-print-landscape')):
   $id('allCalendar');
 if(!source)throw new Error('Druckansicht fehlt');
 // Kopie außerhalb der sichtbaren Seite: Layout berechnen, ohne App-Inhalte zu verändern.
 const host=document.createElement('div');host.id='arbeitsfrei-pdf-stage';
 host.style.cssText='position:fixed;left:-10000px;top:0;z-index:-1;visibility:visible;background:white;box-sizing:border-box;';
 host.style.width=(portrait?794:1122)+'px';
 const clone=source.cloneNode(true);clone.style.display='block';clone.style.margin='0';clone.style.boxShadow='none';clone.style.border='0';
 if(!request){clone.style.width='100%';clone.style.padding='0';clone.style.minWidth='0';
  clone.querySelectorAll('.no-print').forEach(n=>n.remove());
  clone.querySelectorAll('.calendar').forEach(n=>{n.style.minWidth='0';n.style.width='100%';n.style.display='grid';n.style.gridTemplateColumns='repeat(12,minmax(0,1fr))'});
 }
 host.append(clone);document.body.append(host);
 let requestStyle=null;
 if(request){
  const rules=[];
  for(const sheet of Array.from(document.styleSheets)){
   try{
    for(const r of Array.from(sheet.cssRules||[])){
     if(r.conditionText&&r.conditionText.includes('print')){
      for(const inner of Array.from(r.cssRules||[])){
       if(inner.selectorText?.includes('body.print-request #printRequest')){
        const selector=inner.selectorText.split(',').filter(x=>x.includes('body.print-request #printRequest')).map(x=>x.trim().replace(/body\.print-request\s+#printRequest/g,'#arbeitsfrei-pdf-stage')).join(',');
        if(selector)rules.push(selector+'{'+inner.style.cssText+'}');
       }
      }
     }
    }
   }catch(e){}
  }
  requestStyle=document.createElement('style');
  requestStyle.textContent=rules.join('\n')+'\n#arbeitsfrei-pdf-stage .original-pdf-exact{display:block!important;position:relative!important;width:794px!important;height:1123px!important;overflow:hidden!important;background:white!important}';
  document.head.append(requestStyle);
 }

 try{
  await wait(100);await document.fonts?.ready;
  for(const img of clone.querySelectorAll('img')){if(!img.complete)await new Promise(r=>{img.onload=r;img.onerror=r})}
  const rw=clone.getBoundingClientRect().width,rh=clone.getBoundingClientRect().height;
  if(!rw||!rh)throw new Error('Druckbereich leer');
  const scale=2.3,canvas=document.createElement('canvas');
  canvas.width=Math.round(pageW/25.4*96*scale);canvas.height=Math.round(pageH/25.4*96*scale);
  const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  const margin=request?0:Math.round(5/25.4*96*scale);
  const availableW=canvas.width-2*margin,availableH=canvas.height-2*margin;
  const k=Math.min(availableW/rw,availableH/rh);
  ctx.translate(margin+(availableW-rw*k)/2,margin+(availableH-rh*k)/2);ctx.scale(k,k);
  await drawNode(ctx,clone,clone);
  const blob=pdfFromJpeg(canvas.toDataURL('image/jpeg',.91),pageW*72/25.4,pageH*72/25.4,canvas.width,canvas.height);
  const kind=request?'Urlaubsantrag':category?'Berufsgruppen-Kalender':person?(details?'Mitarbeiter-Details':'Mitarbeiter-Kalender'):'Jahreskalender';
  showPdf(blob,'Arbeitsfrei_'+kind+'_'+(typeof year!=='undefined'?year:'')+'.pdf');
 }finally{host.remove();requestStyle?.remove();document.body.classList.remove('print-request','print-category','print-person-calendar','print-person-details');}
}
let busy=false;
window.arbeitsfreiPdfExport=async function(){
 if(busy)return;busy=true;
 try{await renderPdf()}catch(e){console.error(e);alert('PDF konnte nicht erstellt werden: '+e.message)}finally{busy=false}
};
})();
