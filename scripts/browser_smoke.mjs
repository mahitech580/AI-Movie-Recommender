import { chromium } from "playwright";

const base = process.env.CINEPLAY_URL || "http://127.0.0.1:4173/";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function testDesktop(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", err => errors.push("pageerror: " + err.message));
  page.on("console", msg => {
    if (msg.type() === "error") errors.push("console: " + msg.text());
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

  const firstListButton = page.locator(".movie-card .mini-list").first();
  await firstListButton.click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("cineplay.mylist") || "[]").length);
  if (saved < 1) throw new Error("My List interaction did not persist");

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
    if (msg.type() === "error") errors.push("console: " + msg.text());
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
