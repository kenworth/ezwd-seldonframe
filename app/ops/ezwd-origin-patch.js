// EZwebdeals standalone deployment - persistent runtime patch layer.
//
// Loaded via NODE_OPTIONS=--require so it re-applies on every container start,
// independent of the pinned image tag.

const Module = require("module");

// -- Patch 1: canonical public origin for server-generated redirects ----------
// Next derives request.url from its own listen address, so route handlers that
// build new URL(path, url.origin) emit http://localhost:3000/... behind a proxy.
const CANONICAL = (process.env.NEXT_PUBLIC_APP_URL || "https://ai.ezwderp.com").replace(/\/+$/, "");
const LOOPBACK = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;
const NativeURL = globalThis.URL;
class OriginPatchedURL extends NativeURL {
  constructor(input, base) {
    if (base !== undefined && base !== null && LOOPBACK.test(String(base))) super(input, CANONICAL);
    else super(input, base);
  }
}
Object.defineProperty(OriginPatchedURL, "name", { value: "URL" });
OriginPatchedURL.canParse = NativeURL.canParse;
OriginPatchedURL.parse = NativeURL.parse;
OriginPatchedURL.createObjectURL = NativeURL.createObjectURL;
OriginPatchedURL.revokeObjectURL = NativeURL.revokeObjectURL;
globalThis.URL = OriginPatchedURL;

// -- Patch 2: curated photo fallback for the R1 landing photo resolver --------
// resolveServicePhoto returns null when UNSPLASH_ACCESS_KEY is unset, rendering
// striped "photo - <service>" placeholders on every generated site. Fall back to
// the app's OWN curated bundles (lib/crm/personality-images.ts). Inert when the
// Unsplash key is configured: the API path returns first.
const BUNDLES = {"general": ["https://images.unsplash.com/photo-1503387762-cf8d8a39c049?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1503387837-b154d5074bd2?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1581092334651-ddf26d9a09d0?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=800&h=600&q=80"], "hvac": ["https://images.unsplash.com/photo-1581094288338-2314dddb7ece?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1597007030739-6d2e7172ee0a?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1581092334651-ddf26d9a09d0?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1622428051717-dcd8412959de?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1565182999561-18d7dc61c393?auto=format&fit=crop&w=800&h=600&q=80"], "dental": ["https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1609840114035-3c981b782dfe?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1551269901-5c5e14c25df7?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1606265752439-1f18756aa5fc?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1581595220892-b0739db3ba8c?auto=format&fit=crop&w=800&h=600&q=80"], "legal": ["https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1589216532372-1c2a367900d9?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1505664063603-28e48ca204eb?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1589994160957-fa46ab66f78d?auto=format&fit=crop&w=800&h=600&q=80"], "agency": ["https://images.unsplash.com/photo-1542744094-3a31f272c490?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1559028012-481c04fa702d?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=800&h=600&q=80"], "medspa": ["https://images.unsplash.com/photo-1596704017254-9b121068fb31?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1591343395082-e120087004b4?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1583416750470-965b2707b355?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&w=800&h=600&q=80"], "coaching": ["https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1573497620053-ea5300f94f21?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1573164574511-73c773193279?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&h=600&q=80", "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=800&h=600&q=80"]};
const KEYWORDS = [["agenc|marketing|seo|digital|brand|web ?design|web ?dev", "agency"], ["dental|dentist|ortho", "dental"], ["legal|law|attorney|paralegal", "legal"], ["hvac|heating|cooling|furnace|air ?condition", "hvac"], ["med ?spa|aesthetic|botox|skin", "medspa"], ["coach|consult|strateg|fractional", "coaching"]];

// -- Patch 3: keep real site imagery when Firecrawl is unavailable ------------
// The direct-fetch fallback produced markdown only, so the image harvester never
// ran and scraped photos were dropped.
const HARVEST_ANCHOR = 's={ok:!0,markdown:i.slice(0,12e4),finalUrl:t.url}';
const HARVEST_REPLACEMENT =
  's={ok:!0,markdown:i.slice(0,12e4),finalUrl:t.url,html:a,ogImage:__ezwdOgImage(a,e.url),favicon:null}';
