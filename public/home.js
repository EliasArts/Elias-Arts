const esc=s=>String(s??'').replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]));
async function loadHome(){
 const cg=document.getElementById('categoryGrid'),lg=document.getElementById('latestGrid'),pg=document.getElementById('popularGrid');
 if(cg)cg.innerHTML='<div class="small">Loading collections…</div>';
 if(lg)lg.innerHTML='<div class="small">Loading printables…</div>';
 if(pg)pg.innerHTML='<div class="small">Loading most-downloaded printables…</div>';
 const [cr,pr,rr]=await Promise.allSettled([fetch('/api/categories'),fetch('/api/printables'),fetch('/api/popular')]);
 if(cr.status==='fulfilled'&&cr.value.ok){
  try{
   const cats=await cr.value.json();
   if(cg)cg.innerHTML=cats.map(c=>'<a class="cat" href="/category.html?slug='+encodeURIComponent(c.slug)+'"><div class="cat-banner">'+(c.banner_url?'<img loading="lazy" src="'+esc(c.banner_url)+'" alt="'+esc(c.name)+' category banner" style="width:100%;height:100%;object-fit:cover;border-radius:13px">':'<span>Explore collection</span>')+'</div><div class="cat-name">'+esc(c.name)+'</div><div class="cat-topics">'+esc(c.description||'Printable collection')+'</div></a>').join('');
  }catch{if(cg)cg.innerHTML='<div class="small">Collections are temporarily unavailable. Please refresh.</div>'}
 }else if(cg)cg.innerHTML='<div class="small">Collections are temporarily unavailable. Please refresh.</div>';
 if(pr.status==='fulfilled'&&pr.value.ok){
  try{
   const prints=await pr.value.json();
   if(lg)lg.innerHTML=prints.slice(0,6).map(p=>'<a href="/printable.html?slug='+encodeURIComponent(p.slug)+'"><div class="card-img">'+(p.cover_url?'<img loading="lazy" src="'+p.cover_url+'" alt="'+esc(p.title)+'" style="width:100%;height:100%;object-fit:contain">':'<span class="small">Preview</span>')+'</div><div class="card-title">'+esc(p.title)+'</div><div class="meta">'+esc(p.topic_name||p.category_name||'Printable')+' · Free</div></a>').join('')||'<div class="small">New printables are coming soon.</div>';
  }catch{if(lg)lg.innerHTML='<div class="small">Printables are temporarily unavailable. Please refresh.</div>'}
 }else if(lg)lg.innerHTML='<div class="small">Printables are temporarily unavailable. Please refresh.</div>';
 if(rr.status==='fulfilled'&&rr.value.ok){
  try{
   const prints=await rr.value.json();
   if(pg)pg.innerHTML=prints.slice(0,6).map((p,i)=>'<a href="/printable.html?slug='+encodeURIComponent(p.slug)+'"><div class="card-img">'+(p.cover_url?'<img loading="lazy" src="'+p.cover_url+'" alt="'+esc(p.title)+'" style="width:100%;height:100%;object-fit:contain">':'<span class="small">Preview</span>')+'</div><div class="card-title">'+esc(p.title)+'</div><div class="meta">'+esc(p.topic_name||p.category_name||'Printable')+' · '+(Number(p.download_count)||0)+' downloads</div>'+(Number(p.download_count)>0?'<div class="popular-badge">Most downloaded</div>':'')+'</a>').join('')||'<div class="small">Popular printables will appear here as downloads grow.</div>';
  }catch{if(pg)pg.innerHTML='<div class="small">Most-downloaded printables are temporarily unavailable. Please refresh.</div>'}
 }else if(pg)pg.innerHTML='<div class="small">Most-downloaded printables are temporarily unavailable. Please refresh.</div>';
}
loadHome();
const sf=document.getElementById('subscribeForm');
if(sf)sf.addEventListener('submit',async e=>{
 e.preventDefault();const b=sf.querySelector('button'),email=document.getElementById('subscribeEmail');b.disabled=true;b.textContent='Subscribing…';
 try{const r=await fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('subscribeEmail').value})});const text=await r.text();let d={};try{d=JSON.parse(text)}catch{throw Error('We could not complete your subscription right now. Please try again.')};if(!r.ok)throw Error(d.error||'Could not subscribe');if(d.already_subscribed){let msg=document.getElementById('subscribeMessage');if(!msg){msg=document.createElement('div');msg.id='subscribeMessage';msg.className='subscribe-message';sf.appendChild(msg)}msg.textContent='This email is already subscribed to Elias Arts. Please use another email address.';email.value='';b.disabled=false;b.textContent='Subscribe'}else{sf.innerHTML='<div class="subscribed">Subscribed</div>';sf.classList.add('subscribed-state')}}
 catch(err){b.disabled=false;b.textContent='Subscribe';if(!document.getElementById('subscribeMessage')){const msg=document.createElement('div');msg.id='subscribeMessage';msg.className='subscribe-message';sf.appendChild(msg)}document.getElementById('subscribeMessage').textContent=err.message}
});
const donate=document.getElementById('donateBtn');
if(donate)donate.addEventListener('click',()=>alert('Thank you for supporting Elias Arts. Donation options will be added here soon.'));
