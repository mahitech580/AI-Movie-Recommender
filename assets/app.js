(() => {
  "use strict";

  const API_BASE = "https://api.themoviedb.org/3";
  const IMAGE_BASE = "https://image.tmdb.org/t/p/";
  const BACKEND_STORE = "cineplay.backend.url";
  const USER_STORE = "cineplay.user.id";
  const FALLBACK_IMAGE_PREFIX = "data:image/svg+xml;charset=UTF-8,";
  const STORE = {
    list: "cineplay.mylist",
    history: "cineplay.history",
    signals: "cineplay.signals",
    taste: "cineplay.taste",
    model: "cineplay.model",
    live: "cineplay.live.cache",
    key: "cineplay.tmdb.key"
  };

  const GENRE_BY_ID = {
    28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",
    18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",
    9648:"Mystery",10749:"Romance",878:"Sci-Fi",10770:"TV Movie",53:"Thriller",
    10752:"War",37:"Western"
  };

  const MOODS = [
    {label:"Mind-bending", icon:"⌁", terms:["mind-bending","dream","time","identity","reality","psychology"], filter:""},
    {label:"Adrenaline", icon:"↯", terms:["action","survival","battle","hero","military","chase"], filter:"action"},
    {label:"Feel good", icon:"♡", terms:["heartwarming","friendship","family","love","comedy"], filter:""},
    {label:"Dark nights", icon:"◒", terms:["dark","crime","thriller","mystery","horror","psychology"], filter:"thriller"},
    {label:"Epic worlds", icon:"✧", terms:["epic","fantasy","space","adventure","war","magic"], filter:""},
    {label:"Animation", icon:"◈", terms:["animation","anime","family","imagination","magic"], filter:"animation"}
  ];

  const state = {
    movies: (window.MOVIES || []).slice(),
    hero: [],
    heroIndex: 0,
    selected: null,
    filter: "all",
    query: "",
    live: false,
    liveCount: 0,
    syncing: false,
    searchTimer: null,
    heroTimer: null,
    signals: load(STORE.signals, {}),
    taste: load(STORE.taste, {}),
    model: load(STORE.model, {
      content: 0.34, profile: 0.28, genre: 0.13, quality: 0.09,
      popularity: 0.06, freshness: 0.05, exploration: 0.05
    }),
    lastSync: 0,
    cacheMeta: load(STORE.live, {time:0, pools:{}}),
    detailCache: {}
  };

  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function getUserId() {
    let id = localStorage.getItem(USER_STORE);
    if (!id) {
      const randomPart = (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
        ? globalThis.crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
      id = "cineplay-" + randomPart;
      localStorage.setItem(USER_STORE, id);
    }
    return id;
  }

  function fallbackImage(title="CINEPLAY") {
    const safe = String(title).slice(0, 28);
    return FALLBACK_IMAGE_PREFIX + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop stop-color="#0a1711"/><stop offset="1" stop-color="#18070b"/></linearGradient></defs>' +
      '<rect width="400" height="600" fill="url(#g)"/>' +
      '<circle cx="315" cy="100" r="120" fill="#27dc91" opacity=".08"/>' +
      '<circle cx="70" cy="500" r="150" fill="#ff3e55" opacity=".07"/>' +
      '<path d="M112 240h46v120h-46zM177 200h46v160h-46zM242 225h46v135h-46z" fill="#27dc91" opacity=".75"/>' +
      '<text x="30" y="540" fill="#d9e4de" font-family="Arial,sans-serif" font-size="24" font-weight="700">' +
      safe.replace(/[<>&]/g,"") + '</text></svg>'
    ).replaceAll("'","%27").replaceAll('"',"%22");
  }

  function imageMarkup(url, alt, extraClass="") {
    const src = url || fallbackImage(alt);
    return '<img class="'+extraClass+'" src="'+esc(src)+'" alt="'+esc(alt)+'" loading="lazy" ' +
      'onerror="this.onerror=null;this.src=\''+esc(fallbackImage(alt))+'\'">';
  }

  function backendUrl() {
    return (localStorage.getItem(BACKEND_STORE) || "").trim().replace(/\/$/,"");
  }

  async function backendFetch(path, options={}) {
    const base = backendUrl();
    if (!base) throw new Error("NO_BACKEND");
    const response = await fetch(base + path, {
      ...options,
      headers: { "Content-Type":"application/json", ...(options.headers||{}) }
    });
    if (!response.ok) throw new Error("BACKEND_"+response.status);
    return response.json();
  }

  function uniq(items, keyFn = x => x) {
    const seen = new Set();
    return items.filter(item => {
      const key = String(keyFn(item));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function year(movie) {
    return movie.year || (movie.release_date ? String(movie.release_date).slice(0,4) : "—");
  }

  function genres(movie) {
    return (movie.genres || []).map(g => typeof g === "string" ? g : (g.name || "")).filter(Boolean);
  }

  function rating(movie) {
    return Number(movie.rating ?? movie.vote_average ?? 0).toFixed(1);
  }

  function voteCount(movie) {
    return Number(movie.votes ?? movie.vote_count ?? 0);
  }

  function popularity(movie) {
    return Number(movie.popularity ?? 0);
  }

  function poster(movie, size="w500") {
    if (!movie?.poster) return "";
    return movie.poster.startsWith("http") ? movie.poster : IMAGE_BASE + size + movie.poster;
  }

  function backdrop(movie) {
    const path = movie?.backdrop || movie?.poster;
    if (!path) return "";
    return path.startsWith("http") ? path : IMAGE_BASE + "original" + path;
  }

  function movieText(movie) {
    return [
      movie.title,
      genres(movie).join(" "),
      (movie.tags || []).join(" "),
      movie.overview,
      movie.language,
      movie.original_language
    ].join(" ");
  }

  function tokenize(text) {
    const stop = new Set([
      "the","and","with","from","into","this","that","for","his","her","their","your",
      "movie","film","about","after","before","where","when","who","while","have","has",
      "they","them","are","was","were","its","over","through","been","will","you"
    ]);
    return String(text || "").toLowerCase().replace(/[^a-z0-9\s-]/g," ")
      .split(/\s+/).filter(t => t.length > 2 && !stop.has(t));
  }

  function termCounts(text) {
    const out = {};
    tokenize(text).forEach(t => out[t] = (out[t] || 0) + 1);
    return out;
  }

  function normVector(map) {
    const len = Math.sqrt(Object.values(map).reduce((s,v)=>s+v*v,0));
    if (!len) return {};
    const out = {};
    Object.keys(map).forEach(k => out[k] = map[k] / len);
    return out;
  }

  function cosine(a,b) {
    if (!a || !b) return 0;
    const small = Object.keys(a).length <= Object.keys(b).length ? a : b;
    const large = small === a ? b : a;
    let dot=0, aa=0, bb=0;
    Object.keys(a).forEach(k => aa += a[k]*a[k]);
    Object.keys(b).forEach(k => bb += b[k]*b[k]);
    Object.keys(small).forEach(k => { dot += (small[k] || 0) * (large[k] || 0); });
    return aa && bb ? dot / Math.sqrt(aa*bb) : 0;
  }

  function getIdf() {
    const docs = state.movies.map(m => new Set(tokenize(movieText(m))));
    const df = {};
    docs.forEach(doc => doc.forEach(t => df[t] = (df[t] || 0) + 1));
    const n = Math.max(1, docs.length);
    return Object.fromEntries(Object.entries(df).map(([t,c]) => [t, Math.log((n+1)/(c+1))+1]));
  }

  function vectorFor(movie, idf) {
    const counts = termCounts(movieText(movie));
    const weighted = {};
    Object.keys(counts).forEach(k => weighted[k] = counts[k] * (idf[k] || 1));
    return normVector(weighted);
  }

  function profileVector() {
    const out = {};
    Object.entries(state.taste).forEach(([token, value]) => {
      if (Number(value) > 0) out[token] = Number(value);
    });
    return normVector(out);
  }

  function getList() {
    return load(STORE.list, []);
  }

  function listed(movie) {
    return getList().some(x => String(x.id) === String(movie.id));
  }

  function history() {
    return load(STORE.history, []);
  }

  function signalCount() {
    return Object.values(state.signals).reduce((s,v)=>s+Number(v||0),0);
  }

  function toast(message) {
    const n = $("toast");
    if (!n) return;
    n.textContent = message;
    n.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => n.classList.remove("show"), 2600);
  }

  function notifyDataChanged() {
    renderStats();
    renderPreferences();
    renderActivity();
    renderList();
    renderContinue();
  }

  function findMovie(id) {
    return state.movies.find(m => String(m.id) === String(id));
  }

  function mergeMovies(incoming) {
    const map = new Map();
    [...(state.movies || []), ...(window.MOVIES || []), ...(incoming || [])].forEach(movie => {
      if (!movie?.id || !movie?.title) return;
      const existing = map.get(String(movie.id));
      if (existing) {
        map.set(String(movie.id), {
          ...existing,
          ...movie,
          genres: Array.isArray(movie.genres) && movie.genres.length ? movie.genres : existing.genres,
          tags: Array.isArray(movie.tags) && movie.tags.length ? movie.tags : existing.tags,
          poster: movie.poster || existing.poster,
          backdrop: movie.backdrop || existing.backdrop,
          overview: movie.overview || existing.overview,
          year: movie.year && movie.year !== "—" ? movie.year : existing.year
        });
      } else {
        map.set(String(movie.id), {...movie});
      }
    });
    state.movies = Array.from(map.values());
  }

  function learn(movie, eventType="open") {
    if (!movie) return;

    const rewards = {open:0.45, search:0.18, list:1.0, similar:0.65, play:1.2, mood:0.35};
    const reward = rewards[eventType] || 0.2;
    state.signals[movie.id] = Number(state.signals[movie.id] || 0) + reward;

    tokenize(movieText(movie)).slice(0,80).forEach(token => {
      state.taste[token] = Number(state.taste[token] || 0) * 0.985 + reward;
    });

    const boost = Math.min(0.05, reward * 0.015);
    state.model.profile = Math.min(0.48, state.model.profile + boost);
    state.model.genre = Math.min(0.22, state.model.genre + reward * 0.003);
    state.model.content = Math.max(0.20, state.model.content - reward * 0.001);
    save(STORE.signals, state.signals);
    save(STORE.taste, state.taste);
    save(STORE.model, state.model);
  }

  function recordHistory(movie, type="open") {
    if (!movie) return;
    const h = history();
    h.unshift({
      id: movie.id,
      title: movie.title,
      year: year(movie),
      poster: movie.poster || "",
      type,
      time: new Date().toISOString(),
      progress: type === "play" ? 0.24 : Math.min(0.92, 0.06 + (Number(state.signals[movie.id]||0) * 0.08))
    });
    save(STORE.history, uniq(h, x=>x.id).slice(0,30));
    learn(movie, type);
    sendBackendEvent(movie,type).catch(()=>{});
  }

  function toggleList(movie) {
    const current = getList();
    const exists = current.some(x => String(x.id) === String(movie.id));
    const next = exists ? current.filter(x => String(x.id)!==String(movie.id)) : [movie,...current];
    save(STORE.list, next);
    if (!exists) recordHistory(movie, "list");
    renderList();
    renderContinue();
    updateListButtons(movie);
    toast(exists ? movie.title + " removed from My List" : movie.title + " added to My List");
  }

  function updateListButtons(movie) {
    if (!movie) return;
    const isAdded = listed(movie);
    $$("[data-list-id]").forEach(btn => {
      if (String(btn.dataset.listId) === String(movie.id)) {
        btn.textContent = isAdded ? "✓" : "＋";
        btn.classList.toggle("added", isAdded);
        btn.setAttribute("aria-label", isAdded ? "Remove from My List" : "Add to My List");
      }
    });
    if ($("heroList")) $("heroList").classList.toggle("added", isAdded);
    if ($("modalList")) {
      $("modalList").textContent = isAdded ? "✓" : "＋";
      $("modalList").classList.toggle("added", isAdded);
    }
  }

  function badgeLabel(movie) {
    const match = Number(movie.match || 0);
    if (match >= 90) return "Perfect fit";
    if (match >= 80) return "Strong fit";
    if (match >= 70) return "Good fit";
    return "Explore";
  }

  function card(movie, index, compact=false) {
    const add = listed(movie) ? "✓" : "＋";
    const match = Number(movie.match || 0);
    const rank = index != null ? '<span class="rank-badge">#'+(index+1)+'</span>' : "";
    const live = movie.live ? '<span class="live-card-badge"><i></i>LIVE</span>' : "";
    const matchMarkup = match ? '<span class="ai-match">'+match+'% match</span>' : "";
    const posterUrl = poster(movie, compact ? "w342" : "w500");

    return '<article class="movie-card '+(compact?"compact":"")+'" data-movie-id="'+esc(movie.id)+'" tabindex="0" aria-label="'+esc(movie.title)+'">'+
      '<div class="poster-frame" style="--card-accent:'+(movie.accent==="green"?"#21d58c":"#ff334d")+'">'+
        imageMarkup(posterUrl, movie.title)+
        '<div class="poster-gradient"></div>'+
        rank+live+matchMarkup+
        '<button class="mini-list '+(listed(movie)?"added":"")+'" data-list-id="'+esc(movie.id)+'" type="button" aria-label="'+(listed(movie)?"Remove from My List":"Add to My List")+'">'+add+'</button>'+
        '<div class="hover-layer"><button class="play-dot" data-open="'+esc(movie.id)+'" type="button">▶</button><div class="hover-meta"><span>'+esc(badgeLabel(movie))+'</span><span>★ '+esc(rating(movie))+'</span></div></div>'+
      '</div>'+
      '<div class="movie-caption"><h3>'+esc(movie.title)+'</h3><div><span>'+esc(year(movie))+'</span><i>•</i><span>★ '+esc(rating(movie))+'</span></div></div>'+
      '</article>';
  }

  function bindRail(node) {
    if (!node) return;
    node.querySelectorAll(".movie-card").forEach(article => {
      const open = () => openMovie(findMovie(article.dataset.movieId));
      article.onclick = e => { if (!e.target.closest(".mini-list") && !e.target.closest(".play-dot")) open(); };
      article.onkeydown = e => {
        if ((e.key === "Enter" || e.key === " ") && !e.target.closest("button")) {
          e.preventDefault(); open();
        }
      };
    });
    node.querySelectorAll(".play-dot").forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); const m=findMovie(btn.dataset.open); if(m){ recordHistory(m,"play"); openMovie(m,true); } };
    });
    node.querySelectorAll(".mini-list").forEach(btn => {
      btn.onclick = e => { e.stopPropagation(); const m=findMovie(btn.dataset.listId); if(m) toggleList(m); };
    });
  }

  function renderRail(id, movies, numbered=false, compact=false) {
    const node = $(id);
    if (!node) return;
    node.innerHTML = movies?.length ? movies.map((m,i)=>card(m, numbered?i:null, compact)).join("") :
      '<div class="rail-empty">No matching titles in this shelf.</div>';
    bindRail(node);
  }

  function renderContinue() {
    const node=$("continueRail"), empty=$("continueEmpty");
    if (!node) return;
    const items=history().filter(h => h.type !== "list").slice(0,5).map(h=>findMovie(h.id)).filter(Boolean);
    node.innerHTML=items.map((m,i)=>{
      const h=history().find(x=>String(x.id)===String(m.id)) || {};
      const progress=Math.round((h.progress||0)*100);
      return '<button class="continue-card" data-movie-id="'+esc(m.id)+'" type="button">'+
        '<div class="continue-poster">'+imageMarkup(poster(m,"w342"),m.title)+ '<span class="continue-play">▶</span></div>'+
        '<div class="continue-info"><b>'+esc(m.title)+'</b><span>'+esc(year(m))+' · '+esc(genreLine(m))+'</span><div class="progress"><i style="width:'+progress+'%"></i></div><small>'+progress+'% explored</small></div>'+
      '</button>';
    }).join("");
    empty?.classList.toggle("hidden",items.length>0);
    node.classList.toggle("hidden",!items.length);
    node.querySelectorAll(".continue-card").forEach(btn=>btn.onclick=()=>openMovie(findMovie(btn.dataset.movieId),true));
  }

  function genreLine(movie) { return genres(movie).slice(0,3).join(" · "); }

  function renderStats() {
    const signals=signalCount();
    const genresSeen=Object.entries(state.taste).filter(([,v])=>Number(v)>0.6).length;
    $("signalCount") && ($("signalCount").textContent = Math.floor(signals));
    $("metricSignals") && ($("metricSignals").textContent = Math.floor(signals));
    $("metricGenres") && ($("metricGenres").textContent = Math.min(18,genresSeen));
    $("heroCount") && ($("heroCount").textContent = state.movies.length+"+");
    $("liveCount") && ($("liveCount").textContent = state.live ? String(state.liveCount) : "—");
    $("engineScore") && ($("engineScore").textContent = Math.floor(signals)+" signals");
    $("modelPill") && ($("modelPill").textContent = state.live ? "HYBRID · LIVE" : "HYBRID · LOCAL");
    $("sourceLabel") && ($("sourceLabel").textContent = state.live ? "LIVE + LOCAL AI" : "CURATED + LOCAL AI");
    $("liveLabel") && ($("liveLabel").textContent = state.live ? "LIVE" : "OFFLINE");
  }

  function setBackdrop(node, movie) {
    if (!node || !movie) return;
    const url = backdrop(movie);
    if (!url) {
      node.style.backgroundImage = 'url("'+fallbackImage(movie.title)+'")';
      return;
    }
    const img = new Image();
    img.onload = () => { node.style.backgroundImage = 'url("'+url+'")'; };
    img.onerror = () => { node.style.backgroundImage = 'url("'+fallbackImage(movie.title)+'")'; };
    img.src = url;
  }

  function updateHero(movie) {
    if (!movie) return;
    const media=$("heroMedia");
    if (media) setBackdrop(media, movie);
    $("heroTitle") && ($("heroTitle").textContent=movie.title);
    $("heroOverview") && ($("heroOverview").textContent=movie.overview || "Explore a new cinematic world.");
    $("heroMeta") && ($("heroMeta").innerHTML='<span class="rating-star">★ '+esc(rating(movie))+'</span><span>'+esc(year(movie))+'</span><span>'+esc(genreLine(movie))+'</span><span>'+esc((movie.language||movie.original_language||"en").toUpperCase())+'</span>');
    $("heroTags") && ($("heroTags").innerHTML=genres(movie).slice(0,3).map(g=>'<span>'+esc(g)+'</span>').join("")+'<span>'+Math.round(popularity(movie))+' popularity</span>');
    $("heroIndex") && ($("heroIndex").textContent=String(state.heroIndex+1).padStart(2,"0"));
    $("heroRecommend").onclick=async()=>{ const backendUsed=await loadBackendRecommendations(movie.id); if(!backendUsed){ const recs=recommendFor(movie,12); renderRail("aiRail",recs); $("recommendationSubtitle").textContent="Local hybrid AI ranking for “"+movie.title+"”."; } $("aiRail")?.scrollIntoView({behavior:"smooth",block:"center"}); recordHistory(movie,"similar"); toast((backendUsed?"Python ML":"Local AI")+" queue built from "+movie.title); };
    $("heroDetails").onclick=()=>openMovie(movie);
    $("heroList").onclick=()=>toggleList(movie);
    updateListButtons(movie);
  }

  function buildHero() {
    const pool=topByQuality(state.movies).slice(0,8);
    state.hero=pool.length?pool:state.movies.slice(0,8);
    if (!state.hero.length) return;
    state.heroIndex=Math.min(state.heroIndex,state.hero.length-1);
    updateHero(state.hero[state.heroIndex]);
    const dots=$("heroDots");
    if (dots) dots.innerHTML=state.hero.map((m,i)=>'<button class="'+(i===state.heroIndex?"active":"")+'" data-hero="'+i+'" type="button" aria-label="Show '+esc(m.title)+'"></button>').join("");
    dots?.querySelectorAll("button").forEach(btn=>btn.onclick=()=>{state.heroIndex=Number(btn.dataset.hero);updateHero(state.hero[state.heroIndex]);updateHeroDots();restartHeroTimer();});
  }

  function updateHeroDots() {
    $("heroDots")?.querySelectorAll("button").forEach((b,i)=>b.classList.toggle("active",i===state.heroIndex));
  }

  function restartHeroTimer() {
    clearInterval(state.heroTimer);
    state.heroTimer=setInterval(()=>{
      if (!state.hero.length) return;
      state.heroIndex=(state.heroIndex+1)%state.hero.length;
      updateHero(state.hero[state.heroIndex]);
      updateHeroDots();
    },10000);
  }

  function quality(movie) {
    const votes=voteCount(movie), r=Number(rating(movie));
    const prior=7.0, priorVotes=500;
    return ((votes/(votes+priorVotes))*r + (priorVotes/(votes+priorVotes))*prior)/10;
  }

  function freshness(movie) {
    const d=movie.release_date?new Date(movie.release_date):new Date(String(year(movie))+"-07-01");
    if (Number.isNaN(d.getTime())) return 0.3;
    const days=(Date.now()-d.getTime())/86400000;
    if (days<0) return 1;
    return Math.max(0,1-Math.min(days,3650)/3650);
  }

  function genreAffinity(movie) {
    const gs=genres(movie);
    if (!gs.length) return 0;
    const vals=gs.map(g=>Number(state.taste[g.toLowerCase()]||0));
    return Math.min(1, vals.reduce((a,b)=>a+b,0)/(gs.length*4));
  }

  function novelty(movie) {
    return listed(movie) ? 0.05 : Math.max(0.08, 1/(1+Number(state.signals[movie.id]||0)));
  }

  function popularityScore(movie) {
    const p=Math.log1p(Math.max(0,popularity(movie)));
    return Math.min(1,p/6.5);
  }

  function buildWhy(movie, source) {
    const shared=source ? genres(movie).filter(g=>genres(source).map(x=>x.toLowerCase()).includes(g.toLowerCase())) : [];
    const liked=genres(movie).filter(g=>Number(state.taste[g.toLowerCase()]||0)>1.2);
    if (liked.length) return "Because you keep exploring "+liked.slice(0,2).join(" and ");
    if (shared.length) return "Shares "+shared.slice(0,3).join(", ")+" with your current pick";
    if (state.live && movie.live) return "Live catalog signal + your local taste profile";
    return "Strong match from content, quality and exploration signals";
  }

  function recommendFor(source, limit=12) {
    const idf=getIdf();
    const profile=profileVector();
    const sourceVector=source?vectorFor(source,idf):null;

    const seenIds = new Set(history().map(h=>String(h.id)));
    return state.movies
      .filter(m=>!source || String(m.id)!==String(source.id))
      .filter(m=>!seenIds.has(String(m.id)))
      .filter(m=>state.filter==="all" || matchesFilter(m,state.filter))
      .map(movie=>{
        const vector=vectorFor(movie,idf);
        const profileSim=cosine(vector,profile);
        const content=sourceVector?cosine(vector,sourceVector):0;
        const genre=genreAffinity(movie);
        const q=quality(movie);
        const pop=popularityScore(movie);
        const fresh=freshness(movie);
        const explore=novelty(movie);
        const localSignal=Math.min(1,Number(state.signals[movie.id]||0)/5);
        const raw =
          state.model.content*content +
          state.model.profile*profileSim +
          state.model.genre*genre +
          state.model.quality*q +
          state.model.popularity*pop +
          state.model.freshness*fresh +
          state.model.exploration*explore +
          localSignal*0.05;
        const match=Math.round(Math.max(55,Math.min(99,raw*118)));
        return {...movie, score:raw, match, reason:buildWhy(movie,source)};
      })
      .sort((a,b)=>b.score-a.score)
      .slice(0,limit);
  }

  function topByQuality(movies) {
    return movies.slice().sort((a,b)=>(quality(b)*0.75+popularityScore(b)*0.25)-(quality(a)*0.75+popularityScore(a)*0.25));
  }

  function topTrending(movies) {
    return movies.slice().sort((a,b)=>(popularity(b)*0.7+quality(b)*0.3)-(popularity(a)*0.7+quality(a)*0.3));
  }

  function hiddenGems(movies) {
    return movies.slice().sort((a,b)=>{
      const sa=quality(a)*(1.1-Math.min(1,popularityScore(a))) + Number(a.rating||0)/80;
      const sb=quality(b)*(1.1-Math.min(1,popularityScore(b))) + Number(b.rating||0)/80;
      return sb-sa;
    }).slice(0,12);
  }

  function matchesFilter(movie, filter) {
    const gs=genres(movie).map(g=>g.toLowerCase());
    if (filter==="india") return ["hi","ta","te","ml","kn","bn","mr","pa"].includes(String(movie.language||movie.original_language||"").toLowerCase()) ||
      /india|bollywood|telugu|tamil|hindi|malayalam|kannada/i.test(movie.title+" "+movieText(movie));
    return gs.some(g=>g===filter.toLowerCase() || g.replace("sci-fi","sci-fi")===filter.toLowerCase());
  }

  function applyFilter() {
    const available=state.movies.filter(m=>state.filter==="all" || matchesFilter(m,state.filter));
    const recs=recommendFor(null,18);
    renderRail("aiRail",recs);
    renderRail("trendingRail",topTrending(available).slice(0,16));
    renderRail("ratedRail",topByQuality(available).slice(0,16));
    renderRail("newRail",available.slice().sort((a,b)=>freshness(b)-freshness(a)).slice(0,16));
    renderRail("gemsRail",hiddenGems(available));
    updateFilterButtons();
  }

  function updateFilterButtons() {
    $$(".filter-chip").forEach(btn=>btn.classList.toggle("active",btn.dataset.filter===state.filter));
  }

  function renderTop10() {
    const list=topTrending(state.movies).slice(0,10);
    const node=$("top10Rail");
    if (!node) return;
    node.innerHTML=list.map((m,i)=>
      '<button class="top10-card" type="button" data-movie-id="'+esc(m.id)+'">'+
        '<span class="top10-number">'+String(i+1).padStart(2,"0")+'</span>'+
        '<div class="top10-poster">'+imageMarkup(poster(m,"w342"),m.title)+'</div>'+
        '<div class="top10-copy"><b>'+esc(m.title)+'</b><span>★ '+esc(rating(m))+' · '+esc(year(m))+'</span><small>'+esc(genres(m).slice(0,2).join(" · "))+'</small></div>'+
      '</button>'
    ).join("");
    node.querySelectorAll(".top10-card").forEach(btn=>btn.onclick=()=>openMovie(findMovie(btn.dataset.movieId)));
  }

  function renderMoods() {
    const node=$("moodGrid");
    if (!node) return;
    node.innerHTML=MOODS.map(m=>
      '<button class="mood-card" type="button" data-mood="'+esc(m.label)+'">'+
        '<span class="mood-icon">'+m.icon+'</span><div><b>'+esc(m.label)+'</b><small>'+esc(m.terms.slice(0,4).join(" · "))+'</small></div><span class="mood-arrow">→</span>'+
      '</button>'
    ).join("");
    node.querySelectorAll(".mood-card").forEach(btn=>btn.onclick=()=>{
      const mood=MOODS.find(x=>x.label===btn.dataset.mood);
      state.query=mood.terms.join(" ");
      $("searchInput").value=mood.label;
      performSearch(mood.terms.join(" "),true);
      $("aiRail")?.scrollIntoView({behavior:"smooth",block:"center"});
    });
  }

  function renderList() {
    const items=getList().map(x=>findMovie(x.id)||x).filter(m=>m&&m.title);
    renderRail("listRail",items);
    $("listEmpty")?.classList.toggle("hidden",items.length>0);
  }

  function renderActivity() {
    const node=$("historyList"), empty=$("historyEmpty");
    if (!node) return;
    const items=history().slice(0,12);
    node.innerHTML=items.map(h=>{
      const m=findMovie(h.id);
      if (!m) return "";
      const typeLabel={open:"Opened",play:"Played preview",list:"Saved",similar:"Built from"}[h.type]||"Explored";
      return '<button class="activity-row" type="button" data-movie-id="'+esc(m.id)+'">'+
        '<div class="activity-thumb">'+imageMarkup(poster(m,"w185"),m.title)+'</div>'+
        '<div><b>'+esc(m.title)+'</b><span>'+esc(typeLabel)+' · '+timeAgo(h.time)+'</span></div>'+
        '<em>→</em>'+
      '</button>';
    }).join("");
    empty?.classList.toggle("hidden",items.length>0);
    node.querySelectorAll(".activity-row").forEach(btn=>btn.onclick=()=>openMovie(findMovie(btn.dataset.movieId)));
  }

  function timeAgo(iso) {
    const d=new Date(iso), diff=Math.max(0,Date.now()-d.getTime())/1000;
    if (diff<60) return "just now";
    if (diff<3600) return Math.floor(diff/60)+"m ago";
    if (diff<86400) return Math.floor(diff/3600)+"h ago";
    return Math.floor(diff/86400)+"d ago";
  }

  function renderPreferences() {
    const node=$("preferenceBars");
    if (!node) return;
    const counts=Object.entries(state.taste).filter(([,v])=>Number(v)>0.4)
      .sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,5);
    const max=Math.max(1,...counts.map(([,v])=>Number(v)));
    node.innerHTML=counts.length ? counts.map(([k,v])=>
      '<div class="pref-row"><div><span>'+esc(k)+'</span><b>'+Math.round(Number(v)/max*100)+'%</b></div><i><em style="width:'+Math.round(Number(v)/max*100)+'%"></em></i></div>'
    ).join("") : '<p class="pref-empty">Your genre profile will appear here.</p>';
    const title=$("profileTitle"), textNode=$("profileText");
    if (counts.length) {
      const names=counts.slice(0,3).map(([k])=>k[0].toUpperCase()+k.slice(1));
      title.textContent="You lean "+names[0];
      textNode.textContent="CINEPLAY is seeing a preference for "+names.join(", ")+". Keep exploring to make the model more precise.";
    } else {
      title.textContent="CINEPLAY Explorer";
      textNode.textContent="Explore a few titles and the engine will start detecting patterns in your taste.";
    }
  }

  function renderLab() {
    const node=$("modelConsole");
    if (!node) return;
    const s=signalCount();
    node.innerHTML=
      '<div><span>CONTENT</span><b>'+state.model.content.toFixed(3)+'</b></div>'+
      '<div><span>PROFILE</span><b>'+state.model.profile.toFixed(3)+'</b></div>'+
      '<div><span>GENRE</span><b>'+state.model.genre.toFixed(3)+'</b></div>'+
      '<div><span>QUALITY</span><b>'+state.model.quality.toFixed(3)+'</b></div>'+
      '<div><span>FRESHNESS</span><b>'+state.model.freshness.toFixed(3)+'</b></div>'+
      '<div><span>EXPLORATION</span><b>'+state.model.exploration.toFixed(3)+'</b></div>'+
      '<div class="console-footer"><span>'+Math.floor(s)+' local signals</span><span>'+state.movies.length+' indexed titles</span><span>'+(state.model.profile>0.28?"ADAPTIVE":"BASELINE")+"</span></div>";
  }

  async function loadTitleExtras(movie) {
    if (!movie || !localStorage.getItem(STORE.key)) return;
    const key=String(movie.id);
    if (state.detailCache[key]) { renderTitleExtras(movie,state.detailCache[key]); return; }

    const [providersResult,reviewsResult,videosResult]=await Promise.allSettled([
      tmdb("/movie/"+encodeURIComponent(movie.id)+"/watch/providers"),
      tmdb("/movie/"+encodeURIComponent(movie.id)+"/reviews",{language:"en-US",page:1}),
      tmdb("/movie/"+encodeURIComponent(movie.id)+"/videos",{language:"en-US"})
    ]);

    const providers=providersResult.status==="fulfilled"
      ? (providersResult.value?.results?.IN || {})
      : {};
    const reviews=reviewsResult.status==="fulfilled"
      ? (reviewsResult.value?.results || [])
      : [];
    const videos=videosResult.status==="fulfilled"
      ? (videosResult.value?.results || [])
      : [];

    const extra={providers,reviews,videos};
    state.detailCache[key]=extra;
    renderTitleExtras(movie,extra);
  }

  function renderTitleExtras(movie,extra) {
    const providerItems=[
      ...(extra.providers?.flatrate||[]),
      ...(extra.providers?.free||[]),
      ...(extra.providers?.ads||[])
    ];
    $("providerContent").innerHTML=providerItems.length
      ? '<div class="provider-list">'+uniq(providerItems,x=>x.provider_id).slice(0,6).map(p=>'<span class="provider-pill">'+esc(p.provider_name)+'</span>').join("")+'</div><small class="provider-credit">Provider availability by JustWatch via TMDB</small>'
      : '<span>No current India provider data returned.</span>';

    const reviews=extra.reviews||[];
    const avg=rating(movie);
    $("reviewContent").innerHTML=
      '<span class="review-score">★ '+esc(avg)+'</span>'+
      '<span class="review-note">'+esc(voteCount(movie))+' TMDB ratings · '+reviews.length+' review'+(reviews.length===1?"":"s")+'</span>'+
      (reviews[0]?.url ? '<a class="review-link" href="'+esc(reviews[0].url)+'" target="_blank" rel="noopener">Read review</a>' : '');

    const trailer=(extra.videos||[]).find(v=>v.site==="YouTube" && v.type==="Trailer" && v.official)
      || (extra.videos||[]).find(v=>v.site==="YouTube" && v.type==="Trailer")
      || (extra.videos||[]).find(v=>v.site==="YouTube");
    const trailerBtn=$("modalTrailer");
    if(trailerBtn){
      trailerBtn.textContent=trailer?"▶ Trailer":"▶ YouTube";
      trailerBtn.onclick=()=>{
        const url=trailer ? "https://www.youtube.com/watch?v="+encodeURIComponent(trailer.key)
          : "https://www.youtube.com/results?search_query="+encodeURIComponent(movie.title+" official trailer");
        window.open(url,"_blank","noopener");
        learn(movie,"play");
        sendBackendEvent(movie,"play",1.2).catch(()=>{});
      };
    }
  }

  function openMovie(movie, autoplay=false) {
    if (!movie) return;
    state.selected=movie;
    recordHistory(movie, autoplay?"play":"open");
    const modal=$("movieModal");
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
    setBackdrop($("modalMedia"), movie);
    $("modalKicker").textContent=(movie.live?"LIVE · ":"")+"MOVIE / "+String(movie.language||movie.original_language||"EN").toUpperCase();
    $("modalTitle").textContent=movie.title;
    $("modalMatch").textContent=(movie.match||Math.min(97,Math.round((quality(movie)*90)+20)))+"% AI MATCH";
    $("modalMeta").innerHTML='<span>★ '+esc(rating(movie))+'</span><span>'+esc(year(movie))+'</span><span>'+esc(genreLine(movie))+'</span><span>'+esc(movie.votes||movie.vote_count||0)+' votes</span>';
    $("modalOverview").textContent=movie.overview || "No overview available.";
    $("modalTags").innerHTML=(movie.tags||genres(movie)).slice(0,9).map(t=>'<span>'+esc(t)+'</span>').join("");
    $("whyBox").innerHTML='<strong>Why this title?</strong><p>'+esc(movie.reason||buildWhy(movie,null))+'</p>';
    $("providerContent").textContent=localStorage.getItem(STORE.key)?"Loading India providers…":"Connect TMDB to load regional providers.";
    $("reviewContent").textContent=localStorage.getItem(STORE.key)?"Loading review pulse…":"Connect TMDB to load review context.";
    $("modalList").onclick=()=>toggleList(movie);
    $("modalCritics").onclick=()=>{
      window.open("https://www.rottentomatoes.com/search?search="+encodeURIComponent(movie.title),"_blank","noopener");
    };
    $("modalRecommend").onclick=async()=>{
      const backendUsed=await loadBackendRecommendations(movie.id);
      if(!backendUsed) renderRail("aiRail",recommendFor(movie,14));
      recordHistory(movie,"similar");
      closeMovie();
      $("aiRail")?.scrollIntoView({behavior:"smooth",block:"center"});
      toast((backendUsed?"Python ML":"Local AI")+" similar titles generated");
    };
    $("modalTrailer").onclick=()=>{
      window.open("https://www.youtube.com/results?search_query="+encodeURIComponent(movie.title+" official trailer"),"_blank","noopener");
      learn(movie,"play");
    };
    updateListButtons(movie);
    loadTitleExtras(movie).catch(()=>{});
  }

  function closeMovie() { $("movieModal")?.classList.add("hidden"); document.body.classList.remove("modal-open"); }

  async function loadBackendRecommendations(seedMovieId=null) {
    const base=backendUrl();
    if(!base) return false;
    try{
      const query = seedMovieId ? "?seed_movie_id="+encodeURIComponent(seedMovieId)+"&limit=18" : "?limit=18";
      const data=await backendFetch("/api/recommend/"+encodeURIComponent(getUserId())+query);
      if(Array.isArray(data.results) && data.results.length){
        mergeMovies(data.results);
        const normalized=data.results.map(m=>({...m,live:false}));
        renderRail("aiRail",normalized);
        $("recommendationSubtitle").textContent="Python ML API · TF-IDF + KNN + hybrid collaborative ranking";
        $("modelPill").textContent="PYTHON ML · ONLINE";
        return true;
      }
    }catch{}
    return false;
  }

  async function sendBackendEvent(movie,eventType,value=1) {
    const base=backendUrl();
    if(!base || !movie) return;
    try{
      await backendFetch("/api/events",{
        method:"POST",
        body:JSON.stringify({user_id:getUserId(),movie_id:Number(movie.id),event_type:eventType,value})
      });
    }catch{}
  }

  async function refreshBackendStatus() {
    const base=backendUrl();
    const pill=$("modelPill");
    if(!base){ if(pill) pill.textContent=state.live?"HYBRID · LIVE":"HYBRID · LOCAL"; return; }
    try{
      const health=await backendFetch("/api/health");
      if(health.ml?.ready){
        if(pill) pill.textContent=health.mongodb?.connected?"PYTHON ML · SQL + MONGO":"PYTHON ML · SQL";
        $("engineText") && ($("engineText").textContent="Python ML API connected · "+health.ml.algorithm);
        return true;
      }
    }catch{}
    if(pill) pill.textContent="API OFFLINE · LOCAL";
    return false;
  }

  async function saveBackendConfig() {
    const input=$("backendUrl");
    const base=(input?.value||"").trim().replace(/\/$/,"");
    if(base) localStorage.setItem(BACKEND_STORE,base); else localStorage.removeItem(BACKEND_STORE);
    await refreshBackendStatus();
    await loadBackendRecommendations();
    toast(base?"Python ML API configured":"Python ML API disabled");
    if($("settingsStatus")) showSettingsStatus(base?"Backend URL saved. Testing API…":"Backend URL removed. Local ML remains active.");
  }

  function openSettings() {
    $("settingsModal")?.classList.remove("hidden"); document.body.classList.add("modal-open");
    const key=localStorage.getItem(STORE.key)||"";
    $("tmdbKey").value=key;
    showSettingsStatus(key ? "A browser-local credential is saved. Test the connection with Sync." : "Live mode is currently off.");
  }

  function closeSettings() { $("settingsModal")?.classList.add("hidden"); document.body.classList.remove("modal-open"); }

  function showSettingsStatus(message, good=false) {
    const n=$("settingsStatus"); if (!n) return;
    n.className="settings-status "+(good?"good":"");
    n.textContent=message;
  }

  async function tmdb(path, params={}) {
    const key=localStorage.getItem(STORE.key);
    if (!key) throw new Error("NO_KEY");
    const url=new URL(API_BASE+path);
    const all={language:"en-US",include_adult:"false",...params,api_key:key};
    Object.entries(all).forEach(([k,v])=>url.searchParams.set(k,String(v)));
    const res=await fetch(url,{headers:{accept:"application/json"},cache:"no-store"});
    if (!res.ok) throw new Error("TMDB_"+res.status);
    return res.json();
  }

  function normalizeTMDB(m, source="live") {
    if (!m?.id || !m.title) return null;
    const language=m.original_language||"en";
    const g=(m.genre_ids||[]).map(id=>GENRE_BY_ID[id]).filter(Boolean);
    return {
      id:m.id,title:m.title,year:m.release_date?String(m.release_date).slice(0,4):"—",
      release_date:m.release_date||"",genres:g.length?g:["Movie"],rating:Number(m.vote_average||0),
      votes:Number(m.vote_count||0),popularity:Number(m.popularity||0),language,
      original_language:language,overview:m.overview||"Live title from TMDB.",
      poster:m.poster_path||"",backdrop:m.backdrop_path||"",tags:g.map(x=>x.toLowerCase()),
      live:source==="live",accent:(m.id%2===0?"green":"red")
    };
  }

  async function syncLive(force=false) {
    const key=localStorage.getItem(STORE.key);
    if (!key) { toast("Connect TMDB first to use live catalog mode."); openSettings(); return false; }
    if (state.syncing) return false;
    if (!force && Date.now()-state.lastSync < 8*60*1000 && state.live) return true;
    state.syncing=true;
    setLiveLoading(true);
    try {
      const requests=[
        tmdb("/trending/movie/day"),
        tmdb("/movie/popular",{region:"IN",page:1}),
        tmdb("/movie/top_rated",{region:"IN",page:1}),
        tmdb("/movie/now_playing",{region:"IN",page:1}),
        tmdb("/movie/upcoming",{region:"IN",page:1}),
        tmdb("/discover/movie",{region:"IN",sort_by:"popularity.desc",with_origin_country:"IN",page:1})
      ];
      const results=await Promise.allSettled(requests);
      const pools={};
      results.forEach((result,i)=>{
        if(result.status==="fulfilled") pools[["trending","popular","rated","new","upcoming","india"][i]]=result.value.results||[];
      });
      const liveMovies=Object.values(pools).flat().map(m=>normalizeTMDB(m)).filter(Boolean);
      mergeMovies(liveMovies);
      const cache={time:Date.now(),pools};
      save(STORE.live,cache);
      state.cacheMeta=cache;
      state.lastSync=Date.now();
      state.live=liveMovies.length>0;
      state.liveCount=liveMovies.length;
      if (!liveMovies.length) throw new Error("NO_LIVE_RESULTS");
      showSettingsStatus("Connected — "+liveMovies.length+" live movie records loaded.",true);
      applyLivePools(pools);
      renderStats();
      toast("CINEPLAY synced with live TMDB data");
      return true;
    } catch (err) {
      state.live=false;
      state.liveCount=0;
      showSettingsStatus(err.message==="TMDB_401"?"Credential rejected by TMDB. Check your v3 API key.":"Live sync failed — curated catalog remains available.");
      renderStats();
      toast("Live sync failed; using local catalog");
      return false;
    } finally {
      state.syncing=false;
      setLiveLoading(false);
    }
  }

  function applyLivePools(pools) {
    const conv=name=>uniq((pools[name]||[]).map(m=>normalizeTMDB(m)).filter(Boolean),m=>m.id);
    const trending=conv("trending"), rated=conv("rated"), fresh=uniq([...conv("new"),...conv("upcoming")],m=>m.id);
    const india=conv("india");
    renderRail("trendingRail",trending.length?trending:topTrending(state.movies).slice(0,16));
    renderRail("ratedRail",rated.length?topByQuality(rated).slice(0,16):topByQuality(state.movies).slice(0,16));
    renderRail("newRail",fresh.length?fresh.slice(0,16):state.movies.slice(0,16));
    renderRail("indianRail",india.length?india.slice(0,16):state.movies.filter(m=>matchesFilter(m,"india")).slice(0,16));
    renderTop10();
    buildHero();
    applyFilter();
  }

  function restoreCachedLive() {
    const cached=state.cacheMeta;
    if(!cached?.time || !cached.pools) return;
    if(Date.now()-cached.time > 6*60*60*1000) return;
    const liveMovies=Object.values(cached.pools).flat().map(m=>normalizeTMDB(m)).filter(Boolean);
    if(!liveMovies.length) return;
    mergeMovies(liveMovies);
    state.live=true;
    state.liveCount=liveMovies.length;
    state.lastSync=cached.time;
    applyLivePools(cached.pools);
  }

  function setLiveLoading(on) {
    $("liveBtn")?.classList.toggle("loading",on);
    $("liveLabel") && ($("liveLabel").textContent=on?"SYNC":"LIVE");
  }

  async function performSearch(query, force=false) {
    const value=String(query||"").trim().toLowerCase();
    state.query=value;
    if (!value) { applyFilter(); $("searchPanel")?.classList.add("hidden"); return; }

    const moodTerms=value.split(/\s+/);
    const local=state.movies.filter(m=>
      movieText(m).toLowerCase().includes(value) ||
      moodTerms.some(t=>movieText(m).toLowerCase().includes(t))
    ).slice(0,20).map(m=>({...m,match:Math.round((genreAffinity(m)+quality(m))*50)}));

    if (force) {
      const semantic=state.movies.map(m=>({...m,score:searchScore(m,value)})).sort((a,b)=>b.score-a.score).slice(0,20);
      renderRail("aiRail",semantic);
      $("recommendationSubtitle").textContent="AI semantic search for “"+query+"”.";
    } else {
      renderRail("aiRail",local.length?local:recommendFor(null,18));
      $("recommendationSubtitle").textContent=local.length+" local matches · adaptive ranking active";
    }

    if (state.live && value.length>=2) {
      clearTimeout(state.searchTimer);
      state.searchTimer=setTimeout(async()=>{
        try {
          const data=await tmdb("/search/movie",{query:value,page:1});
          const results=(data.results||[]).map(m=>normalizeTMDB(m)).filter(Boolean);
          mergeMovies(results);
          const ranked=results.map(m=>({...m,match:Math.min(99,Math.max(70,Math.round(searchScore(m,value)*100)))}));
          renderSearchPanel(ranked.slice(0,7));
          if (force) renderRail("aiRail",ranked.length?ranked:local);
        } catch {}
      },280);
    }
  }

  function searchScore(movie, query) {
    const terms=tokenize(query);
    const text=movieText(movie).toLowerCase();
    let hits=0;
    terms.forEach(t=>{if(text.includes(t))hits++;});
    const exact=String(movie.title||"").toLowerCase()===query?1:0;
    const starts=String(movie.title||"").toLowerCase().startsWith(query)?1:0;
    return Math.min(0.99,(hits/Math.max(1,terms.length))*0.7 + starts*0.2 + exact*0.3 + quality(movie)*0.1);
  }

  function renderSearchPanel(items) {
    const panel=$("searchPanel");
    if (!panel) return;
    panel.innerHTML=items.length?items.map(m=>
      '<button class="search-result" type="button" data-result-id="'+esc(m.id)+'">'+
        '<div class="search-thumb">'+(poster(m,"w185")?'<img src="'+esc(poster(m,"w185"))+'" alt="">':"")+'</div>'+
        '<div><b>'+esc(m.title)+'</b><span>'+esc(year(m))+' · '+esc(genreLine(m))+'</span></div>'+
        '<em>'+Math.round((m.match||0))+'%</em>'+
      '</button>').join("") : '<div class="search-empty">No live match found. Try another title.</div>';
    panel.classList.remove("hidden");
    panel.querySelectorAll(".search-result").forEach(btn=>btn.onclick=()=>{openMovie(findMovie(btn.dataset.resultId));panel.classList.add("hidden");});
  }

  function openSearch() {
    const input=$("searchInput");
    if (input) { input.focus(); input.select(); }
    $("commandPalette")?.classList.add("hidden");
  }

  function openCommand() {
    const modal=$("commandPalette");
    if (!modal) return;
    modal.classList.remove("hidden");
    const input=$("commandInput"); input.value=""; input.focus(); renderCommand("");
  }

  function renderCommand(value) {
    const node=$("commandResults");
    if (!node) return;
    const commands=[
      ["Home","Go to the cinematic home","home"],
      ["Discover","Open recommendations and search","discover"],
      ["My List","Open saved movies","my-list"],
      ["Activity","Open your local profile","activity"]
    ];
    const q=String(value||"").toLowerCase();
    const movies=state.movies.filter(m=>m.title.toLowerCase().includes(q)).slice(0,6);
    node.innerHTML='<div class="command-group"><span>QUICK NAV</span>'+commands.filter(c=>!q||c[0].toLowerCase().includes(q)).map(c=>'<button type="button" data-section="'+c[2]+'"><b>'+esc(c[0])+'</b><em>'+esc(c[1])+'</em></button>').join("")+'</div>'+
      (movies.length?'<div class="command-group"><span>MOVIES</span>'+movies.map(m=>'<button type="button" data-command-movie="'+esc(m.id)+'"><b>'+esc(m.title)+'</b><em>'+esc(year(m))+'</em></button>').join("")+'</div>':"");
    node.querySelectorAll("[data-section]").forEach(btn=>btn.onclick=()=>{closeCommand();document.getElementById(btn.dataset.section)?.scrollIntoView({behavior:"smooth"});});
    node.querySelectorAll("[data-command-movie]").forEach(btn=>btn.onclick=()=>{closeCommand();openMovie(findMovie(btn.dataset.commandMovie));});
  }

  function closeCommand() { $("commandPalette")?.classList.add("hidden"); }

  function enhanceRails() {
    $(".rail").forEach(rail => {
      if (rail.parentElement?.classList.contains("rail-shell")) return;
      const shell=document.createElement("div");
      shell.className="rail-shell";
      rail.parentNode.insertBefore(shell,rail);
      shell.appendChild(rail);

      const prev=document.createElement("button");
      prev.className="rail-arrow rail-prev";
      prev.type="button";
      prev.setAttribute("aria-label","Scroll left");
      prev.textContent="‹";

      const next=document.createElement("button");
      next.className="rail-arrow rail-next";
      next.type="button";
      next.setAttribute("aria-label","Scroll right");
      next.textContent="›";

      shell.append(prev,next);
      const step=()=>Math.max(280,Math.floor(rail.clientWidth*.72));
      prev.onclick=()=>rail.scrollBy({left:-step(),behavior:"smooth"});
      next.onclick=()=>rail.scrollBy({left:step(),behavior:"smooth"});

      const refresh=()=>{
        const max=rail.scrollWidth-rail.clientWidth;
        const left=rail.scrollLeft;
        shell.classList.toggle("has-left",left>8);
        shell.classList.toggle("has-right",max-left>8);
        prev.disabled=left<=8;
        next.disabled=max-left<=8;
      };
      rail.addEventListener("scroll",refresh,{passive:true});
      new ResizeObserver(refresh).observe(rail);
      requestAnimationFrame(refresh);
    });
  }

  function revealSections() {
    const nodes=$(".section-block,.feature-band");
    if (!("IntersectionObserver" in window)) {
      nodes.forEach(n=>n.classList.add("is-visible"));
      return;
    }
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },{rootMargin:"0px 0px -10% 0px",threshold:.08});
    nodes.forEach(n=>observer.observe(n));
  }

  function setupMobileDrawer() {
    const drawer=$("mobileDrawer"), btn=$("mobileMenu");
    if(!drawer || !btn) return;
    const setOpen=open=>{
      drawer.classList.toggle("open",open);
      drawer.setAttribute("aria-hidden",String(!open));
      btn.classList.toggle("active",open);
      btn.setAttribute("aria-expanded",String(open));
    };
    btn.onclick=()=>setOpen(!drawer.classList.contains("open"));
    $("[data-close-drawer]").forEach(x=>x.onclick=()=>setOpen(false));
    $("[data-drawer-link]").forEach(x=>x.onclick=()=>setOpen(false));
    document.addEventListener("keydown",e=>{if(e.key==="Escape")setOpen(false);});
  }

  function setupPremiumScrollState() {
    const topbar=$(".topbar");
    if(!topbar) return;
    const update=()=>topbar.classList.toggle("scrolled",window.scrollY>24);
    window.addEventListener("scroll",update,{passive:true});
    update();
  }

  function initEvents() {
    $("searchInput").addEventListener("input",e=>performSearch(e.target.value,false));
    $("searchInput").addEventListener("focus",()=>{if(state.query)performSearch(state.query,false);});
    $("clearSearch").onclick=()=>{$("searchInput").value="";state.query="";$("searchPanel")?.classList.add("hidden");applyFilter();};
    $("searchTrigger").onclick=openSearch;
    $("liveBtn").onclick=openSettings;
    $("saveBackend").onclick=saveBackendConfig;
    $("profileBtn").onclick=()=>{renderLab();$("aiLabModal")?.classList.remove("hidden");document.body.classList.add("modal-open");};
    $("openAiLab").onclick=()=>{$("aiLabModal")?.classList.remove("hidden");document.body.classList.add("modal-open");renderLab();};
    $("shuffleAi").onclick=async()=>{ await loadBackendRecommendations(); const recs=recommendFor(null,18).sort(()=>Math.random()-0.5); renderRail("aiRail",recs); toast("AI queue refreshed"); };
    $("refreshTrending").onclick=()=>syncLive(true);
    $("refreshFresh").onclick=()=>syncLive(true);
    $("saveKey").onclick=async()=>{
      const key=$("tmdbKey").value.trim();
      if(!key){showSettingsStatus("Paste a TMDB v3 API key first.");return;}
      localStorage.setItem(STORE.key,key);
      showSettingsStatus("Testing credential…");
      const ok=await syncLive(true);
      if(ok) closeSettings();
    };
    $("removeKey").onclick=()=>{
      localStorage.removeItem(STORE.key);
      state.live=false; state.liveCount=0; state.cacheMeta={time:0,pools:{}};
      renderStats(); showSettingsStatus("Live credential removed. Local catalog is active.");
      applyFilter();
      toast("Live mode disabled");
    };
    $("clearList").onclick=()=>{localStorage.removeItem(STORE.list);renderList();notifyDataChanged();toast("My List cleared");};
    $("clearHistory").onclick=()=>{localStorage.removeItem(STORE.history);renderActivity();renderContinue();toast("Activity cleared");};
    $("clearContinue").onclick=()=>{localStorage.removeItem(STORE.history);renderContinue();renderActivity();toast("Continue trail cleared");};
    $("resetModel").onclick=()=>{
      state.signals={};state.taste={};state.model={content:.34,profile:.28,genre:.13,quality:.09,popularity:.06,freshness:.05,exploration:.05};
      [STORE.signals,STORE.taste,STORE.model,STORE.history].forEach(k=>localStorage.removeItem(k));
      renderLab();notifyDataChanged();applyFilter();toast("Local recommendation model reset");
    };

    $$("[data-close-modal]").forEach(x=>x.onclick=closeMovie);
    $$("[data-close-settings]").forEach(x=>x.onclick=closeSettings);
    $$("[data-close-ai-lab]").forEach(x=>x.onclick=()=>{$("aiLabModal")?.classList.add("hidden");document.body.classList.remove("modal-open");});
    $$("[data-close-command]").forEach(x=>x.onclick=closeCommand);

    $("commandInput").addEventListener("input",e=>renderCommand(e.target.value));
    $("searchInput").addEventListener("keydown",e=>{if(e.key==="Enter"){performSearch(e.target.value,true);$("searchPanel")?.classList.add("hidden");}});
    document.addEventListener("keydown",e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openCommand();}
      if(e.key==="Escape"){closeMovie();closeSettings();closeCommand();$("aiLabModal")?.classList.add("hidden");document.body.classList.remove("modal-open");}
    });

    $$(".filter-chip").forEach(btn=>btn.onclick=()=>{
      state.filter=btn.dataset.filter||"all";
      applyFilter();
      if(state.filter!=="all") toast("Showing "+btn.textContent+" titles");
    });

    $$(".main-nav a").forEach(a=>a.onclick=()=>{
      $$(".main-nav a").forEach(x=>x.classList.remove("active"));a.classList.add("active");
    });

    window.addEventListener("scroll",()=>{
      const h=document.documentElement.scrollHeight-window.innerHeight;
      const pct=h>0?(window.scrollY/h)*100:0;
      $("scrollProgress").style.width=pct+"%";
    },{passive:true});

    const hero=$(".hero");
    hero?.addEventListener("mousemove",e=>{
      const rect=hero.getBoundingClientRect();
      const x=(e.clientX-rect.left)/rect.width-.5, y=(e.clientY-rect.top)/rect.height-.5;
      $("heroMedia").style.transform="scale(1.035) translate3d("+(-x*14)+"px,"+(-y*10)+"px,0)";
    });
    hero?.addEventListener("mouseleave",()=>{$("heroMedia").style.transform="scale(1.02) translate3d(0,0,0)";});
  }

  function init() {
    renderStats();
    renderMoods();
    buildHero();
    renderTop10();
    renderRail("trendingRail",topTrending(state.movies).slice(0,16));
    renderRail("ratedRail",topByQuality(state.movies).slice(0,16));
    renderRail("newRail",state.movies.slice().sort((a,b)=>freshness(b)-freshness(a)).slice(0,16));
    renderRail("gemsRail",hiddenGems(state.movies));
    renderRail("indianRail",state.movies.filter(m=>matchesFilter(m,"india")).slice(0,16));
    renderRail("aiRail",recommendFor(null,18));
    renderList();
    renderContinue();
    renderActivity();
    renderPreferences();
    restartHeroTimer();
    enhanceRails();
    revealSections();
    setupMobileDrawer();
    setupPremiumScrollState();
    initEvents();
    restoreCachedLive();
    if (backendUrl()) loadBackendRecommendations();

    const key=localStorage.getItem(STORE.key);
    if (key && Date.now()-state.lastSync>8*60*1000) syncLive(false);
    refreshBackendStatus();
    setInterval(()=>{
      const liveKey=localStorage.getItem(STORE.key);
      if (liveKey && document.visibilityState==="visible") syncLive(false);
    },10*60*1000);
    document.addEventListener("visibilitychange",()=>{
      const liveKey=localStorage.getItem(STORE.key);
      if (document.visibilityState==="visible" && liveKey && Date.now()-state.lastSync>8*60*1000) syncLive(false);
    });
  }

  init();
})();