const OG_HELPER =
  'function __ezwdOgImage(h,u){try{var m=/<meta[^>]+(?:property|name)=["\']og:image(?::url)?["\'][^>]*>/i.exec(h);' +
  'if(!m){m=/<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']og:image(?::url)?["\']/i.exec(h);' +
  'return m&&m[1]?new URL(m[1],u).toString():null;}' +
  'var c=/content=["\']([^"\']+)["\']/i.exec(m[0]);return c&&c[1]?new URL(c[1],u).toString():null;}catch(e){return null;}}';

const PHOTO_ANCHOR = 'return t&&!l(t)?{src:o(t),alt:e.realAlt?.trim()||e.serviceName}:null}';
// Replace the whole tail with a guarded helper. The caller wraps this call in a
// bare `catch {}` (degrade silently), so ANY throw inside the fallback would look
// exactly like "no photo available" and be undiagnosable from the outside.
const PHOTO_REPLACEMENT = 'return __ezwdResolve(e,t,l,o)}';

// Runtime resolver: keeps the original real-photo branch, then falls back to the
// curated bundle. Logs every branch when EZWD_PATCH_DEBUG is set.
const RESOLVE_HELPER =
  'function __ezwdResolve(e,t,l,o){try{' +
  'var dbg=process.env.EZWD_PATCH_DEBUG;' +
  'if(t&&!l(t)){if(dbg)console.log("[ezwd-patch] photo=real svc="+e.serviceName);' +
  'return {src:o(t),alt:e.realAlt?.trim()||e.serviceName};}' +
  'var r=__ezwdCurated(e.serviceName,e.vertical,e.businessName);' +
  'if(dbg)console.log("[ezwd-patch] photo=curated svc="+(e.serviceName||"(hero)")+" hit="+(r&&r.src?"yes":"NO"));' +
  'return r||null;' +
  '}catch(err){console.error("[ezwd-patch] resolve error: "+(err&&err.message));return null;}}';

// Written as literal source (NOT Function.prototype.toString of an outer-scope
// function) because these run inside the compiled chunk, where only the names
// declared in this block exist. Stringifying an outer function silently bound
// `pickBundle`/`BUNDLES` to names that were never declared in the chunk, so every
// call threw and the caller's bare `catch {}` made it look like "no photo".
const CURATED_HELPER =
  'function __ezwdCurated(sn,v,bn){try{' +
  'if(!__ezwdBundles)return null;' +
  'var hay=String(sn||"")+" "+String(v||"");' +
  'var list=null;' +
  'for(var i=0;i<__ezwdKeywords.length;i++){' +
  'if(new RegExp(__ezwdKeywords[i][0],"i").test(hay)){' +
  'var cand=__ezwdBundles[__ezwdKeywords[i][1]];if(cand&&cand.length){list=cand;break;}}}' +
  'if(!list||!list.length){var vv=String(v||"").toLowerCase().trim();' +
  'list=__ezwdBundles[vv]||__ezwdBundles.general;}' +
  'if(!list||!list.length)return null;' +
  'var h=5381,seed=String(sn||"")+"|"+String(bn||"");' +
  'for(var j=0;j<seed.length;j++)h=((h<<5)+h+seed.charCodeAt(j))|0;' +
  'return {src:list[Math.abs(h)%list.length],alt:sn?(sn+" \\u2014 "+bn):bn};' +
  '}catch(err){console.error("[ezwd-patch] curated error: "+(err&&err.message));return null;}}';

const photoBlock =
  RESOLVE_HELPER + CURATED_HELPER +
  'var __ezwdBundles=' + JSON.stringify(BUNDLES) + ';' +
  'var __ezwdKeywords=' + JSON.stringify(KEYWORDS) + ';';

const origCompile = Module.prototype._compile;
Module.prototype._compile = function (content, filename) {
  try {
    if (content.indexOf(PHOTO_ANCHOR) !== -1) {
      content = photoBlock + content.split(PHOTO_ANCHOR).join(PHOTO_REPLACEMENT);
      if (process.env.EZWD_PATCH_DEBUG) console.log("[ezwd-patch] curated photo fallback -> " + filename);
    }
    if (content.indexOf(HARVEST_ANCHOR) !== -1) {
      content = OG_HELPER + content.split(HARVEST_ANCHOR).join(HARVEST_REPLACEMENT);
      if (process.env.EZWD_PATCH_DEBUG) console.log("[ezwd-patch] extraction image harvest -> " + filename);
    }
  } catch (err) {
    console.error("[ezwd-patch] failed: " + (err && err.message));
  }
  return origCompile.call(this, content, filename);
};
