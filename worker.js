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
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 paper_size TEXT NOT NULL DEFAULT 'A4',
 format_info TEXT NOT NULL DEFAULT 'PDF',
 page_count INTEGER NOT NULL DEFAULT 1,
 download_count INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
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
CREATE TABLE IF NOT EXISTS download_daily (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 printable_id INTEGER NOT NULL,
 day TEXT NOT NULL,
 downloads INTEGER NOT NULL DEFAULT 0,
 UNIQUE(printable_id,day),
 FOREIGN KEY(printable_id) REFERENCES printables(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_download_daily_day ON download_daily(day);
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
"planning-organization":[["calendars","Calendars"],["planners","Planners"],["trackers","Trackers"],["study","Study"],["reading","Reading"]],
"coloring-creative":[["coloring","Coloring"],["stickers","Stickers"]],
"decorative":[["paper-crafts","Paper Crafts"],["gift-wrapping","Gift Wrapping"],["wall-art","Wall Art"],["quotes","Quotes"]],
"gifts-occasions":[["cards","Cards"],["gift-tags","Gift Tags"],["invitations","Invitations"],["seasonal","Seasonal"]]};

async function ensureDatabase(db){
 const settingsTable=await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='site_settings' LIMIT 1").first();
 if(!settingsTable){
  for(const statement of SCHEMA.split(";").map(s=>s.trim()).filter(Boolean)) await db.prepare(statement).run();
 }
 const cols=(await db.prepare("PRAGMA table_info(printables)").all()).results||[];
 const names=new Set(cols.map(c=>c.name));
 if(!names.has("paper_size")) await db.prepare("ALTER TABLE printables ADD COLUMN paper_size TEXT NOT NULL DEFAULT 'A4'").run();
 if(!names.has("format_info")) await db.prepare("ALTER TABLE printables ADD COLUMN format_info TEXT NOT NULL DEFAULT 'PDF'").run();
 if(!names.has("page_count")) await db.prepare("ALTER TABLE printables ADD COLUMN page_count INTEGER NOT NULL DEFAULT 1").run();
 if(!names.has("download_count")) await db.prepare("ALTER TABLE printables ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0").run();
 const dailyTable=await db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='download_daily' LIMIT 1").first();
 if(!dailyTable){
  await db.prepare("CREATE TABLE IF NOT EXISTS download_daily (id INTEGER PRIMARY KEY AUTOINCREMENT,printable_id INTEGER NOT NULL,day TEXT NOT NULL,downloads INTEGER NOT NULL DEFAULT 0,UNIQUE(printable_id,day),FOREIGN KEY(printable_id) REFERENCES printables(id) ON DELETE CASCADE)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_download_daily_day ON download_daily(day)").run();
 }
 let seeded=await db.prepare("SELECT value FROM site_settings WHERE key='seed_version' LIMIT 1").first();
 if(!seeded){
  const hasCategory=await db.prepare("SELECT 1 FROM categories LIMIT 1").first();
  if(!hasCategory){
   for(const [slug,name,description,sort] of SEED) await db.prepare("INSERT INTO categories(slug,name,description,sort_order,is_visible) VALUES(?,?,?,?,1)").bind(slug,name,description,sort).run();
   for(const [catSlug,items] of Object.entries(TOPICS)){
    const cat=await db.prepare("SELECT id FROM categories WHERE slug=?").bind(catSlug).first(); if(!cat) continue;
    for(let i=0;i<items.length;i++) await db.prepare("INSERT INTO topics(category_id,slug,name,sort_order,is_visible) VALUES(?,?,?,?,1)").bind(cat.id,items[i][0],items[i][1],i+1).run();
   }
  }
  await db.prepare("INSERT OR REPLACE INTO site_settings(key,value) VALUES('seed_version','1')").run();
  seeded={value:'1'};
 }
 if(Number(seeded.value)<2){
  const cat=await db.prepare("SELECT id FROM categories WHERE slug='planning-organization'").first();
  if(cat) await db.prepare("INSERT OR IGNORE INTO topics(category_id,slug,name,sort_order,is_visible) VALUES(?,?,?,?,1)").bind(cat.id,'reading','Reading',5).run();
  await db.prepare("INSERT OR REPLACE INTO site_settings(key,value) VALUES('seed_version','2')").run();
 }
}
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
function ok(data,status=200,headers={}){return Response.json(data,{status,headers})}
function bad(message,status=400){return Response.json({error:message},{status})}
function slugify(s){return String(s||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90)}
function safeKey(s){return String(s||"").replace(/[^a-zA-Z0-9._\/-]/g,"-").replace(/^\/+|\/+$/g,"")}
function fileUrl(key){return "/files/"+key.split("/").map(encodeURIComponent).join("/")}

async function servePreloadedPage(env,request,path,data){
 const assetUrl=new URL(request.url);assetUrl.pathname=path;assetUrl.search="";
 const asset=await env.ASSETS.fetch(new Request(assetUrl.toString(),request));
 if(!asset.ok)return asset;
 const html=await asset.text();
 const safe=JSON.stringify(data).replace(/</g,"\\u003c").replace(/>/g,"\\u003e").replace(/&/g,"\\u0026");
 const injected="<script>window.__ELIAS_PRELOADED__="+safe+";<\\/script>";
 return new Response(html.replace("</head>",injected+"</head>"),{status:asset.status,headers:new Headers(asset.headers)});
}
async function publicPrintable(db,slug){
 const p=await db.prepare(`SELECT p.*,c.name category_name,c.slug category_slug,t.name topic_name,t.slug topic_slug
 FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id
 WHERE p.slug=? AND p.is_published=1`).bind(slug).first();
 if(!p)return null;
 const f=await db.prepare("SELECT id,file_type,storage_key,original_name,page_number,sort_order,is_downloadable FROM printable_files WHERE printable_id=? ORDER BY sort_order,id").bind(p.id).all();
 const rel=await db.prepare(`SELECT p.id,p.slug,p.title,p.description,c.name category_name,t.name topic_name,
   (SELECT storage_key FROM printable_files f WHERE f.id=p.cover_file_id) cover_key
   FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id
   WHERE p.is_published=1 AND p.id<>? AND (p.category_id=? OR p.topic_id=?) ORDER BY p.created_at DESC LIMIT 6`).bind(p.id,p.category_id,p.topic_id).all();
 return {...p,
   files:f.results.map(x=>({...x,url:fileUrl(x.storage_key)})),
   related:rel.results.map(x=>({...x,cover_url:x.cover_key?fileUrl(x.cover_key):null}))
 };
}

export default {async fetch(request,env){
 try{
  const url=new URL(request.url);
  const trackedPages=new Set(["/","/search","/category.html","/printable.html","/info.html"]);
  if(request.method==="GET"&&trackedPages.has(url.pathname)){
    try{env.ANALYTICS_ENGINE?.writeDataPoint({indexes:["pageview"],blobs:["pageview",url.pathname],doubles:[1]});}catch{}
  }

  let routeMatch;
  if(routeMatch=url.pathname.match(/^\/printable\/([^/]+)$/)) return Response.redirect(new URL("/printable.html?slug="+encodeURIComponent(decodeURIComponent(routeMatch[1])),url).toString(),302);
  if(routeMatch=url.pathname.match(/^\/category\/([^/]+)$/)) return Response.redirect(new URL("/category.html?slug="+encodeURIComponent(decodeURIComponent(routeMatch[1])),url).toString(),302);

  if((url.pathname==="/printable.html"||url.pathname==="/category.html")&&request.method==="GET"){
   const slug=String(url.searchParams.get("slug")||"");
   if(slug){
    await init(env.DB);
    if(url.pathname==="/printable.html"){
     const p=await publicPrintable(env.DB,slug);if(p)return servePreloadedPage(env,request,"/printable.html",p);return bad("Printable not found.",404);
    }
    const cat=await env.DB.prepare("SELECT id,slug,name,description,banner_key,sort_order FROM categories WHERE slug=? AND is_visible=1").bind(slug).first();
    if(cat){
     const topics=(await env.DB.prepare("SELECT id,slug,name,description,sort_order FROM topics WHERE category_id=? AND is_visible=1 ORDER BY sort_order,id").bind(cat.id).all()).results;
     const sql=["SELECT p.id,p.slug,p.title,p.description,c.name category_name,t.name topic_name,","(SELECT storage_key FROM printable_files f WHERE f.id=p.cover_file_id) cover_key","FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id","WHERE p.is_published=1 AND p.category_id=? ORDER BY p.created_at DESC LIMIT 60"].join(" ");
     const r=await env.DB.prepare(sql).bind(cat.id).all();
     const data={...cat,banner_url:cat.banner_key?fileUrl(cat.banner_key):null,topics,printables:r.results.map(p=>({...p,cover_url:p.cover_key?fileUrl(p.cover_key):null}))};
     return servePreloadedPage(env,request,"/category.html",data);
    }
    return bad("Category not found.",404);
   }
  }
  if(url.pathname.startsWith("/files/")&&request.method==="GET"){
   const key=url.pathname.slice("/files/".length).split("/").map(decodeURIComponent).join("/");
   if(!key||key.includes(".."))return bad("Invalid file.",400);
   const obj=await env.FILES.get(key);if(!obj)return bad("File not found.",404);
   const headers=new Headers();obj.writeHttpMetadata(headers);headers.set("etag",obj.httpEtag);
   return new Response(obj.body,{headers});
  }
  if(url.pathname.startsWith("/api/")||url.pathname==="/sitemap.xml") await init(env.DB);
  if(url.pathname==="/api/admin/login"&&request.method==="POST"){
   if(!env.ADMIN_PASSWORD)return bad("Admin password is not configured in Cloudflare yet.",503);
   const b=await jsonBody(request);if(!b.password||b.password!==env.ADMIN_PASSWORD)return bad("Incorrect password.",401);
   return ok({token:await issueToken(env.ADMIN_PASSWORD)});
  }
  if(url.pathname.startsWith("/api/admin/")){
   if(!(await validToken(request,env.ADMIN_PASSWORD)))return bad("Unauthorized.",401);
   if(url.pathname==="/api/admin/categories"&&request.method==="GET")return ok((await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order,id").all()).results);
   if(url.pathname==="/api/admin/topics"&&request.method==="GET")return ok((await env.DB.prepare("SELECT t.*,c.name category_name FROM topics t JOIN categories c ON c.id=t.category_id ORDER BY c.sort_order,t.sort_order,t.id").all()).results);
   if(url.pathname==="/api/admin/subscribers"&&request.method==="GET"){
    const count=await env.DB.prepare("SELECT COUNT(*) total FROM subscribers WHERE status='active'").first();
    const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit")||100)));
    const rows=(await env.DB.prepare("SELECT id,email,status,created_at FROM subscribers WHERE status='active' ORDER BY created_at DESC,id DESC LIMIT ?").bind(limit).all()).results;
    return ok({total:count.total||0,subscribers:rows});
   }
   if(url.pathname==="/api/admin/analytics"&&request.method==="GET"){
    if(!(await validToken(request,env.ADMIN_PASSWORD)))return bad("Unauthorized.",401);
    const empty={daily:[],byPrintable:[],topPages:[]};
    if(!env.ANALYTICS_SQL)return ok(empty);
    try{
      const [daily,byPrintable,topPages]=await Promise.all([
        env.ANALYTICS_SQL.query({query:'SELECT toStartOfDay(timestamp) AS day, blob1 AS event, SUM(_sample_interval * double1) AS count FROM events.analyticsEngine."elias_arts_analytics" WHERE timestamp >= NOW() - INTERVAL \'30\' DAY GROUP BY day,event ORDER BY day LIMIT 1000'}),
        env.ANALYTICS_SQL.query({query:'SELECT blob2 AS printable, SUM(_sample_interval * double1) AS downloads FROM events.analyticsEngine."elias_arts_analytics" WHERE timestamp >= NOW() - INTERVAL \'90\' DAY AND blob1=\'download\' GROUP BY printable ORDER BY downloads DESC LIMIT 100'}),
        env.ANALYTICS_SQL.query({query:'SELECT blob2 AS path, SUM(_sample_interval * double1) AS pageviews FROM events.analyticsEngine."elias_arts_analytics" WHERE timestamp >= NOW() - INTERVAL \'30\' DAY AND blob1=\'pageview\' GROUP BY path ORDER BY pageviews DESC LIMIT 20'})
      ]);
      return ok({daily:daily.data||[],byPrintable:byPrintable.data||[],topPages:topPages.data||[]});
    }catch(e){console.error("Analytics query error",e);return ok(empty)}
   }
   if(url.pathname==="/api/admin/stats"&&request.method==="GET"){
    const [totals,cats,topics,subs]=await Promise.all([
      env.DB.prepare("SELECT COUNT(*) total, SUM(CASE WHEN is_published=1 THEN 1 ELSE 0 END) published, COALESCE(SUM(download_count),0) downloads FROM printables").first(),
      env.DB.prepare("SELECT c.id,c.name,COUNT(p.id) total,SUM(CASE WHEN p.is_published=1 THEN 1 ELSE 0 END) published FROM categories c LEFT JOIN printables p ON p.category_id=c.id GROUP BY c.id,c.name ORDER BY c.sort_order,c.id").all(),
      env.DB.prepare("SELECT t.id,t.name,c.name category_name,COUNT(p.id) total,SUM(CASE WHEN p.is_published=1 THEN 1 ELSE 0 END) published FROM topics t JOIN categories c ON c.id=t.category_id LEFT JOIN printables p ON p.topic_id=t.id GROUP BY t.id,t.name,c.name ORDER BY c.sort_order,t.sort_order,t.id").all(),
      env.DB.prepare("SELECT COUNT(*) total FROM subscribers WHERE status='active'").first()
    ]);
    return ok({total:totals.total||0,published:totals.published||0,downloads:totals.downloads||0,subscribers:subs.total||0,categories:cats.results,topics:topics.results});
   }
   if(url.pathname==="/api/admin/printables"&&request.method==="GET"){
    const r=await env.DB.prepare(`SELECT p.*,c.name category_name,t.name topic_name,
      (SELECT storage_key FROM printable_files f WHERE f.id=p.cover_file_id) cover_key
      FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id ORDER BY p.created_at DESC`).all();
    return ok(r.results.map(p=>({...p,cover_url:p.cover_key?fileUrl(p.cover_key):null})));
   }
   let m;
   if((m=url.pathname.match(/^\/api\/admin\/categories\/?(\d+)?$/))){
    const id=m[1];
    if(request.method==="POST"&&!id){const b=await jsonBody(request);if(!b.name||!b.slug)return bad("Name and slug are required.");const max=await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0)+1 n FROM categories").first();const r=await env.DB.prepare("INSERT INTO categories(slug,name,description,banner_key,sort_order,is_visible) VALUES(?,?,?,?,?,1)").bind(slugify(b.slug),String(b.name).trim(),b.description||"",safeKey(b.banner_key||""),max.n).run();return ok({success:true,id:r.meta.last_row_id});}
    if(request.method==="PUT"&&id){const b=await jsonBody(request);await env.DB.prepare("UPDATE categories SET slug=?,name=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(slugify(b.slug),String(b.name).trim(),b.description||"",id).run();return ok({success:true});}
    if(request.method==="DELETE"&&id){const c=await env.DB.prepare("SELECT banner_key FROM categories WHERE id=?").bind(id).first();if(c?.banner_key)await env.FILES.delete(c.banner_key);await env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id).run();return ok({success:true});}
   }
   if((m=url.pathname.match(/^\/api\/admin\/categories\/(\d+)\/banner$/))&&request.method==="POST"){
    const id=m[1];const c=await env.DB.prepare("SELECT id,banner_key FROM categories WHERE id=?").bind(id).first();if(!c)return bad("Category not found.",404);
    const form=await request.formData();const file=form.get("file");
    if(!(file instanceof File)||!String(file.type||"").startsWith("image/"))return bad("Please choose an image for the category banner.");
    const clean=String(file.name||"banner").replace(/[^a-zA-Z0-9._-]/g,"-");const key="categories/"+id+"/banner/"+Date.now()+"-"+clean;
    await env.FILES.put(key,file.stream(),{httpMetadata:{contentType:file.type||"image/jpeg",cacheControl:"public,max-age=31536000"}});
    if(c.banner_key)await env.FILES.delete(c.banner_key);
    await env.DB.prepare("UPDATE categories SET banner_key=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(key,id).run();
    return ok({success:true,url:fileUrl(key)});
   }
   if((m=url.pathname.match(/^\/api\/admin\/topics\/?(\d+)?$/))){
    const id=m[1];
    if(request.method==="POST"&&!id){const b=await jsonBody(request);if(!b.name||!b.slug||!b.category_id)return bad("Category, name and slug are required.");const max=await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0)+1 n FROM topics WHERE category_id=?").bind(b.category_id).first();await env.DB.prepare("INSERT INTO topics(category_id,slug,name,sort_order,is_visible) VALUES(?,?,?,?,1)").bind(b.category_id,slugify(b.slug),String(b.name).trim(),max.n).run();return ok({success:true});}
    if(request.method==="PUT"&&id){const b=await jsonBody(request);await env.DB.prepare("UPDATE topics SET category_id=?,slug=?,name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(b.category_id,slugify(b.slug),String(b.name).trim(),id).run();return ok({success:true});}
    if(request.method==="DELETE"&&id){await env.DB.prepare("DELETE FROM topics WHERE id=?").bind(id).run();return ok({success:true});}
   }
   if((m=url.pathname.match(/^\/api\/admin\/printables\/?(\d+)?$/))){
    const id=m[1];
    if(request.method==="POST"&&!id){
     const b=await jsonBody(request);const title=String(b.title||"").trim();if(!title)return bad("Title is required.");
     const slug=slugify(b.slug||title);if(!slug)return bad("A valid slug is required.");
     try{const r=await env.DB.prepare("INSERT INTO printables(slug,title,description,category_id,topic_id,is_featured,is_published,sort_order) VALUES(?,?,?,?,?,?,?,0)").bind(slug,title,b.description||"",b.category_id||null,b.topic_id||null,b.is_featured?1:0,b.is_published?1:0).run();const id=r.meta.last_row_id;await env.DB.prepare("UPDATE printables SET paper_size=?,format_info=?,page_count=? WHERE id=?").bind(b.paper_size||"A4",b.format_info||"PDF",Math.max(1,Number(b.page_count)||1),id).run();return ok({success:true,id,slug});}catch(e){return bad("Could not create printable. The slug may already exist.",409);}
    }
    if(request.method==="PUT"&&id){const b=await jsonBody(request);const title=String(b.title||"").trim();if(!title)return bad("Title is required.");await env.DB.prepare("UPDATE printables SET slug=?,title=?,description=?,category_id=?,topic_id=?,is_featured=?,is_published=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(slugify(b.slug||title),title,b.description||"",b.category_id||null,b.topic_id||null,b.is_featured?1:0,b.is_published?1:0,id).run();await env.DB.prepare("UPDATE printables SET paper_size=?,format_info=?,page_count=? WHERE id=?").bind(b.paper_size||"A4",b.format_info||"PDF",Math.max(1,Number(b.page_count)||1),id).run();return ok({success:true});}
    if(request.method==="DELETE"&&id){
     const fs=await env.DB.prepare("SELECT storage_key FROM printable_files WHERE printable_id=?").bind(id).all();
     for(const f of fs.results)await env.FILES.delete(f.storage_key);
     await env.DB.prepare("DELETE FROM printables WHERE id=?").bind(id).run();return ok({success:true});
    }
   }
   if((m=url.pathname.match(/^\/api\/admin\/printables\/(\d+)\/files$/))&&request.method==="GET"){
    const rows=(await env.DB.prepare("SELECT id,file_type,storage_key,original_name,page_number,sort_order,is_downloadable FROM printable_files WHERE printable_id=? ORDER BY sort_order,id").bind(m[1]).all()).results;
    return ok(rows.map(x=>({...x,url:fileUrl(x.storage_key)})));
   }
   if((m=url.pathname.match(/^\/api\/admin\/printables\/(\d+)\/files$/))&&request.method==="POST"){
    const id=m[1];const exists=await env.DB.prepare("SELECT id FROM printables WHERE id=?").bind(id).first();if(!exists)return bad("Printable not found.",404);
    const form=await request.formData();const file=form.get("file");const type=String(form.get("file_type")||"");
    if(!(file instanceof File)||!["cover","preview","page","pdf"].includes(type))return bad("File and valid file type are required.");
    if(type==="pdf"&&!String(file.type).toLowerCase().includes("pdf"))return bad("The PDF upload must be a PDF file.");
    const original=String(file.name||"file");const clean=original.replace(/[^a-zA-Z0-9._-]/g,"-");
    if(type==="cover"||type==="pdf"){
     const previous=(await env.DB.prepare("SELECT id,storage_key FROM printable_files WHERE printable_id=? AND file_type=?").bind(id,type).all()).results;
     for(const old of previous){await env.FILES.delete(old.storage_key);await env.DB.prepare("DELETE FROM printable_files WHERE id=?").bind(old.id).run();}
    }
    const page=Number(form.get("page_number")||0);const key="printables/"+id+"/"+type+"/"+Date.now()+"-"+clean;
    await env.FILES.put(key,file.stream(),{httpMetadata:{contentType:file.type||"application/octet-stream",cacheControl:"public,max-age=31536000"}});
    const max=await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0)+1 n FROM printable_files WHERE printable_id=?").bind(id).first();
    const dl=type==="pdf"?1:0;
    const r=await env.DB.prepare("INSERT INTO printable_files(printable_id,file_type,storage_key,original_name,page_number,sort_order,is_downloadable) VALUES(?,?,?,?,?,?,?)").bind(id,type,key,original,page||null,max.n,dl).run();
    if(type==="cover")await env.DB.prepare("UPDATE printables SET cover_file_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(r.meta.last_row_id,id).run();
    return ok({success:true,id:r.meta.last_row_id,url:fileUrl(key)});
   }
   if((m=url.pathname.match(/^\/api\/admin\/printables\/files\/(\d+)$/))&&request.method==="DELETE"){
    const f=await env.DB.prepare("SELECT storage_key,printable_id,file_type FROM printable_files WHERE id=?").bind(m[1]).first();if(f)await env.FILES.delete(f.storage_key);await env.DB.prepare("DELETE FROM printable_files WHERE id=?").bind(m[1]).run();if(f?.file_type==="cover")await env.DB.prepare("UPDATE printables SET cover_file_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(f.printable_id).run();return ok({success:true});
   }
   return bad("Not found.",404);
  }

  if(url.pathname==="/api/navigation"){
   const rows=(await env.DB.prepare(`SELECT c.id category_id,c.slug category_slug,c.name category_name,
    t.id topic_id,t.slug topic_slug,t.name topic_name
    FROM categories c LEFT JOIN topics t ON t.category_id=c.id AND t.is_visible=1
    WHERE c.is_visible=1 ORDER BY c.sort_order,c.id,t.sort_order,t.id`).all()).results;
   const map=new Map();
   for(const r of rows){
    if(!map.has(r.category_id))map.set(r.category_id,{id:r.category_id,slug:r.category_slug,name:r.category_name,topics:[]});
    if(r.topic_id)map.get(r.category_id).topics.push({id:r.topic_id,slug:r.topic_slug,name:r.topic_name});
   }
   return ok([...map.values()],200,{"Cache-Control":"public, max-age=300, stale-while-revalidate=600"});
  }
  if(url.pathname==="/api/categories")return ok((await env.DB.prepare("SELECT id,slug,name,description,banner_key,sort_order FROM categories WHERE is_visible=1 ORDER BY sort_order,id").all()).results,200,{"Cache-Control":"public, max-age=300, stale-while-revalidate=600"});
  if(url.pathname==="/api/topics")return ok((await env.DB.prepare("SELECT t.id,t.slug,t.name,t.description,t.category_id,c.slug category_slug FROM topics t JOIN categories c ON c.id=t.category_id WHERE t.is_visible=1 AND c.is_visible=1 ORDER BY c.sort_order,t.sort_order,t.id").all()).results,200,{"Cache-Control":"public, max-age=300, stale-while-revalidate=600"});
  if(url.pathname==="/api/printables"){
   const r=await env.DB.prepare(`SELECT p.*,c.name category_name,c.slug category_slug,t.name topic_name,t.slug topic_slug,
    (SELECT storage_key FROM printable_files f WHERE f.id=p.cover_file_id) cover_key
    FROM printables p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN topics t ON t.id=p.topic_id
    WHERE p.is_published=1 ORDER BY p.created_at DESC LIMIT 60`).all();
   return ok(r.results.map(p=>({...p,cover_url:p.cover_key?fileUrl(p.cover_key):null})),200,{"Cache-Control":"public, max-age=30, stale-while-revalidate=120"});
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
   const existing=await env.DB.prepare("SELECT id,status FROM subscribers WHERE email=?").bind(email).first();
   if(existing){
    if(existing.status==="active")return ok({success:true,already_subscribed:true,message:"This email is already subscribed to Elias Arts."});
    await env.DB.prepare("UPDATE subscribers SET status='active' WHERE id=?").bind(existing.id).run();
    return ok({success:true,reactivated:true,message:"Your subscription has been reactivated."});
   }
   await env.DB.prepare("INSERT INTO subscribers(email) VALUES(?)").bind(email).run();
   return ok({success:true,subscribed:true,message:"You're subscribed to Elias Arts."});
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
   return ok({...c,banner_url:c.banner_key?fileUrl(c.banner_key):null,topics,printables:r.results.map(p=>({...p,cover_url:p.cover_key?fileUrl(p.cover_key):null}))},200,{"Cache-Control":"public, max-age=300, stale-while-revalidate=600"});
  }
  if(url.pathname.startsWith("/api/printables/")&&url.pathname.endsWith("/download")){
   const slug=decodeURIComponent(url.pathname.slice("/api/printables/".length,-"/download".length)).replace(/\/$/,"");
   const p=await publicPrintable(env.DB,slug);if(!p)return bad("Printable not found.",404);
   const pdf=p.files.find(f=>f.file_type==="pdf");if(!pdf)return bad("PDF not available.",404);
   const obj=await env.FILES.get(pdf.storage_key);if(!obj)return bad("PDF file not found.",404);
   try{env.ANALYTICS_ENGINE?.writeDataPoint({indexes:[p.slug],blobs:["download",p.slug,p.title],doubles:[1]});}catch{}
   const day=new Date().toISOString().slice(0,10);
   await env.DB.batch([
    env.DB.prepare("UPDATE printables SET download_count=COALESCE(download_count,0)+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(p.id),
    env.DB.prepare("INSERT INTO download_daily(printable_id,day,downloads) VALUES(?,?,1) ON CONFLICT(printable_id,day) DO UPDATE SET downloads=downloads+1").bind(p.id,day)
   ]);
   const headers=new Headers();obj.writeHttpMetadata(headers);headers.set("Content-Type","application/pdf");headers.set("Content-Disposition",`attachment; filename="${String(pdf.original_name||p.title+".pdf").replace(/["\\]/g,"-")}"`);
   return new Response(obj.body,{headers});
  }
  if(url.pathname.startsWith("/api/printables/")){
   const slug=decodeURIComponent(url.pathname.slice("/api/printables/".length));const p=await publicPrintable(env.DB,slug);return p?ok(p,200,{"Cache-Control":"public, max-age=60, stale-while-revalidate=300"}):bad("Printable not found.",404);
  }

  if(url.pathname==="/api/admin/download-history"&&request.method==="GET"){
   if(!(await validToken(request,env.ADMIN_PASSWORD)))return bad("Unauthorized.",401);
   const [daily,byPrintable]=await Promise.all([
    env.DB.prepare("SELECT day,SUM(downloads) downloads FROM download_daily WHERE day>=date('now','-13 day') GROUP BY day ORDER BY day").all(),
    env.DB.prepare("SELECT p.id,p.title,COALESCE(SUM(d.downloads),0) downloads FROM printables p LEFT JOIN download_daily d ON d.printable_id=p.id GROUP BY p.id,p.title ORDER BY downloads DESC,p.created_at DESC").all()
   ]);
   return ok({daily:daily.results,byPrintable:byPrintable.results});
  }

  if(url.pathname==="/robots.txt"&&request.method==="GET"){
    return new Response("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: https://elias-arts.eliasoscararts.workers.dev/sitemap.xml\n",{headers:{"Content-Type":"text/plain; charset=UTF-8","Cache-Control":"public, max-age=86400"}});
  }
  if(url.pathname==="/sitemap.xml"&&request.method==="GET"){
    const base="https://elias-arts.eliasoscararts.workers.dev";
    const urls=[base+"/",base+"/category.html?slug=coloring-creative",base+"/category.html?slug=planning-organization",base+"/category.html?slug=letter-journaling",base+"/category.html?slug=decorative",base+"/category.html?slug=gifts-occasions",base+"/info.html?page=about",base+"/info.html?page=contact",base+"/info.html?page=privacy",base+"/info.html?page=terms"];
    const cats=(await env.DB.prepare("SELECT slug FROM categories WHERE is_visible=1 ORDER BY sort_order").all()).results;
    const prints=(await env.DB.prepare("SELECT slug FROM printables WHERE is_published=1 ORDER BY created_at DESC").all()).results;
    const all=[...urls,...cats.map(c=>base+"/category.html?slug="+encodeURIComponent(c.slug)),...prints.map(p=>base+"/printable.html?slug="+encodeURIComponent(p.slug))];
    const uniq=[...new Set(all)];
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+uniq.map(u=>"<url><loc>"+u.replaceAll("&","&amp;")+"</loc></url>").join("")+"</urlset>",{headers:{"Content-Type":"application/xml; charset=UTF-8","Cache-Control":"public, max-age=3600"}});
  }
  return env.ASSETS.fetch(request);
 }catch(e){console.error("Elias Arts Worker error",e);return bad("Something went wrong. Please try again.",500)}
}};