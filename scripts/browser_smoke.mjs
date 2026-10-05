import { chromium } from "playwright";

const base = process.env.CINEPLAY_URL || "http://127.0.0.1:4173/";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function testDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", err => errors.push("pageerror: " + err.message));
  page.on("console", msg => {
    if (msg.type() === "error" && !/Failed to load resource: the server responded with a status of 404 \(\)/i.test(msg.text())) {
      errors.push("console: " + msg.text());
    }
  });
  page.on("response", response => {
    if (response.status() < 400) return;
    const type=response.request().resourceType();
    if (type !== "image") errors.push("resource "+response.status()+": "+response.url());
  });

  await page.goto(base, { waitUntil: "domcontentloaded" });
  await sleep(900);

  const loaderDone = await page.locator("#cinemaLoader").evaluate(el => el.classList.contains("is-done"));
  const heroTitle = (await page.locator("#heroTitle").textContent()).trim();
  const cards = await page.locator(".movie-card").count();

  if (!loaderDone) throw new Error("cinematic loader did not release");
  if (!heroTitle) throw new Error("hero title did not initialize");
  if (cards < 10) throw new Error("movie rails rendered fewer than 10 cards");

  // Requested Home spotlight: Spider-Man must lead the hero and the curated spotlight
  // must contain exactly the nine requested titles.
  const heroFirst = (await page.locator("#heroTitle").textContent()).trim();
  if (heroFirst !== "Spider-Man: No Way Home") throw new Error("Home hero did not start with Spider-Man: No Way Home");
  const spotlightExpected = ["Spider-Man: No Way Home","Iron Man","Avengers: Age of Ultron","Avengers: Endgame","Black Panther","Avengers: Doomsday","Pushpa: The Rise","Interstellar","Project Hail Mary"];
  const spotlightTitles = await page.locator("#homeSpotlightRail .movie-card h3").allTextContents();
  for (const title of spotlightExpected) {
    if (!spotlightTitles.some(t => t.trim() === title)) {
      throw new Error("Home spotlight missing "+title);
    }
  }
  await page.locator("#homeSpotlightRail .movie-card img").evaluateAll(imgs => imgs.forEach(img => { img.loading="eager"; img.scrollIntoView({block:"center"}); }));
  await page.waitForFunction(() => Array.from(document.querySelectorAll("#homeSpotlightRail .movie-card img")).every(img => img.complete), null, {timeout:15000});
  const spotlightImages = await page.locator("#homeSpotlightRail .movie-card img").evaluateAll(imgs =>
    imgs.filter(img => (img.getAttribute("src") || "") && (img.naturalWidth || 0) > 20).length
  );
  if (spotlightImages !== spotlightExpected.length) throw new Error("Home spotlight has "+(spotlightExpected.length-spotlightImages)+" broken poster images");
  const spotlightHighRes = await page.locator("#homeSpotlightRail .movie-card img").evaluateAll(imgs =>
    imgs.filter(img => /^https:\/\/image\.tmdb\.org\/t\/p\/(original|w780)\//.test(img.getAttribute("src") || "") && (img.naturalWidth || 0) > 20).length
  );
  if (spotlightHighRes !== spotlightExpected.length) throw new Error("Home spotlight has "+(spotlightExpected.length-spotlightHighRes)+" missing high-resolution TMDB images");
  const spotlightLayout = await page.locator("#homeSpotlightRail").evaluate(el => {
    const style = getComputedStyle(el);
    const cards = Array.from(el.querySelectorAll(".movie-card"));
    const rail = el.getBoundingClientRect();
    const cardRects = cards.map(c => c.getBoundingClientRect());
    return {
      display: style.display,
      columns: style.gridTemplateColumns.split(" ").filter(Boolean).length,
      railWidth: rail.width,
      cardsWidth: cardRects.reduce((sum,r)=>sum+r.width,0),
      minLeft: Math.min(...cardRects.map(r=>r.left)),
      maxRight: Math.max(...cardRects.map(r=>r.right))
    };
  });
  if (spotlightLayout.display !== "grid" || spotlightLayout.columns !== 9) throw new Error("CINEPLAY Spotlight is not a complete 9-card desktop grid");
  if (spotlightLayout.minLeft < 0 || spotlightLayout.maxRight > spotlightLayout.railWidth + 1) throw new Error("CINEPLAY Spotlight cards overflow the full-width spotlight rail");
  const ageCard = page.locator("#homeSpotlightRail .movie-card").filter({hasText:"Avengers: Age of Ultron"}).first();
  const ageSrc = await ageCard.locator("img").getAttribute("src");
  const ageWidth = await ageCard.locator("img").evaluate(img => img.naturalWidth || 0);
  if (!ageSrc?.includes("4ssDuvEDkSArWEdyBl2X5EHvYKU")) throw new Error("Avengers: Age of Ultron spotlight poster path is incorrect");
  if (ageWidth < 20) throw new Error("Avengers: Age of Ultron spotlight poster did not decode");



  await page.locator(".movie-card").first().click();
  await page.locator("#movieModal:not(.hidden)").waitFor({ state: "visible", timeout: 1500 });
  await page.locator("#movieModal .modal-close").click();
  await page.locator("#movieModal.hidden").waitFor({ state: "attached", timeout: 1000 });

  const firstListButton = page.locator(".movie-card .mini-list").first();
  await firstListButton.click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("cineplay.mylist") || "[]").length);
  if (saved < 1) throw new Error("My List interaction did not persist");

  // Complete filter regression: every visible discovery chip must return
  // actual catalogue results, not merely change the active chip.
  const filterButtons = page.locator("#filterRow .filter-chip");
  const filterCount = await filterButtons.count();
  if (filterCount < 25) throw new Error("discovery filter set rendered too few filters");

  for (let i = 0; i < filterCount; i++) {
    const button = filterButtons.nth(i);
    const key = await button.getAttribute("data-filter");
    await button.click();
    await page.locator("#filterResultsGrid").waitFor({ state: "visible", timeout: 1500 });
    await sleep(80);
    const countText = (await page.locator("#filterResultsCount").textContent())?.trim() || "0";
    const total = Number.parseInt(countText, 10);
    const resultCards = await page.locator("#filterResultsGrid .movie-card").count();
    if (!Number.isFinite(total) || total < 1) {
      throw new Error("filter "+key+" returned zero catalogue results");
    }
    if (resultCards < 1) {
      throw new Error("filter "+key+" rendered no movie cards");
    }
  }

  // Telugu/TFI: all 50+ titles must be present and the images must actually decode.
  await page.locator('#filterRow .filter-chip[data-filter="telugu"]').click();
  await sleep(160);
  const teluguTotal = Number.parseInt((await page.locator("#filterResultsCount").textContent()) || "0", 10);
  if (teluguTotal < 50) throw new Error("Telugu/TFI catalogue count is unexpectedly low");
  const firstBatch = await page.locator("#filterResultsGrid .movie-card").count();
  if (firstBatch < 24) throw new Error("Telugu filter first page rendered too few movies");
  await page.locator("#filterResultsGrid img").evaluateAll(imgs => imgs.forEach(img => { img.loading="eager"; img.scrollIntoView({block:"center"}); }));
  await page.waitForFunction(() => Array.from(document.querySelectorAll("#filterResultsGrid img")).every(img => img.complete), null, {timeout:15000});
  const teluguUsableImages = await page.locator("#filterResultsGrid img").evaluateAll(imgs =>
    imgs.filter(img => {
      const src=img.getAttribute("src") || "";
      return (img.naturalWidth || 0) > 20 || src.startsWith("data:image/svg+xml");
    }).length
  );
  if (teluguUsableImages < Math.min(24, firstBatch)) throw new Error("Telugu filter contains images without a usable render or fallback");

  const rrr=page.locator('#filterResultsGrid .movie-card').filter({hasText:"RRR"}).first();
  await rrr.scrollIntoViewIfNeeded();
  const rrrImage=rrr.locator("img").first();
  const rrrSource=await rrrImage.getAttribute("src");
  const rrrWidth=await rrrImage.evaluate(img => img.naturalWidth || 0);
  if (!rrrSource || rrrSource.startsWith("data:image/svg+xml") || rrrWidth < 20) {
    throw new Error("RRR poster did not render as a real image");
  }
  if (teluguTotal > firstBatch) {
    await page.locator("#filterShowMore").click();
    await sleep(120);
    const secondBatch = await page.locator("#filterResultsGrid .movie-card").count();
    if (secondBatch <= firstBatch) throw new Error("filter Show more did not reveal additional Telugu titles");
  }

  // India filter: load every page and verify every Indian movie has usable artwork.
  await page.locator('#filterRow .filter-chip[data-filter="india"]').click();
  await sleep(160);
  const expectedIndiaTotal = await page.evaluate(() => {
    const languages = new Set(["hi","te","ta","ml","kn","bn","mr","pa","gu","as","or","ur"]);
    return Array.from(window.MOVIES || []).filter(movie => {
      const lang=String(movie?.language || movie?.original_language || "").toLowerCase();
      return String(movie?.country || "").toUpperCase()==="IN" ||
        Boolean(movie?.industry) ||
        languages.has(lang) ||
        /india|bollywood|tollywood|tfi|kollywood|mollywood|sandalwood|marathi|punjabi|bengali/i.test(
          String(movie?.title || "")+" "+String(movie?.industry || "")+" "+String(movie?.overview || "")
        );
    }).length;
  });
  const indiaTotal = Number.parseInt((await page.locator("#filterResultsCount").textContent()) || "0", 10);
  if (indiaTotal !== expectedIndiaTotal) throw new Error("India catalogue count mismatch: UI "+indiaTotal+" vs catalog "+expectedIndiaTotal);
  let safety=0;
  while(await page.locator("#filterShowMore").isEnabled() && safety<10){
    await page.locator("#filterShowMore").click();
    await sleep(100);
    safety++;
  }
  const indiaCards = await page.locator("#filterResultsGrid .movie-card").count();
  if (indiaCards !== indiaTotal) throw new Error("India filter did not load its complete catalogue");
  await page.locator("#filterResultsGrid img").evaluateAll(imgs => {
    imgs.forEach(img => {
      img.loading = "eager";
      img.scrollIntoView({block:"center"});
    });
  });
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("#filterResultsGrid img")).every(img => img.complete),
    null, {timeout:20000}
  );
  const brokenIndia = await page.locator("#filterResultsGrid img").evaluateAll(imgs =>
    imgs.filter(img => {
      const src=img.getAttribute("src") || "";
      const fallback=src.startsWith("data:image/svg+xml");
      return !src || (!fallback && (img.naturalWidth || 0) < 20);
    }).length
  );
  if (brokenIndia > 0) throw new Error("India catalogue has "+brokenIndia+" images without a usable render or fallback after eager load");

  // Search trigger must actually focus the search field and route to Discover.
  await page.locator("#searchTrigger").click();
  await sleep(350);
  if (await page.locator("#searchInput").evaluate(el => document.activeElement !== el)) {
    throw new Error("Search button did not focus search input");
  }
  const discoverVisible = await page.locator("#discover").evaluate(el => {
    const r=el.getBoundingClientRect();
    return r.bottom>0 && r.top<window.innerHeight;
  });
  if(!discoverVisible) throw new Error("Search button did not bring Discover into view");

  const search = page.locator("#searchInput");
  await search.fill("matrix");
  await sleep(250);
  const titles = await page.locator("#aiRail .movie-card h3").allTextContents();
  if (!titles.some(t => t.toLowerCase().includes("matrix"))) {
    throw new Error("local movie search did not surface Matrix");
  }

  await search.fill("breaking bad");
  await sleep(250);
  const seriesSearchTitles = await page.locator("#aiRail .movie-card h3").allTextContents();
  if (!seriesSearchTitles.some(t => t.toLowerCase().includes("breaking bad"))) {
    throw new Error("local web-series search did not surface Breaking Bad");
  }

  // Web Series: exactly 100 poster-backed records, clickable into the title modal.
  const seriesCount = await page.locator("#seriesRail .movie-card").count();
  if (seriesCount !== 100) throw new Error("Web Series rail did not render exactly 100 titles");
  const seriesPosterCount = await page.locator("#seriesRail .movie-card img").evaluateAll(imgs =>
    imgs.filter(img => (img.getAttribute("src") || "").includes("/tvposter/")).length
  );
  if (seriesPosterCount !== 100) throw new Error("Web Series contains a non-poster artwork URL");
  const firstSeries = page.locator("#seriesRail .movie-card").first();
  await firstSeries.click();
  await page.locator("#movieModal:not(.hidden)").waitFor({state:"visible",timeout:1500});
  const seriesKicker = (await page.locator("#modalKicker").textContent()).trim();
  if (!seriesKicker.includes("WEB SERIES")) throw new Error("Web Series title opened as a movie");
  await page.locator("#movieModal .modal-close").click();
  await page.locator("#movieModal.hidden").waitFor({state:"attached",timeout:1000});

  await page.close();
  if (errors.length) throw new Error(errors.join("\n"));
}

