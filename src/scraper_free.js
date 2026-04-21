// ─────────────────────────────────────────────────────────────
//  scraper_free.js  —  pickpcparts-only scraper (no Bright Data)
//
//  Drop this file into your src/ folder alongside scraper.js
//  Run: node src/scraper_free.js
//
//  Uses plain Playwright chromium — no paid proxy needed.
//  Output folder structure is IDENTICAL to scraper.js:
//    output/<storeName>/<categorySlug>/collected_urls.json
//                                      visited.json
//                                      products_full.json
//                                      products_prices.json
// ─────────────────────────────────────────────────────────────

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// ── Only pickpcparts is configured here ──────────────────────
// Same shape as STORES in urls.js — easy to plug back in later
const parser = require('./parsers/pickpcparts');

const STORES_FREE = [
  {
    name: 'pickpcparts',
    parser,
    categories: [
      { slug: 'cpu-processor', url: 'https://pickpcparts.in/processors/' },
      { slug: 'ram-memory',    url: 'https://pickpcparts.in/rams/' },
    ],
  },
];

// ── Browser state ─────────────────────────────────────────────
let _browser = null;

/**
 * Launch a plain Chromium browser with stealth settings.
 *
 * Why these flags?
 *  - headless: 'new'        → uses the newer headless mode; less detectable than old headless
 *  - userAgent             → pretend to be a real Chrome on Windows, not "HeadlessChrome"
 *  - viewport              → real screen size, not the 800x600 headless default
 *  - args below            → disable features that fingerprint you as a bot
 */
async function launchBrowser() {
  console.log('🚀 Launching local Chromium...');

  const browser = await chromium.launch({
    headless: true,   // flip to false if you want to watch it scrape (useful for debugging)
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled', // hides navigator.webdriver flag
      '--disable-infobars',
      '--window-size=1280,800',
    ],
  });

  browser.on('disconnected', () => {
    console.log('⚡ Browser disconnected');
    _browser = null;
  });

  console.log('✅ Browser ready\n');
  return browser;
}

async function getBrowser() {
  if (!_browser) _browser = await launchBrowser();
  return _browser;
}

// ── Page factory ──────────────────────────────────────────────
/**
 * Creates a new page with realistic browser headers.
 * This is the key to avoiding basic bot detection:
 *  - Real User-Agent (no "HeadlessChrome" in the string)
 *  - Accept-Language mimics a real browser
 *  - navigator.webdriver is hidden via JS injection
 */
async function newStealthPage(browser) {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-IN',
    extraHTTPHeaders: {
      'Accept-Language': 'en-IN,en;q=0.9',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
  });

  // Hide the navigator.webdriver property that Playwright sets by default.
  // Without this, even a real Chrome binary is instantly detectable as automated.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return await context.newPage();
}

// ── Navigation ────────────────────────────────────────────────
/**
 * Navigate with a generous timeout and a small random delay afterward.
 * The random delay mimics human think-time between page loads.
 * No Captcha.waitForSolve here — plain Playwright can't solve CAPTCHAs.
 * If pickpcparts starts showing CAPTCHAs, you'll need Bright Data again.
 */
