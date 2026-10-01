const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
 id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 description TEXT DEFAULT '', banner_key TEXT DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
 is_visible INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS topics (
 id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL, slug TEXT NOT NULL,
 name TEXT NOT NULL, description TEXT DEFAULT '', sort_order INTEGER NOT NULL DEFAULT 0,
 is_visible INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(category_id, slug),
 FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS printables (
 id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 description TEXT DEFAULT '', category_id INTEGER, topic_id INTEGER, cover_file_id INTEGER,
 is_featured INTEGER NOT NULL DEFAULT 0, is_published INTEGER NOT NULL DEFAULT 0,
 sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
 FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS printable_files (
 id INTEGER PRIMARY KEY AUTOINCREMENT, printable_id INTEGER NOT NULL,
 file_type TEXT NOT NULL CHECK(file_type IN ('cover','preview','page','pdf')),
 storage_key TEXT NOT NULL, original_name TEXT DEFAULT '', page_number INTEGER,
 sort_order INTEGER NOT NULL DEFAULT 0, is_downloadable INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(printable_id) REFERENCES printables(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS subscribers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS site_settings (
 key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics(category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_printables_topic ON printables(topic_id, is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_printables_category ON printables(category_id, is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_printable_files_printable ON printable_files(printable_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_printables_title ON printables(title);
`;

const SEED=[
["letter-journaling","Letter & Journaling","Writing, letter paper and journaling printables.",1],
["planning-organization","Planning & Organization","Calendars, planners, trackers and study printables.",2],
["coloring-creative","Coloring & Creative","Coloring pages and creative sticker printables.",3],
["decorative","Decorative","Paper crafts, gift wrapping, wall art and quotes.",4],
["gifts-occasions","Gifts & Occasions","Cards, gift tags, invitations and seasonal printables.",5]];
const TOPICS={
"letter-journaling":[["writing","Writing"],["letter-paper","Letter Paper"],["journaling","Journaling"]],
"planning-organization":[["calendars","Calendars"],["planners","Planners"],["trackers","Trackers"],["study","Study"]],
"coloring-creative":[["coloring","Coloring"],["stickers","Stickers"]],
"decorative":[["paper-crafts","Paper Crafts"],["gift-wrapping","Gift Wrapping"],["wall-art","Wall Art"],["quotes","Quotes"]],
"gifts-occasions":[["cards","Cards"],["gift-tags","Gift Tags"],["invitations","Invitations"],["seasonal","Seasonal"]]};

async function ensureDatabase(db){
 for(const statement of SCHEMA.split(";").map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
 for(const [slug,name,description,sort] of SEED)
  await db.prepare("INSERT OR IGNORE INTO categories(slug,name,description,sort_order,is_visible) VALUES(?,?,?,?,1)").bind(slug,name,description,sort).run();
 for(const [catSlug,items] of Object.entries(TOPICS)){
  const cat=await db.prepare("SELECT id FROM categories WHERE slug=?").bind(catSlug).first(); if(!cat) continue;
  for(let i=0;i<items.length;i++)
   await db.prepare("INSERT OR IGNORE INTO topics(category_id,slug,name,sort_order,is_visible) VALUES(?,?,?,?,1)").bind(cat.id,items[i][0],items[i][1],i+1).run();
 }}
let initialized=false,initPromise;
async function init(db){if(initialized)return;if(!initPromise)initPromise=ensureDatabase(db).then(()=>{initialized=true}).catch(e=>{initPromise=null;throw e});await initPromise}

function b64u(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
function fromB64u(s){s=s.replaceAll("-","+").replaceAll("_","/");while(s.length%4)s+="=";return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
async function sign(value,secret){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64u(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))))}
async function issueToken(secret){const payload=b64u(new TextEncoder().encode(JSON.stringify({exp:Date.now()+8*60*60*1000})));return payload+"."+await sign(payload,secret)}
async function validToken(request,secret){
 if(!secret)return false;const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return false;
 const p=h.slice(7).split(".");if(p.length!==2)return false;if(await sign(p[0],secret)!==p[1])return false;
 try{return JSON.parse(new TextDecoder().decode(fromB64u(p[0]))).exp>Date.now()}catch{return false}}
async function jsonBody(request){try{return await request.json()}catch{return {}}}
function ok(data,status=200){return Response.json(data,{status})}
function bad(message,status=400){return Response.json({error:message},{status})}
function slugify(s){return String(s||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90)}
function safeKey(s){return String(s||"").replace(/[^a-zA-Z0-9._\/-]/g,"-").replace(/^\/+|\/+$/g,"")}
function fileUrl(key){return "/files/"+key.split("/").map(encodeURIComponent).join("/")}

async function publicPrintable(db,slug){
 const p=await db.prepare(`SELECT p.*,c.name category_name,c.slug category_slug,t.name topic_name,t.slug topic_slug
 FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id
 WHERE p.slug=? AND p.is_published=1`).bind(slug).first();
 if(!p)return null;
 const f=await db.prepare("SELECT id,file_type,storage_key,original_name,page_number,sort_order,is_downloadable FROM printable_files WHERE printable_id=? ORDER BY sort_order,id").bind(p.id).all();
 return {...p,files:f.results.map(x=>({...x,url:fileUrl(x.storage_key)}))};
}

export default {async fetch(request,env){
 try{
  const url=new URL(request.url);
  if(request.method==="GET"){
   if(url.pathname==="/printable"||url.pathname==="/printable/") return env.ASSETS.fetch(new Request(new URL("/printable.html",url),request));
   if(url.pathname.startsWith("/printable/")) return env.ASSETS.fetch(new Request(new URL("/printable.html",url),request));
   if(url.pathname==="/category"||url.pathname==="/category/") return env.ASSETS.fetch(new Request(new URL("/category.html",url),request));
   if(url.pathname.startsWith("/category/")) return env.ASSETS.fetch(new Request(new URL("/category.html",url),request));
   if(["/about","/contact","/privacy","/terms"].includes(url.pathname)) return env.ASSETS.fetch(new Request(new URL("/info.html",url),request));
   if(url.pathname==="/admin"||url.pathname==="/admin/") return env.ASSETS.fetch(new Request(new URL("/admin.html",url),request));
  }
  await init(env.DB);
  if(url.pathname==="/api/admin/login"&&request.method==="POST"){
   if(!env.ADMIN_PASSWORD)return bad("Admin password is not configured in Cloudflare yet.",503);
   const b=await jsonBody(request);if(!b.password||b.password!==env.ADMIN_PASSWORD)return bad("Incorrect password.",401);
   return ok({token:await issueToken(env.ADMIN_PASSWORD)});
  }
  if(url.pathname.startsWith("/api/admin/")){
   if(!(await validToken(request,env.ADMIN_PASSWORD)))return bad("Unauthorized.",401);
   if(url.pathname==="/api/admin/categories"&&request.method==="GET")return ok((await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order,id").all()).results);
   if(url.pathname==="/api/admin/topics"&&request.method==="GET")return ok((await env.DB.prepare("SELECT t.*,c.name category_name FROM topics t JOIN categories c ON c.id=t.category_id ORDER BY c.sort_order,t.sort_order,t.id").all()).results);
   if(url.pathname==="/api/admin/printables"&&request.method==="GET"){
    const r=await env.DB.prepare(`SELECT p.*,c.name category_name,t.name topic_name,
      (SELECT storage_key FROM printable_files f WHERE f.id=p.cover_file_id) cover_key
      FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id ORDER BY p.created_at DESC`).all();
    return ok(r.results.map(p=>({...p,cover_url:p.cover_key?fileUrl(p.cover_key):null})));
   }
   let m;
   if((m=url.pathname.match(/^\/api\/admin\/categories\/?(\\d+)?$/))){
    const id=m[1];
    if(request.method==="POST"&&!id){const b=await jsonBody(request);if(!b.name||!b.slug)return bad("Name and slug are required.");const max=await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0)+1 n FROM categories").first();await env.DB.prepare("INSERT INTO categories(slug,name,description,banner_key,sort_order,is_visible) VALUES(?,?,?,?,?,1)").bind(slugify(b.slug),String(b.name).trim(),b.description||"",safeKey(b.banner_key||""),max.n).run();return ok({success:true});}
    if(request.method==="PUT"&&id){const b=await jsonBody(request);await env.DB.prepare("UPDATE categories SET slug=?,name=?,description=?,banner_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(slugify(b.slug),String(b.name).trim(),b.description||"",safeKey(b.banner_key||""),id).run();return ok({success:true});}
    if(request.method==="DELETE"&&id){await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id).run();return ok({success:true});}
   }
   if((m=url.pathname.match(/^\/api\/admin\/topics\/?(\\d+)?$/))){
    const id=m[1];
    if(request.method==="POST"&&!id){const b=await jsonBody(request);if(!b.name||!b.slug||!b.category_id)return bad("Category, name and slug are required.");const max=await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0)+1 n FROM topics WHERE category_id=?").bind(b.category_id).first();await env.DB.prepare("INSERT INTO topics(category_id,slug,name,sort_order,is_visible) VALUES(?,?,?,?,1)").bind(b.category_id,slugify(b.slug),String(b.name).trim(),max.n).run();return ok({success:true});}
    if(request.method==="PUT"&&id){const b=await jsonBody(request);await env.DB.prepare("UPDATE topics SET category_id=?,slug=?,name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.category_id,slugify(b.slug),String(b.name).trim(),id).run();return ok({success:true});}
    if(request.method==="DELETE"&&id){await env.DB.prepare("DELETE FROM topics WHERE id=?").bind(id).run();return ok({success:true});}
   }
   if((m=url.pathname.match(/^\/api\/admin\/printables\/?(\\d+)?$/))){
    const id=m[1];
    if(request.method==="POST"&&!id){
     const b=await jsonBody(request);const title=String(b.title||"").trim();if(!title)return bad("Title is required.");
     const slug=slugify(b.slug||title);if(!slug)return bad("A valid slug is required.");
     try{const r=await env.DB.prepare("INSERT INTO printables(slug,title,description,category_id,topic_id,is_featured,is_published,sort_order) VALUES(?,?,?,?,?,?,?,0)").bind(slug,title,b.description||"",b.category_id||null,b.topic_id||null,b.is_featured?1:0,b.is_published?1:0).run();return ok({success:true,id:r.meta.last_row_id,slug});}catch(e){return bad("Could not create printable. The slug may already exist.",409);}
    }
    if(request.method==="PUT"&&id){const b=await jsonBody(request);const title=String(b.title||"").trim();if(!title)return bad("Title is required.");await env.DB.prepare("UPDATE printables SET slug=?,title=?,description=?,category_id=?,topic_id=?,is_featured=?,is_published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(slugify(b.slug||title),title,b.description||"",b.category_id||null,b.topic_id||null,b.is_featured?1:0,b.is_published?1:0,id).run();return ok({success:true});}
    if(request.method==="DELETE"&&id){
     const fs=await env.DB.prepare("SELECT storage_key FROM printable_files WHERE printable_id=?").bind(id).all();
     for(const f of fs.results)await env.FILES.delete(f.storage_key);
     await env.DB.prepare("DELETE FROM printables WHERE id=?").bind(id).run();return ok({success:true});
    }
   }
   if((m=url.pathname.match(/^\/api\/admin\/printables\/(\\d+)\/files$/))&&request.method==="POST"){
    const id=m[1];const exists=await env.DB.prepare("SELECT id FROM printables WHERE id=?").bind(id).first();if(!exists)return bad("Printable not found.",404);
    const form=await request.formData();const file=form.get("file");const type=String(form.get("file_type")||"");
    if(!(file instanceof File)||!["cover","preview","page","pdf"].includes(type))return bad("File and valid file type are required.");
    if(type==="pdf"&&!String(file.type).toLowerCase().includes("pdf"))return bad("The PDF upload must be a PDF file.");
    const original=String(file.name||"file");const clean=original.replace(/[^a-zA-Z0-9._-]/g,"-");
    const page=Number(form.get("page_number")||0);const key="printables/"+id+"/"+type+"/"+Date.now()+"-"+clean;
    await env.FILES.put(key,file.stream(),{httpMetadata:{contentType:file.type||"application/octet-stream",cacheControl:"public,max-age=31536000"}});
    const max=await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0)+1 n FROM printable_files WHERE printable_id=?").bind(id).first();
    const dl=type==="pdf"?1:0;
    const r=await env.DB.prepare("INSERT INTO printable_files(printable_id,file_type,storage_key,original_name,page_number,sort_order,is_downloadable) VALUES(?,?,?,?,?,?,?)").bind(id,type,key,original,page||null,max.n,dl).run();
    if(type==="cover")await env.DB.prepare("UPDATE printables SET cover_file_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(r.meta.last_row_id,id).run();
    return ok({success:true,id:r.meta.last_row_id,url:fileUrl(key)});
   }
   if((m=url.pathname.match(/^\/api\/admin\/printables\/files\/(\\d+)$/))&&request.method==="DELETE"){
    const f=await env.DB.prepare("SELECT storage_key FROM printable_files WHERE id=?").bind(m[1]).first();if(f)await env.FILES.delete(f.storage_key);await env.DB.prepare("DELETE FROM printable_files WHERE id=?").bind(m[1]).run();return ok({success:true});
   }
   return bad("Not found.",404);
  }

  if(url.pathname==="/api/categories")return ok((await env.DB.prepare("SELECT id,slug,name,description,banner_key,sort_order FROM categories WHERE is_visible=1 ORDER BY sort_order,id").all()).results);
  if(url.pathname==="/api/topics")return ok((await env.DB.prepare("SELECT t.id,t.slug,t.name,t.description,t.category_id,c.slug category_slug FROM topics t JOIN categories c ON c.id=t.category_id WHERE t.is_visible=1 AND c.is_visible=1 ORDER BY c.sort_order,t.sort_order,t.id").all()).results);
  if(url.pathname==="/api/printables"){
   const r=await env.DB.prepare(`SELECT p.*,c.name category_name,c.slug category_slug,t.name topic_name,t.slug topic_slug,
    (SELECT storage_key FROM printable_files f WHERE f.id=p.cover_file_id) cover_key
    FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id
    WHERE p.is_published=1 ORDER BY p.created_at DESC LIMIT 60`).all();
   return ok(r.results.map(p=>({...p,cover_url:p.cover_key?fileUrl(p.cover_key):null})));
  }
  if(url.pathname==="/api/search"){
   const q=(url.searchParams.get("q")||"").trim();
   if(!q)return ok((await env.DB.prepare(`SELECT p.id,p.slug,p.title,p.description,c.name category_name,t.name topic_name,
    (SELECT storage_key FROM printable_files f WHERE f.id=p.cover_file_id) cover_key
    FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id
    WHERE p.is_published=1 ORDER BY p.created_at DESC LIMIT 60`).all()).results.map(p=>({...p,cover_url:p.cover_key?fileUrl(p.cover_key):null})));
   const like="%"+q.replaceAll("%","\\%").replaceAll("_","\\_")+"%";
   const r=await env.DB.prepare(`SELECT DISTINCT p.id,p.slug,p.title,p.description,c.name category_name,t.name topic_name,
    (SELECT storage_key FROM printable_files f WHERE f.id=p.cover_file_id) cover_key
    FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id
    LEFT JOIN printable_files sf ON sf.printable_id=p.id
    WHERE p.is_published=1 AND (p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR t.name LIKE ? ESCAPE '\\' OR sf.original_name LIKE ? ESCAPE '\\')
    ORDER BY p.created_at DESC LIMIT 60`).bind(like,like,like,like,like).all();
   return ok(r.results.map(p=>({...p,cover_url:p.cover_key?fileUrl(p.cover_key):null})));
  }
  if(url.pathname==="/api/subscribe"&&request.method==="POST"){
   const b=await jsonBody(request);const email=String(b.email||"").trim().toLowerCase();
   if(!/^\S+@\S+\.\S+$/.test(email))return bad("Please enter a valid email.");
   await env.DB.prepare("INSERT OR IGNORE INTO subscribers(email) VALUES(?)").bind(email).run();return ok({success:true});
  }
  if(url.pathname.startsWith("/api/categories/")){
   const slug=decodeURIComponent(url.pathname.slice("/api/categories/".length)).replace(/\/$/,"");
   const c=await env.DB.prepare("SELECT id,slug,name,description,banner_key,sort_order FROM categories WHERE slug=? AND is_visible=1").bind(slug).first();
   if(!c)return bad("Category not found.",404);
   const topics=(await env.DB.prepare("SELECT id,slug,name,description,sort_order FROM topics WHERE category_id=? AND is_visible=1 ORDER BY sort_order,id").bind(c.id).all()).results;
   const r=await env.DB.prepare(`SELECT p.id,p.slug,p.title,p.description,c.name category_name,t.name topic_name,
    (SELECT storage_key FROM printable_files f WHERE f.id=p.cover_file_id) cover_key
    FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id
    WHERE p.is_published=1 AND p.category_id=? ORDER BY p.created_at DESC LIMIT 60`).bind(c.id).all();
   return ok({...c,banner_url:c.banner_key?fileUrl(c.banner_key):null,topics,printables:r.results.map(p=>({...p,cover_url:p.cover_key?fileUrl(p.cover_key):null}))});
  }
  if(url.pathname.startsWith("/api/printables/")){
   const slug=decodeURIComponent(url.pathname.slice("/api/printables/".length));const p=await publicPrintable(env.DB,slug);return p?ok(p):bad("Printable not found.",404);
  }
  if(url.pathname.startsWith("/files/")){
   const key=url.pathname.slice("/files/".length).split("/").map(decodeURIComponent).join("/");
   if(!key||key.includes(".."))return bad("Invalid file.",400);
   const obj=await env.FILES.get(key);if(!obj)return bad("File not found.",404);
   const headers=new Headers();obj.writeHttpMetadata(headers);headers.set("etag",obj.httpEtag);
   return new Response(obj.body,{headers});
  }
  return env.ASSETS.fetch(request);
 }catch(e){return bad("Server error: "+e.message,500)}
}};