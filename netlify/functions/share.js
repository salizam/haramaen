// netlify/functions/share.js
// Per-item Open Graph card generator for HARAMAEN.
// Facebook/WhatsApp/Twitter crawlers don't run JavaScript, so they only read the
// static <meta og:*> tags of whatever URL is shared. This function fetches the
// specific item (service, business, agency, course, news, tip) from Supabase
// server-side and returns a tiny HTML page with the correct per-item OG tags,
// then redirects real (human) browsers into the app.

const SUPABASE_URL = 'https://prwggxoecsosuhmsxgbv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_J-k2N_Gt5bWIyQzdfzUNzA_GD3er-EE';
const SITE         = 'https://haramaen.net';
const DEFAULT_IMG  = SITE + '/icon-512.png';
const DEFAULT_TITLE= 'HARAMAEN — Panduan Umrah Lengkap Malaysia';
const DEFAULT_DESC = 'Cari agensi umrah berlesen MOTAC, bandingkan harga pakej, kursus umrah & mutawwif, direktori servis, doa, waktu solat & eBook panduan ibadah umrah.';

// type -> { table, app view, optional status filter }
const TYPES = {
  svc:      { table: 'service_submissions',  view: 'svc',      status: 'approved'  },
  biz:      { table: 'business_submissions', view: 'shop',     status: 'approved'  },
  agency:   { table: 'agencies',             view: 'agency',   status: 'approved'  },
  course:   { table: 'courses',              view: 'kursus',   status: 'approved'  },
  mutawwif: { table: 'mutawwif_courses',     view: 'mutawwif', status: 'approved'  },
  news:     { table: 'news',                 view: 'news',     status: 'published' },
  tip:      { table: 'umrah_tips',           view: 'tips',     status: 'published' },
  hotel:    { table: 'hotels',               view: 'stay',     status: null        }
};

function firstImg(a){
  if(!a) return '';
  if(typeof a === 'string'){ try{ a = JSON.parse(a); }catch(_){ return ''; } }
  return (Array.isArray(a) && a.length) ? a[0] : '';
}
function pickImage(type, r){
  switch(type){
    case 'svc':      return r.photo_url || firstImg(r.images) || '';
    case 'biz':      return r.signboard_url || firstImg(r.images) || r.poster_url || '';
    case 'agency':   return r.logo_url || '';
    case 'course':
    case 'mutawwif': return r.poster_url || firstImg(r.images) || '';
    case 'news':
    case 'tip':      return r.image_url || '';
    default:         return '';
  }
}
function stripHtml(s){ return String(s == null ? '' : s).replace(/<[^>]*>/g, ' '); }
function clamp(s, n){ s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function pickTitle(type, r){
  if(type === 'news' || type === 'tip') return r.title || DEFAULT_TITLE;
  if(type === 'course' || type === 'mutawwif') return clamp((r.anjuran || 'Kursus') + (r.tarikh_label ? (' — ' + r.tarikh_label) : ''), 90);
  return r.name || DEFAULT_TITLE;
}
function pickDesc(type, r){
  var d = '';
  if(type === 'news' || type === 'tip') d = stripHtml(r.body);
  else if(type === 'course' || type === 'mutawwif') d = [r.lokasi, [r.daerah, r.negeri].filter(Boolean).join(', '), r.masa].filter(Boolean).join(' · ');
  else if(type === 'hotel') d = [r.type, (r.distance_km != null ? r.distance_km + ' km dari Masjidil Haram' : '')].filter(Boolean).join(' · ');
  else d = r.description || r.note || '';
  return clamp(d, 200) || DEFAULT_DESC;
}
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

exports.handler = async function(event){
  var q = (event && event.queryStringParameters) || {};
  var type = String(q.type || '').toLowerCase();
  var id   = q.id != null ? String(q.id) : '';
  var cfg  = TYPES[type];

  var title = DEFAULT_TITLE, desc = DEFAULT_DESC, image = DEFAULT_IMG, redirect = SITE + '/';

  if(cfg && id){
    try{
      var rest = SUPABASE_URL + '/rest/v1/' + cfg.table +
                 '?id=eq.' + encodeURIComponent(id) +
                 (cfg.status ? ('&status=eq.' + cfg.status) : '') +
                 '&select=*&limit=1';
      var res = await fetch(rest, { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY } });
      var rows = await res.json();
      if(Array.isArray(rows) && rows.length){
        var r = rows[0];
        title = pickTitle(type, r);
        desc  = pickDesc(type, r);
        var img = pickImage(type, r);
        if(img) image = img;
        redirect = SITE + '/#' + cfg.view;
      }
    }catch(e){ /* fall through to defaults */ }
  }

  var canonical = SITE + '/.netlify/functions/share?type=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(id);
  var body = '<!doctype html><html lang="ms"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + esc(title) + '</title>' +
    '<meta name="description" content="' + esc(desc) + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:site_name" content="HARAMAEN">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:image" content="' + esc(image) + '">' +
    '<meta property="og:url" content="' + esc(canonical) + '">' +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<meta name="twitter:title" content="' + esc(title) + '">' +
    '<meta name="twitter:description" content="' + esc(desc) + '">' +
    '<meta name="twitter:image" content="' + esc(image) + '">' +
    // NOTE: NO <meta http-equiv="refresh"> — social crawlers (Facebook, WhatsApp,
    // Twitter) follow a meta-refresh and would scrape the destination's generic OG
    // instead of the per-item tags above. Crawlers don't run JavaScript, so we
    // redirect real humans with JS only (after a tick, so the tags are always present).
    '<script>setTimeout(function(){location.replace(' + JSON.stringify(redirect) + ');},60);<\/script>' +
    '</head><body style="font-family:system-ui,-apple-system,sans-serif;padding:28px;text-align:center;color:#311B92">' +
    '<p>Membuka HARAMAEN…</p>' +
    '<p><a href="' + esc(redirect) + '">Klik di sini jika tidak beralih automatik</a></p>' +
    '</body></html>';

  return {
    statusCode: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=300'
    },
    body: body
  };
};