async function navigateSafe(page, url) {
  await page.goto(url, {
    timeout:   90_000,          // 90s — free Playwright is slower than Bright Data
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('body', { timeout: 30_000 });

  // Random 1.5–3.5s delay — looks more human, reduces chance of rate-limiting
  const delay = 1500 + Math.floor(Math.random() * 2000);
  await page.waitForTimeout(delay);
}

// ── File helpers ──────────────────────────────────────────────
// These are byte-for-byte identical to scraper.js

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_) { return fallback; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ── Output paths — SAME structure as scraper.js ───────────────
function getPaths(storeName, categorySlug) {
  const dir = path.join('output', storeName, categorySlug);
  return {
    dir,
    urlsCache:    path.join(dir, 'collected_urls.json'),
    visitedCache: path.join(dir, 'visited.json'),
    fullOutput:   path.join(dir, 'products_full.json'),
    priceOutput:  path.join(dir, 'products_prices.json'),
  };
}

function appendProduct(fullOutputPath, product) {
  const existing = readJson(fullOutputPath, []);
  existing.push(product);
  writeJson(fullOutputPath, existing);
}

function rebuildPriceFile(fullOutputPath, priceOutputPath) {
  const all = readJson(fullOutputPath, []);
  const prices = all.map(p => ({
    store:         p.store,
    name:          p.name,
    category:      p.category,
    partIds:       p.partIds,
    lowestPrice:   p.lowestPrice,
    retailerPrices: p.retailerPrices,
    url:           p.url,
    scrapedAt:     p.scrapedAt,
  }));
  writeJson(priceOutputPath, prices);
}

// ── URL collection ────────────────────────────────────────────

async function collectUrlsForCategory(storeParser, startUrl, urlsCachePath) {
  // Resume support: if we already collected URLs, skip this phase entirely
  const saved = readJson(urlsCachePath, null);
  if (saved) {
    console.log(`  ♻️  Loaded ${saved.length} cached URLs`);
    return new Set(saved);
  }

  const productUrls = new Set();
  let currentUrl = startUrl;
  let pageNum = 1;

  while (currentUrl) {
    console.log(`  📄 Page ${pageNum}: ${currentUrl}`);
    let page = null;
    try {
      const browser = await getBrowser();
      page = await newStealthPage(browser);
      await navigateSafe(page, currentUrl);

      const links = await storeParser.parseProductLinks(page);
      console.log(`     ↳ ${links.length} product links found`);
      links.forEach(l => productUrls.add(l));

      currentUrl = await storeParser.getNextPageUrl(page);
      pageNum++;
    } catch (err) {
      console.error(`  ❌ Listing page error: ${err.message}`);
      if (err.message.includes('closed') || err.message.includes('disconnected')) {
        _browser = null;
      }
      currentUrl = null; // stop pagination on error
    } finally {
      // Always close the page — each page gets its own context for stealth
      if (page) {
        try { await page.context().close(); } catch (_) {}
      }
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  writeJson(urlsCachePath, [...productUrls]);
  console.log(`  💾 Saved ${productUrls.size} URLs to cache`);
  return productUrls;
}

// ── Product scraping ──────────────────────────────────────────

async function scrapeProductSafe(storeParser, productUrl) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    let page = null;
    try {
      const browser = await getBrowser();
      page = await newStealthPage(browser);
      await navigateSafe(page, productUrl);

      const product = await storeParser.parseProductDetails(page, productUrl);
      await page.context().close(); // close context (not just page) to free memory
      return product;
    } catch (err) {
      if (page) {
        try { await page.context().close(); } catch (_) {}
      }

      const dead =
        err.message.includes('closed') ||
        err.message.includes('disconnected') ||
        err.message.includes('Target page');

      if (dead) {
        _browser = null;
        console.log(`  ⚠️  Attempt ${attempt}: browser died — will relaunch`);
      } else {
        console.error(`  ⚠️  Attempt ${attempt}: ${err.message}`);
      }

      if (attempt < 3) await new Promise(r => setTimeout(r, 5000 * attempt));
    }
  }
  return null; // never throws — outer loop always continues
}

// ── Category orchestrator ─────────────────────────────────────

async function scrapeCategory(store, category) {
  const { name: storeName, parser: storeParser } = store;
  const { slug, url: startUrl } = category;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🏪 Store: ${storeName}  📂 Category: ${slug}`);
  console.log(`${'─'.repeat(60)}`);

  const paths = getPaths(storeName, slug);
  ensureDir(paths.dir);

  // Phase 1: Collect all product URLs (resumable)
  const productUrls = await collectUrlsForCategory(storeParser, startUrl, paths.urlsCache);
  console.log(`  ✅ ${productUrls.size} product URLs total`);

  // Phase 2: Scrape each product (resumable)
  const visited = new Set(readJson(paths.visitedCache, []));
  const total   = productUrls.size;
  let done      = visited.size;

  if (visited.size > 0) {
    console.log(`  ♻️  Resuming: ${visited.size} done, ${total - visited.size} remaining`);
  }

  for (const productUrl of productUrls) {
    if (visited.has(productUrl)) continue;
    done++;

    process.stdout.write(`  🛒 [${done}/${total}] `);

    const product = await scrapeProductSafe(storeParser, productUrl);

    if (product?.name) {
      appendProduct(paths.fullOutput, product);
      rebuildPriceFile(paths.fullOutput, paths.priceOutput);
      console.log(`✅ ${product.name.substring(0, 60)}`);
      if (product.lowestPrice) {
        console.log(`     Lowest: ${product.lowestPrice.price} @ ${product.lowestPrice.retailer}`);
      }
    } else {
      console.log(`⚠️  No data — ${productUrl}`);
    }

    visited.add(productUrl);
    writeJson(paths.visitedCache, [...visited]);

    // Polite delay between product pages — reduces chance of IP ban
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n  🏁 ${storeName}/${slug} complete: ${done} products scraped`);
  console.log(`     Full  → ${paths.fullOutput}`);
  console.log(`     Price → ${paths.priceOutput}`);
}

// ── Main ──────────────────────────────────────────────────────

async function scrape() {
  console.log('🚀 Free scraper (no Bright Data) — pickpcparts only\n');
  console.log('⚠️  Note: no CAPTCHA solving. If the site blocks you,');
  console.log('   try running with headless: false to debug visually.\n');

  await getBrowser(); // pre-launch so first category doesn't pay the startup cost

  for (const store of STORES_FREE) {
    for (const category of store.categories) {
      try {
        await scrapeCategory(store, category);
      } catch (err) {
        console.error(`\n❌ Failed: ${store.name}/${category.slug}: ${err.message}`);
        // Continue to next category even on failure
      }
    }
  }

  if (_browser) {
    try { await _browser.close(); } catch (_) {}
  }

  console.log('\n\n🎉 Done! Output saved in: output/pickpcparts/');
}

scrape().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});