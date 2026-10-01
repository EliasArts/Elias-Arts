const esc=s=>String(s??'').replace(/[&<>"]/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[x]));
async function loadHome(){
 try{
  const cats=await fetch('/api/categories').then(r=>r.json());
  const prints=await fetch('/api/printables').then(r=>r.json());
  const cg=document.getElementById('categoryGrid'),lg=document.getElementById('latestGrid');
  if(cg) cg.innerHTML=cats.map(c=>'<a class="cat" href="/category/'+encodeURIComponent(c.slug)+'"><div class="cat-banner">Explore collection</div><div class="cat-name">'+esc(c.name)+'</div><div class="cat-topics">'+esc(c.description||'Printable collection')+'</div></a>').join('');
  if(lg) lg.innerHTML=prints.slice(0,6).map(p=>'<a href="/printable/'+encodeURIComponent(p.slug)+'"><div class="card-img">'+(p.cover_url?'<img src="'+p.cover_url+'" alt="'+esc(p.title)+'" style="width:100%;height:100%;object-fit:contain">':'<span class="small">Preview</span>')+'</div><div class="card-title">'+esc(p.title)+'</div><div class="meta">'+esc(p.topic_name||p.category_name||'Printable')+' · Free</div></a>').join('')||'<div class="small">New printables are coming soon.</div>';
 }catch(e){console.error(e)}
}
loadHome();
const sf=document.getElementById('subscribeForm');
if(sf)sf.addEventListener('submit',async e=>{
 e.preventDefault();const b=sf.querySelector('button');b.disabled=true;
 try{const r=await fetch('/api/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('subscribeEmail').value})});const text=await r.text();let d={};try{d=JSON.parse(text)}catch{throw Error('We could not complete your subscription right now. Please try again.')};if(!r.ok)throw Error(d.error||'Could not subscribe');sf.innerHTML='<div class="subscribed">'+(d.already_subscribed?'Already subscribed':'Subscribed')+'</div>';sf.classList.add('subscribed-state')}
 catch(err){b.disabled=false;b.textContent=err.message}
});
const donate=document.getElementById('donateBtn');
if(donate)donate.addEventListener('click',()=>alert('Thank you for supporting Elias Arts. Donation options will be added here soon.'));
