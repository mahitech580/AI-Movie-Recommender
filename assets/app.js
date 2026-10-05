(() => {
  "use strict";

  const TMDB_IMG = "https://image.tmdb.org/t/p/";
  const TMDB_KEY = "motion.tmdb.key";
  const STORAGE = {
    list: "motion.mylist",
    history: "motion.history",
    signals: "motion.signals"
  };

  const state = {
    movies: (window.MOVIES || []).slice(),
    heroIndex: 0,
    selected: null,
    filter: "all",
    query: "",
    aiQueue: [],
    signals: load(STORAGE.signals, {})
  };

  const $ = id => document.getElementById(id);
  const $$ = selector => Array.from(document.querySelectorAll(selector));

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch { return fallback; }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function titleYear(movie) {
    if (movie.year) return movie.year;
    return movie.release_date ? String(movie.release_date).slice(0,4) : "—";
  }

  function movieGenres(movie) {
    return (movie.genres || []).map(g => typeof g === "string" ? g : g.name).filter(Boolean);
  }

  function genreLine(movie) {
    return movieGenres(movie).join(" • ");
  }

  function poster(movie, size) {
    size = size || "w500";
    if (!movie || !movie.poster) return "";
    return movie.poster.startsWith("http") ? movie.poster : TMDB_IMG + size + movie.poster;
  }

  function backdrop(movie) {
    if (!movie || !movie.backdrop) return poster(movie, "w780");
    return movie.backdrop.startsWith("http") ? movie.backdrop : TMDB_IMG + "original" + movie.backdrop;
  }

  function rating(movie) {
    return Number(movie.rating || movie.vote_average || 0).toFixed(1);
  }

  function popularity(movie) {
    return Number(movie.popularity || 0);
  }

  function imageTag(movie, size) {
    const url = poster(movie, size);
    return url ? '<img src="' + esc(url) + '" alt="' + esc(movie.title) + '" loading="lazy" onerror="this.remove();this.parentElement.classList.add(\'broken-image\')">' : "";
  }

  function gradient(movie) {
    return movie && movie.accent === "green"
      ? "linear-gradient(140deg,rgba(16,101,71,.85),rgba(3,7,5,.98))"
      : "linear-gradient(140deg,rgba(127,21,34,.85),rgba(4,6,5,.98))";
  }

  function list() {
    return load(STORAGE.list, []);
  }

  function listed(movie) {
    return list().some(item => Number(item.id) === Number(movie.id));
  }

  function toast(message) {
    const node = $("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2400);
  }

  function findMovie(id) {
    return state.movies.find(m => Number(m.id) === Number(id));
  }

  function mergeMovies(extra) {
    const seen = new Set();
    state.movies = (extra.concat(window.MOVIES || [])).filter(m => {
      const key = String(m.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function record(movie, type) {
    if (!movie) return;
    const amount = type === "list" ? 3 : type === "recommend" ? 2 : 1;
    state.signals[movie.id] = (state.signals[movie.id] || 0) + amount;
    save(STORAGE.signals, state.signals);

    const history = load(STORAGE.history, []);
    history.unshift({
      id: movie.id,
      title: movie.title,
      year: titleYear(movie),
      time: new Date().toISOString(),
      type: type || "open"
    });
    const unique = [];
    const seen = new Set();
    for (const item of history) {
      if (!seen.has(String(item.id))) {
        seen.add(String(item.id));
        unique.push(item);
      }
    }
    save(STORAGE.history, unique.slice(0, 24));
    renderHistory();
  }

  function toggleList(movie) {
    const current = list();
    const exists = current.some(x => Number(x.id) === Number(movie.id));
    const next = exists
      ? current.filter(x => Number(x.id) !== Number(movie.id))
      : current.concat(movie);
    save(STORAGE.list, next);
    if (!exists) record(movie, "list");
    renderList();
    updateListButtons(movie);
    toast(exists ? "Removed " + movie.title : "Saved " + movie.title + " to My List");
  }

  function updateListButtons(movie) {
    const added = listed(movie);
    $$("[data-list-id]").forEach(button => {
      if (Number(button.dataset.listId) === Number(movie.id)) {
        button.textContent = added ? "✓" : "＋";
        button.classList.toggle("added", added);
      }
    });
    if ($("heroList")) $("heroList").classList.toggle("added", added);
    if ($("modalList")) {
      $("modalList").textContent = added ? "✓" : "＋";
      $("modalList").classList.toggle("added", added);
    }
  }

  function tokenize(text) {
    return String(text || "").toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 2 &&
        !["the","and","with","from","into","this","that","for","his","her","are","was","who","their","your","movie","film"].includes(word));
  }

  function termVector(text) {
    const map = {};
    tokenize(text).forEach(token => map[token] = (map[token] || 0) + 1);
    return map;
  }

  function cosine(a,b) {
    let dot = 0, aa = 0, bb = 0;
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    keys.forEach(key => {
      const x = a[key] || 0, y = b[key] || 0;
      dot += x * y;
      aa += x * x;
      bb += y * y;
    });
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
  }

  function movieText(movie) {
    return [
      movie.title,
      genreLine(movie),
      (movie.tags || []).join(" "),
      movie.overview
    ].join(" ");
  }

  function recommend(source, limit) {
    limit = limit || 12;
    if (!source) return [];

    const sourceGenres = new Set(movieGenres(source).map(g => g.toLowerCase()));
    const sourceVector = termVector(movieText(source));

    return state.movies
      .filter(movie => Number(movie.id) !== Number(source.id))
      .map(movie => {
        const genres = movieGenres(movie);
        const overlap = genres.filter(g => sourceGenres.has(g.toLowerCase())).length;
        const content = cosine(sourceVector, termVector(movieText(movie)));
        const genreBoost = Math.min(.22, overlap * .075);
        const ratingBoost = Math.min(1, Number(movie.rating || 0) / 10) * .18;
        const localBoost = Math.min(.12, Number(state.signals[movie.id] || 0) * .014);
        const score = content * .62 + genreBoost + ratingBoost + localBoost;
        return Object.assign({}, movie, {
          similarity: score,
          match: Math.round(Math.min(99, score * 100)),
          reasons: overlap ? overlap + " shared genre" + (overlap > 1 ? "s" : "") : "similar tone"
        });
      })
      .sort((a,b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  function card(movie, rank) {
    const rankMarkup = rank ? '<span class="rank">#' + rank + "</span>" : "";
    const matchMarkup = movie.match ? '<span class="match">' + movie.match + "%</span>" : "";
    const add = listed(movie) ? "✓" : "＋";
    return [
      '<article class="movie-card" tabindex="0" data-movie-id="', esc(movie.id), '">',
        '<div class="poster" style="background:', gradient(movie), '">',
          imageTag(movie, "w500"),
          '<div class="poster-shade"></div>',
          rankMarkup,
          matchMarkup,
          '<button class="mini-list ', listed(movie) ? "added" : "", '" data-list-id="', esc(movie.id), '">', add, "</button>",
          '<div class="card-hover"><button class="play-circle" data-open="', esc(movie.id), '">▶</button><span>', esc(genreLine(movie)), "</span></div>",
        "</div>",
        '<div class="movie-caption"><h3>', esc(movie.title), '</h3><div><span>', esc(titleYear(movie)), '</span><i>•</i><span>★ ', esc(rating(movie)), "</span></div></div>",
      "</article>"
    ].join("");
  }

  function renderRail(id, movies, ranked) {
    const node = $(id);
    if (!node) return;
    node.innerHTML = movies.length
      ? movies.map((movie, index) => card(movie, ranked ? index + 1 : null)).join("")
      : '<div class="rail-empty">No titles available in this shelf.</div>';
    bindRail(node);
  }

  function bindRail(scope) {
    scope.querySelectorAll(".movie-card").forEach(cardNode => {
      const open = () => openMovie(findMovie(cardNode.dataset.movieId));
      cardNode.onclick = event => {
        if (!event.target.closest(".mini-list")) open();
      };
      cardNode.onkeydown = event => {
        if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button")) {
          event.preventDefault();
          open();
        }
      };
    });
    scope.querySelectorAll(".mini-list").forEach(button => {
      button.onclick = event => {
        event.stopPropagation();
        const movie = findMovie(button.dataset.listId);
        if (movie) toggleList(movie);
      };
    });
  }

  function setHero(movie) {
    if (!movie) return;
    $("heroMedia").style.backgroundImage = 'url("' + backdrop(movie) + '")';
    $("heroTitle").textContent = movie.title;
    $("heroOverview").textContent = movie.overview;
    $("heroMeta").innerHTML = [
      "<span>★ ", esc(rating(movie)), "</span>",
      "<span>", esc(titleYear(movie)), "</span>",
      "<span>", esc(genreLine(movie)), "</span>",
      movie.language ? "<span>" + esc(movie.language.toUpperCase()) + "</span>" : ""
    ].join("");
    $("heroTags").innerHTML = movieGenres(movie).map(g => "<span>" + esc(g) + "</span>").join("") +
      '<span>' + Math.round(popularity(movie)) + " popularity</span>";
    $("heroRecommend").onclick = () => {
      state.selected = movie;
      record(movie, "recommend");
      state.aiQueue = recommend(movie, 12);
      $("recommendationSubtitle").textContent = "Because you explored " + movie.title + ".";
      renderRail("aiRail", state.aiQueue, true);
      document.getElementById("recommendationSection").scrollIntoView({behavior:"smooth"});
      toast("AI queue generated from " + movie.title);
    };
    $("heroDetails").onclick = () => openMovie(movie);
    $("heroList").onclick = () => toggleList(movie);
    $("heroList").classList.toggle("added", listed(movie));
  }

  function heroDots() {
    $("heroDots").innerHTML = state.movies.slice(0,5).map((movie,index) =>
      '<button class="' + (index === state.heroIndex ? "active" : "") + '" data-hero="' + index + '"></button>'
    ).join("");
    $$("[data-hero]").forEach(dot => dot.onclick = () => {
      state.heroIndex = Number(dot.dataset.hero);
      setHero(state.movies[state.heroIndex]);
      heroDots();
    });
  }

  function nextHero() {
    if (!state.movies.length) return;
    state.heroIndex = (state.heroIndex + 1) % Math.min(5, state.movies.length);
    setHero(state.movies[state.heroIndex]);
    heroDots();
  }

  function renderMoodGrid() {
    const moods = [
      ["Mind-bending","◉","Loops, simulations & reality shifts",["Sci-Fi","Thriller"],"green"],
      ["Adrenaline","↯","High stakes, missions & heroes",["Action","Adventure"],"red"],
      ["Deep drama","◌","Human stories with lasting weight",["Drama"],"green"],
      ["Dark nights","☾","Secrets, fear and strange worlds",["Horror","Mystery"],"red"],
      ["Feel good","✦","Warm, funny and easy to replay",["Comedy","Romance"],"green"],
      ["Animated worlds","✺","Big imagination for any age",["Animation","Fantasy"],"red"]
    ];
    $("moodGrid").innerHTML = moods.map(mood =>
      '<button class="mood-card ' + mood[4] + '" data-mood="' + esc(mood[0]) + '"><span class="mood-icon">' + mood[1] +
      '</span><span><strong>' + esc(mood[0]) + '</strong><small>' + esc(mood[2]) +
      '</small></span><b>→</b></button>'
    ).join("");
    $$("#moodGrid .mood-card").forEach(button => button.onclick = () => {
      const mood = moods.find(item => item[0] === button.dataset.mood);
      const filtered = state.movies.filter(movie => mood[3].some(g => movieGenres(movie).includes(g))).slice(0,12);
      $("recommendationSubtitle").textContent = mood[0] + " — " + filtered.length + " titles in the current catalog.";
      renderRail("aiRail", filtered, false);
      document.getElementById("recommendationSection").scrollIntoView({behavior:"smooth"});
    });
  }

  function renderHome() {
    const rated = state.movies.slice().sort((a,b) =>
      ((b.rating || 0) * 1.2 + popularity(b) / 100) -
      ((a.rating || 0) * 1.2 + popularity(a) / 100)
    ).slice(0,14);

    const fresh = state.movies.slice().sort((a,b) =>
      Number(titleYear(b)) - Number(titleYear(a)) || popularity(b) - popularity(a)
    ).slice(0,14);

    const trend = state.movies.slice().sort((a,b) => popularity(b) - popularity(a)).slice(0,14);

    renderRail("trendingRail", trend, false);
    renderRail("ratedRail", rated, false);
    renderRail("newRail", fresh, false);
    renderRail("indianRail", state.movies.filter(m => ["hi","te","ta","ml","kn","mr","bn","pa"].includes(String(m.language).toLowerCase())).slice(0,12), false);
    renderMoodGrid();

    state.aiQueue = recommend(state.selected || state.movies[0], 12);
    renderRail("aiRail", state.aiQueue, true);

    if (state.movies[0]) setHero(state.movies[0]);
    heroDots();
  }

  function renderList() {
    const items = list();
    renderRail("listRail", items, false);
    $("listEmpty").classList.toggle("hidden", items.length > 0);
  }

  function renderHistory() {
    const items = load(STORAGE.history, []);
    $("historyEmpty").classList.toggle("hidden", items.length > 0);
    $("historyList").innerHTML = items.map(item => {
      const movie = findMovie(item.id) || item;
      return [
        '<button class="history-row" data-history-id="', esc(item.id), '">',
          '<span class="history-poster" style="background:', gradient(movie), '">', imageTag(movie,"w185"), "</span>",
          '<span class="history-copy"><b>', esc(item.title), '</b><small>', esc(item.year), " · ", esc(item.type), " · ",
          esc(new Date(item.time).toLocaleString([], {month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})), "</small></span>",
          '<span class="history-arrow">→</span>',
        "</button>"
      ].join("");
    }).join("");
    $$("#historyList .history-row").forEach(row => row.onclick = () => openMovie(findMovie(row.dataset.historyId)));
  }

  function openMovie(movie) {
    if (!movie) return;
    state.selected = movie;
    record(movie, "open");
    $("modalMedia").style.backgroundImage = 'url("' + backdrop(movie) + '")';
    $("modalKicker").innerHTML = [
      "<span>", esc(titleYear(movie)), "</span>",
      "<span>AI ID ", esc(movie.id), "</span>",
      movie.language ? "<span>" + esc(movie.language.toUpperCase()) + "</span>" : ""
    ].join("");
    $("modalTitle").textContent = movie.title;
    $("modalMeta").innerHTML = "<span>★ " + esc(rating(movie)) + "</span><span>" + esc(genreLine(movie)) +
      "</span><span>" + Number(movie.votes || 0).toLocaleString() + " ratings</span>";
    $("modalOverview").textContent = movie.overview;
    $("modalTags").innerHTML = (movie.tags || []).slice(0,8).map(tag => "<span>" + esc(tag) + "</span>").join("");

    const nearby = recommend(movie, 3);
    $("whyBox").innerHTML = "<strong>AI CONTEXT</strong><p>This title connects to your current taste graph. Nearby picks: <b>" +
      esc(nearby.map(item => item.title + " · " + item.match + "%").join(" • ")) + "</b>.</p>";

    $("modalRecommend").onclick = () => {
      state.aiQueue = recommend(movie, 12);
      $("recommendationSubtitle").textContent = "Because you explored " + movie.title + ".";
      renderRail("aiRail", state.aiQueue, true);
      closeMovie();
      document.getElementById("recommendationSection").scrollIntoView({behavior:"smooth"});
      toast("Similar titles are ready.");
    };

    $("modalTrailer").onclick = () => {
      window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(movie.title + " official trailer"), "_blank", "noopener,noreferrer");
    };

    $("modalList").onclick = () => toggleList(movie);
    updateListButtons(movie);

    $("movieModal").classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeMovie() {
    $("movieModal").classList.add("hidden");
    document.body.classList.remove("modal-open");
  }

  const genreMap = {
    28:"Action",12:"Adventure",16:"Animation",35:"Comedy",80:"Crime",99:"Documentary",
    18:"Drama",10751:"Family",14:"Fantasy",36:"History",27:"Horror",10402:"Music",
    9648:"Mystery",10749:"Romance",878:"Sci-Fi",53:"Thriller",10752:"War",37:"Western"
  };

  function normalizeLive(movie) {
    return {
      id: movie.id,
      title: movie.title || movie.original_title || "Untitled",
      year: titleYear(movie),
      genres: movie.genres || (movie.genre_ids || []).map(id => genreMap[id]).filter(Boolean),
      rating: Number(movie.vote_average || 0),
      votes: Number(movie.vote_count || 0),
      popularity: Number(movie.popularity || 0),
      language: movie.original_language || "",
      overview: movie.overview || "No synopsis available.",
      tags: [],
      poster: movie.poster_path || "",
      backdrop: movie.backdrop_path || movie.poster_path || "",
      accent: "red"
    };
  }

  async function tmdb(path, params) {
    const key = localStorage.getItem(TMDB_KEY);
    if (!key) throw new Error("TMDB key missing");
    const query = new URLSearchParams(Object.assign({}, params || {}, {api_key:key,language:"en-US"}));
    const response = await fetch("https://api.themoviedb.org/3" + path + "?" + query.toString());
    if (!response.ok) throw new Error("TMDB " + response.status);
    return response.json();
  }

  async function syncLive() {
    if (!localStorage.getItem(TMDB_KEY)) return false;
    const data = await tmdb("/trending/movie/week");
    const live = (data.results || []).map(normalizeLive).filter(movie => movie.poster);
    if (!live.length) return false;

    mergeMovies(live);
    state.live = true;
    $("sourceLabel").textContent = "TMDB LIVE + CURATED";
    $("liveBtn").classList.add("live");
    $("engineText").textContent = "Live TMDB signal synced " + new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    renderHome();
    return true;
  }

  async function searchLive(query) {
    const data = await tmdb("/search/movie",{query:query,include_adult:"false"});
    return (data.results || []).map(normalizeLive).filter(movie => movie.poster);
  }

  async function searchMovies(query) {
    state.query = query;
    const local = state.movies.filter(movie => movieText(movie).toLowerCase().includes(query.toLowerCase())).slice(0,8);
    if (query.length < 2) {
      $("searchPanel").classList.add("hidden");
      applyFilter();
      return;
    }
    $("searchPanel").classList.remove("hidden");
    renderSearchResults(local, false);
    if (localStorage.getItem(TMDB_KEY)) {
      try {
        const live = await searchLive(query);
        const map = new Map();
        live.concat(local).forEach(movie => map.set(String(movie.id), movie));
        const merged = Array.from(map.values()).slice(0,10);
        mergeMovies(merged);
        renderSearchResults(merged, true);
      } catch {}
    }
    applyFilter();
  }

  function renderSearchResults(items, live) {
    $("searchPanel").innerHTML = items.length ? items.map(movie => [
      '<button class="search-result" data-search-id="', esc(movie.id), '">',
      '<span class="search-thumb" style="background:', gradient(movie), '">', imageTag(movie,"w185"), "</span>",
      "<span><b>", esc(movie.title), "</b><small>", esc(titleYear(movie)), " · ", esc(genreLine(movie)), "</small></span>",
      "<em>", live ? "LIVE" : "AI", "</em></button>"
    ].join("")).join("") : '<div class="search-empty">No titles found.</div>';

    $$("#searchPanel .search-result").forEach(button => button.onclick = () => {
      const movie = findMovie(button.dataset.searchId);
      $("searchPanel").classList.add("hidden");
      $("searchInput").value = movie ? movie.title : "";
      if (movie) openMovie(movie);
    });
  }

  function applyFilter() {
    let items = state.movies.slice();
    if (state.filter !== "all") {
      items = items.filter(movie => movieGenres(movie).some(g => g.toLowerCase().includes(state.filter)));
    }
    if (state.query) {
      items = items.filter(movie => movieText(movie).toLowerCase().includes(state.query.toLowerCase()));
    }
    renderRail("trendingRail", items.slice(0,14), false);
  }

  function setupSearch() {
    let timer;
    $("searchInput").addEventListener("input", event => {
      const query = event.target.value.trim();
      $("clearSearch").classList.toggle("visible", !!query);
      clearTimeout(timer);
      timer = setTimeout(() => searchMovies(query), 130);
    });

    $("clearSearch").onclick = () => {
      $("searchInput").value = "";
      $("clearSearch").classList.remove("visible");
      $("searchPanel").classList.add("hidden");
      state.query = "";
      applyFilter();
    };

    $$("[data-filter]").forEach(chip => chip.onclick = () => {
      $$("[data-filter]").forEach(item => item.classList.remove("active"));
      chip.classList.add("active");
      state.filter = chip.dataset.filter;
      applyFilter();
    });
  }

  function setupSettings() {
    if (localStorage.getItem(TMDB_KEY)) $("tmdbKey").value = localStorage.getItem(TMDB_KEY);
    settingsStatus();

    $("liveBtn").onclick = () => $("settingsModal").classList.remove("hidden");
    $("profileBtn").onclick = () => $("settingsModal").classList.remove("hidden");

    $("saveKey").onclick = async () => {
      const key = $("tmdbKey").value.trim();
      if (!key) { toast("Paste a TMDB API key first."); return; }
      localStorage.setItem(TMDB_KEY,key);
      try {
        await syncLive();
        $("settingsModal").classList.add("hidden");
        toast("TMDB live mode is on.");
      } catch {
        toast("Key saved, but TMDB did not accept the request.");
      }
      settingsStatus();
    };

    $("removeKey").onclick = () => {
      localStorage.removeItem(TMDB_KEY);
      $("liveBtn").classList.remove("live");
      $("sourceLabel").textContent = "CURATED CATALOG";
      settingsStatus();
      toast("Live key removed.");
    };

    $$("[data-close-settings]").forEach(node => node.onclick = () => $("settingsModal").classList.add("hidden"));
  }

  function settingsStatus() {
    const active = !!localStorage.getItem(TMDB_KEY);
    $("settingsStatus").innerHTML = active
      ? '<span class="ok">● Live key stored in this browser.</span>'
      : '<span>○ Static mode. Connect TMDB for live trending and search.</span>';
  }

  function setupModals() {
    $$("[data-close-modal]").forEach(node => node.onclick = closeMovie);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeMovie();
        $("settingsModal").classList.add("hidden");
        $("commandPalette").classList.add("hidden");
      }
    });
  }

  function commandPalette() {
    const palette = $("commandPalette");
    const input = $("commandInput");
    function render(query) {
      const q = query.toLowerCase().trim();
      const jumps = [
        ["Home","#home"],["Discover","#discover"],["Genres","#genres"],["My List","#my-list"],["History","#history"]
      ].filter(item => !q || item[0].toLowerCase().includes(q));
      const movies = state.movies.filter(movie => !q || movieText(movie).toLowerCase().includes(q)).slice(0,6);
      $("commandResults").innerHTML =
        '<div class="command-group"><span>JUMP</span>' +
        jumps.map(item => '<button data-command="' + item[1] + '"><b>' + esc(item[0]) + '</b><em>↵</em></button>').join("") +
        '</div><div class="command-group"><span>MOVIES</span>' +
        movies.map(movie => '<button data-command="' + esc(movie.id) + '"><b>' + esc(movie.title) + '</b><em>↵</em></button>').join("") +
        "</div>";
      $$("#commandResults [data-command]").forEach(button => button.onclick = () => {
        const target = button.dataset.command;
        palette.classList.add("hidden");
        if (target.startsWith("#")) document.querySelector(target).scrollIntoView({behavior:"smooth"});
        else openMovie(findMovie(target));
      });
    }
    function open() { palette.classList.remove("hidden"); input.focus(); render(input.value); }
    window.openCommand = open;
    input.addEventListener("input", () => render(input.value));
    $$("[data-close-command]").forEach(node => node.onclick = () => palette.classList.add("hidden"));
    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
    });
  }

  function navState() {
    window.addEventListener("scroll", () => {
      const position = scrollY + 180;
      let active = "home";
      ["home","discover","genres","my-list","history"].forEach(id => {
        const node = $(id);
        if (node && node.offsetTop <= position) active = id;
      });
      $$("[data-nav]").forEach(link => link.classList.toggle("active", link.dataset.nav === active));
    }, {passive:true});
  }

  function setupActions() {
    $("shuffleAi").onclick = () => {
      state.aiQueue = state.aiQueue.slice().sort(() => Math.random() - .5);
      renderRail("aiRail",state.aiQueue,true);
      toast("AI queue reshuffled.");
    };

    $("refreshTrending").onclick = async () => {
      if (!localStorage.getItem(TMDB_KEY)) {
        $("settingsModal").classList.remove("hidden");
        toast("Connect TMDB for live refresh.");
        return;
      }
      $("refreshTrending").classList.add("loading");
      try { await syncLive(); toast("Trending feed refreshed."); }
      catch { toast("Live refresh failed."); }
      $("refreshTrending").classList.remove("loading");
    };

    $("clearList").onclick = () => {
      save(STORAGE.list,[]);
      renderList();
      toast("My List cleared.");
    };

    $("clearHistory").onclick = () => {
      save(STORAGE.history,[]);
      renderHistory();
      toast("History cleared.");
    };
  }

  function init() {
    navState();
    setupSearch();
    setupSettings();
    setupModals();
    commandPalette();
    setupActions();
    renderHome();
    renderList();
    renderHistory();

    let heroTimer = setInterval(nextHero, 9000);
    $("home").addEventListener("mouseenter",() => clearInterval(heroTimer));
    $("home").addEventListener("mouseleave",() => heroTimer = setInterval(nextHero,9000));

    if (localStorage.getItem(TMDB_KEY)) syncLive().catch(settingsStatus);
  }

  init();
})();