async function testMobile(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const errors = [];
  page.on("pageerror", err => errors.push("pageerror: " + err.message));
  page.on("console", msg => {
    if (msg.type() === "error" && !/Failed to load resource: the server responded with a status of 404 \(\)/i.test(msg.text())) {
      errors.push("console: " + msg.text());
    }
  });
  page.on("response", response => {
    if (response.status() < 400) return;
    const type=response.request().resourceType();
    if (type !== "image") errors.push("resource "+response.status()+": "+response.url());
  });

  await page.goto(base, { waitUntil: "networkidle" });
  await sleep(900);
  await page.locator("#mobileMenu").click();
  const open = await page.locator("#mobileDrawer").evaluate(el => el.classList.contains("open"));
  if (!open) throw new Error("mobile navigation drawer did not open");
  await page.locator("#mobileDrawer .drawer-close").click();
  if (await page.locator("#mobileDrawer").evaluate(el => el.classList.contains("open"))) {
    throw new Error("mobile navigation drawer did not close");
  }

  // Deep-link regression checks: both modern "#route" and legacy "#/route" forms
  // must activate the correct navigation item and land on the intended section.
  await page.goto(base + "#/activity", { waitUntil: "networkidle" });
  await sleep(250);
  const activityActive = await page.locator('.main-nav a.active').getAttribute("href");
  if (activityActive !== "#activity") {
    throw new Error("activity deep link did not activate Activity navigation");
  }
  await page.locator("#activity.is-visible").waitFor({ state: "attached", timeout: 1500 });
  const activityVisible = await page.locator("#activity").evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  });
  if (!activityVisible) throw new Error("activity deep link did not bring Activity section into the viewport");

  await page.goto(base + "#/web-series", { waitUntil: "networkidle" });
  await sleep(350);
  const seriesActive = await page.locator('.main-nav a.active').getAttribute("href");
  if (seriesActive !== "#web-series") throw new Error("web-series deep link did not activate Web Series navigation");
  const seriesVisible = await page.locator("#web-series").evaluate(el => {
    const r=el.getBoundingClientRect();
    return r.bottom>0 && r.top<window.innerHeight;
  });
  if (!seriesVisible) throw new Error("web-series deep link did not bring Web Series into view");

  await page.goto(base + "#/my-list", { waitUntil: "networkidle" });
  await sleep(250);
  const listActive = await page.locator('.main-nav a.active').getAttribute("href");
  if (listActive !== "#my-list") {
    throw new Error("my-list deep link did not activate My List navigation");
  }

  await page.close();
  if (errors.length) throw new Error(errors.join("\n"));
}

const browser = await chromium.launch({ headless: true });
try {
  await testDesktop(browser);
  await testMobile(browser);
  console.log("CINEPLAY browser smoke test: PASS");
} finally {
  await browser.close();
}
