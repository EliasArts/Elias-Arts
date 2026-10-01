const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 slug TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 description TEXT DEFAULT '',
 banner_key TEXT DEFAULT '',
 sort_order INTEGER NOT NULL DEFAULT 0,
 is_visible INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS topics (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 category_id INTEGER NOT NULL,
 slug TEXT NOT NULL,
 name TEXT NOT NULL,
 description TEXT DEFAULT '',
 sort_order INTEGER NOT NULL DEFAULT 0,
 is_visible INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(category_id, slug),
 FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS printables (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 slug TEXT NOT NULL UNIQUE,
 title TEXT NOT NULL,
 description TEXT DEFAULT '',
 category_id INTEGER,
 topic_id INTEGER,
 cover_file_id INTEGER,
 is_featured INTEGER NOT NULL DEFAULT 0,
 is_published INTEGER NOT NULL DEFAULT 0,
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
 FOREIGN KEY(topic_id) REFERENCES topics(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS printable_files (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 printable_id INTEGER NOT NULL,
 file_type TEXT NOT NULL CHECK(file_type IN ('cover','preview','page','pdf')),
 storage_key TEXT NOT NULL,
 original_name TEXT DEFAULT '',
 page_number INTEGER,
 sort_order INTEGER NOT NULL DEFAULT 0,
 is_downloadable INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(printable_id) REFERENCES printables(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS subscribers (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 email TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL DEFAULT 'active',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS site_settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics(category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_printables_topic ON printables(topic_id, is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_printables_category ON printables(category_id, is_published, sort_order);
CREATE INDEX IF NOT EXISTS idx_printable_files_printable ON printable_files(printable_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_printables_title ON printables(title);
`;

const SEED = [
 ["letter-journaling","Letter & Journaling","Writing, letter paper and journaling printables.",1],
 ["planning-organization","Planning & Organization","Calendars, planners, trackers and study printables.",2],
 ["coloring-creative","Coloring & Creative","Coloring pages and creative sticker printables.",3],
 ["decorative","Decorative","Paper crafts, gift wrapping, wall art and quotes.",4],
 ["gifts-occasions","Gifts & Occasions","Cards, gift tags, invitations and seasonal printables.",5]
];
const TOPICS = {
 "letter-journaling":[["writing","Writing"],["letter-paper","Letter Paper"],["journaling","Journaling"]],
 "planning-organization":[["calendars","Calendars"],["planners","Planners"],["trackers","Trackers"],["study","Study"]],
 "coloring-creative":[["coloring","Coloring"],["stickers","Stickers"]],
 "decorative":[["paper-crafts","Paper Crafts"],["gift-wrapping","Gift Wrapping"],["wall-art","Wall Art"],["quotes","Quotes"]],
 "gifts-occasions":[["cards","Cards"],["gift-tags","Gift Tags"],["invitations","Invitations"],["seasonal","Seasonal"]]
};

async function ensureDatabase(db){
 await db.exec(SCHEMA);
 for(const [slug,name,description,sort] of SEED) await db.prepare("INSERT OR IGNORE INTO categories(slug,name,description,sort_order,is_visible) VALUES(?,?,?,?,1)").bind(slug,name,description,sort).run();
 for(const [catSlug,items] of Object.entries(TOPICS)){
  const cat=await db.prepare("SELECT id FROM categories WHERE slug=?").bind(catSlug).first();
  if(!cat) continue;
  for(let i=0;i<items.length;i++) await db.prepare("INSERT OR IGNORE INTO topics(category_id,slug,name,sort_order,is_visible) VALUES(?,?,?,?,1)").bind(cat.id,items[i][0],items[i][1],i+1).run();
 }
}
let initialized=false,initPromise;
async function init(db){if(initialized)return;if(!initPromise)initPromise=ensureDatabase(db).then(()=>{initialized=true});await initPromise}

function b64u(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
function fromB64u(s){s=s.replaceAll("-","+").replaceAll("_","/");while(s.length%4)s+="=";const bin=atob(s);return Uint8Array.from(bin,c=>c.charCodeAt(0))}
async function sign(value,secret){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64u(new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(value))))}
async function issueToken(secret){const payload=b64u(new TextEncoder().encode(JSON.stringify({exp:Date.now()+8*60*60*1000})));return payload+"."+await sign(payload,secret)}
async function validToken(request,secret){
 if(!secret)return false;const h=request.headers.get("Authorization")||"";if(!h.startsWith("Bearer "))return false;
 const parts=h.slice(7).split(".");if(parts.length!==2)return false;
 const expected=await sign(parts[0],secret);if(expected!==parts[1])return false;
 try{return JSON.parse(new TextDecoder().decode(fromB64u(parts[0]))).exp>Date.now()}catch{return false}
}
async function jsonBody(request){try{return await request.json()}catch{return {}}}
function ok(data){return Response.json(data)}
function bad(message,status=400){return Response.json({error:message},{status})}

export default {
 async fetch(request,env){
  try{
   await init(env.DB);
   const url=new URL(request.url);
   if(url.pathname==="/api/admin/login"&&request.method==="POST"){
    if(!env.ADMIN_PASSWORD)return bad("Admin password is not configured in Cloudflare yet.",503);
    const body=await jsonBody(request);
    if(!body.password||body.password!==env.ADMIN_PASSWORD)return bad("Incorrect password.",401);
    return ok({token:await issueToken(env.ADMIN_PASSWORD)});
   }
   if(url.pathname.startsWith("/api/admin/")){
    if(!(await validToken(request,env.ADMIN_PASSWORD)))return bad("Unauthorized.",401);
    if(url.pathname==="/api/admin/categories"&&request.method==="GET"){
      const r=await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order,id").all();return ok(r.results);
    }
    if(url.pathname==="/api/admin/topics"&&request.method==="GET"){
      const r=await env.DB.prepare("SELECT t.*,c.name category_name FROM topics t JOIN categories c ON c.id=t.category_id ORDER BY c.sort_order,t.sort_order,t.id").all();return ok(r.results);
    }
    let m;
    if((m=url.pathname.match(/^\/api\/admin\/categories\/?(\\d+)?$/))){
      const id=m[1];
      if(request.method==="POST"&&!id){const b=await jsonBody(request);if(!b.name||!b.slug)return bad("Name and slug are required.");const max=await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0)+1 n FROM categories").first();await env.DB.prepare("INSERT INTO categories(slug,name,description,banner_key,sort_order,is_visible) VALUES(?,?,?,?,?,1)").bind(b.slug.trim(),b.name.trim(),b.description||"",b.banner_key||"",max.n).run();return ok({success:true})}
      if(request.method==="PUT"&&id){const b=await jsonBody(request);await env.DB.prepare("UPDATE categories SET slug=?,name=?,description=?,banner_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.slug.trim(),b.name.trim(),b.description||"",b.banner_key||"",id).run();return ok({success:true})}
      if(request.method==="DELETE"&&id){await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id).run();return ok({success:true})}
    }
    if((m=url.pathname.match(/^\/api\/admin\/topics\/?(\\d+)?$/))){
      const id=m[1];
      if(request.method==="POST"&&!id){const b=await jsonBody(request);if(!b.name||!b.slug||!b.category_id)return bad("Category, name and slug are required.");const max=await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0)+1 n FROM topics WHERE category_id=?").bind(b.category_id).first();await env.DB.prepare("INSERT INTO topics(category_id,slug,name,sort_order,is_visible) VALUES(?,?,?,?,1)").bind(b.category_id,b.slug.trim(),b.name.trim(),max.n).run();return ok({success:true})}
      if(request.method==="PUT"&&id){const b=await jsonBody(request);await env.DB.prepare("UPDATE topics SET category_id=?,slug=?,name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.category_id,b.slug.trim(),b.name.trim(),id).run();return ok({success:true})}
      if(request.method==="DELETE"&&id){await env.DB.prepare("DELETE FROM topics WHERE id=?").bind(id).run();return ok({success:true})}
    }
    return bad("Not found.",404);
   }
   if(url.pathname==="/api/categories"){const r=await env.DB.prepare("SELECT id,slug,name,description,banner_key,sort_order FROM categories WHERE is_visible=1 ORDER BY sort_order,id").all();return ok(r.results)}
   if(url.pathname==="/api/topics"){const r=await env.DB.prepare("SELECT t.id,t.slug,t.name,t.description,t.category_id,c.slug category_slug FROM topics t JOIN categories c ON c.id=t.category_id WHERE t.is_visible=1 AND c.is_visible=1 ORDER BY c.sort_order,t.sort_order,t.id").all();return ok(r.results)}
   if(url.pathname==="/api/search"){
    const q=(url.searchParams.get("q")||"").trim();if(!q)return ok([]);
    const like="%"+q.replaceAll("%","\\%").replaceAll("_","\\_")+"%";
    const r=await env.DB.prepare("SELECT p.id,p.slug,p.title,p.description,c.name category_name,t.name topic_name FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id WHERE p.is_published=1 AND (p.title LIKE ? ESCAPE '\\' OR p.description LIKE ? ESCAPE '\\') ORDER BY p.created_at DESC LIMIT 60").bind(like,like).all();return ok(r.results)
   }
   return env.ASSETS.fetch(request);
  }catch(e){return bad("Server error: "+e.message,500)}
 }
};