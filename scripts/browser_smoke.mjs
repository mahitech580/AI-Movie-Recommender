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

  // Telugu/TFI should expose the complete regional set and Show more must work.
  await page.locator('#filterRow .filter-chip[data-filter="telugu"]').click();
  await sleep(120);
  const teluguTotal = Number.parseInt((await page.locator("#filterResultsCount").textContent()) || "0", 10);
  if (teluguTotal < 50) throw new Error("Telugu/TFI catalogue count is unexpectedly low");
  const firstBatch = await page.locator("#filterResultsGrid .movie-card").count();
  const visiblePosters = await page.locator('#filterResultsGrid img').evaluateAll(imgs =>
    imgs.filter(img => {
      const src = img.getAttribute("src") || "";
      return src && !src.startsWith("data:image/svg+xml");
    }).length
  );
  if (visiblePosters < 3) throw new Error("Telugu filter rendered too few real poster URLs");

  const rrr=page.locator('#filterResultsGrid .movie-card').filter({hasText:"RRR"}).first();
  await rrr.scrollIntoViewIfNeeded();
  await sleep(900);
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

  const search = page.locator("#searchInput");
  await search.fill("matrix");
  await sleep(250);
  const titles = await page.locator("#aiRail .movie-card h3").allTextContents();
  if (!titles.some(t => t.toLowerCase().includes("matrix"))) {
    throw new Error("local movie search did not surface Matrix");
  }

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
