require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');
const { CATEGORY_URLS } = require('./urls');
const { parseProductLinks, parseProductDetails } = require('./parser');

const AUTH = process.env.BRIGHT_DATA_AUTH;

// Helper: connect browser with retry
async function connectBrowser() {
  console.log('Connecting to Bright Data Browser API...');
  return await chromium.connectOverCDP(
    `wss://${AUTH}@brd.superproxy.io:9222`
  );
}

// Helper: navigate a page and wait for Cloudflare/CAPTCHA to clear
async function navigateSafe(page, url) {
  await page.goto(url, { timeout: 2 * 60 * 1000, waitUntil: 'domcontentloaded' });

  // Let Bright Data auto-solve Cloudflare challenge
  try {
    const client = await page.context().newCDPSession(page);
    const { status } = await client.send('Captcha.waitForSolve', {
      detectTimeout: 15 * 1000,
    });
    if (status !== 'not_detected') {
      console.log(`  Captcha solved: ${status}`);
    }
  } catch (_) {
    // No captcha found, continue
  }

  // Wait for actual content (not just Cloudflare spinner)
  await page.waitForSelector('body', { timeout: 30 * 1000 });
  await page.waitForTimeout(2000); // small buffer for JS to render
}

async function scrape() {
  if (!AUTH || AUTH.includes('your_username')) {
    throw new Error('Set BRIGHT_DATA_AUTH in your .env file');
  }

  const browser = await connectBrowser();
  const allProducts = [];
  const visited = new Set();

  try {
    // ── Step 1: Collect all product URLs from all categories ──
    const productUrls = new Set();

    for (const categoryUrl of CATEGORY_URLS) {
      console.log(`\n📂 Scanning category: ${categoryUrl}`);
      const page = await browser.newPage();

      try {
        await navigateSafe(page, categoryUrl);
        const links = await parseProductLinks(page);
        console.log(`  Found ${links.length} product links`);
        links.forEach(l => productUrls.add(l));
      } catch (err) {
        console.error(`  ❌ Error on category ${categoryUrl}: ${err.message}`);
      } finally {
        await page.close();
      }
    }

    console.log(`\n✅ Total unique product URLs found: ${productUrls.size}`);

    // ── Step 2: Scrape each product page ──────────────────────
    let count = 0;
    for (const productUrl of productUrls) {
      if (visited.has(productUrl)) continue;
      visited.add(productUrl);
      count++;

      console.log(`\n🛒 [${count}/${productUrls.size}] Scraping: ${productUrl}`);
      const page = await browser.newPage();

      try {
        await navigateSafe(page, productUrl);
        const product = await parseProductDetails(page, productUrl);

        if (product.name) {
          allProducts.push(product);
          console.log(`  ✅ ${product.name} | Stores: ${product.storePrices.length} | Specs: ${Object.keys(product.specs).length}`);
        } else {
          console.log(`  ⚠️ No product name found — skipping`);
        }
      } catch (err) {
        console.error(`  ❌ Error: ${err.message}`);
      } finally {
        await page.close();
      }

      // Small delay between requests to be respectful
      await new Promise(r => setTimeout(r, 1500));
    }

  } finally {
    await browser.close();
  }

  // ── Save output ─────────────────────────────────────────────
  if (!fs.existsSync('output')) fs.mkdirSync('output');

  const outputPath = `output/products_${Date.now()}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(allProducts, null, 2));

  console.log(`\n🎉 Done! Scraped ${allProducts.length} products → ${outputPath}`);
}

scrape().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});