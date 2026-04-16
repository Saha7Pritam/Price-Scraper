// Extracts ALL product links from a category/listing page
async function parseProductLinks(page) {
  return await page.evaluate(() => {
    const links = new Set();

    // Grab all anchor tags that look like product pages
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      // Product URLs typically look like /p/ or /product/ or contain an ID
      if (
        href.includes('/p/') ||
        href.includes('/product/') ||
        href.match(/pcpricetracker\.in\/[a-z0-9-]{8,}$/)
      ) {
        links.add(href);
      }
    });

    return [...links];
  });
}

// Extracts ALL data from a single product detail page
async function parseProductDetails(page, url) {
  return await page.evaluate((pageUrl) => {
    const getText = (selector) =>
      document.querySelector(selector)?.innerText?.trim() || null;

    const getAll = (selector) =>
      [...document.querySelectorAll(selector)].map(el => el.innerText?.trim()).filter(Boolean);

    const getAttr = (selector, attr) =>
      document.querySelector(selector)?.getAttribute(attr) || null;

    // ── Basic Info ──────────────────────────────────────────
    const name =
      getText('h1') ||
      getText('.product-title') ||
      getText('.product-name');

    const category =
      getText('.breadcrumb li:last-child') ||
      getText('.category') ||
      null;

    const image =
      getAttr('img.product-image, .product-img img, main img', 'src') ||
      null;

    // ── Prices from multiple stores ─────────────────────────
    // The site shows prices from Amazon, Flipkart, MDComputers etc.
    const storePrices = [];
    document.querySelectorAll(
      '.store-row, .retailer-row, .price-row, tr, .store-item'
    ).forEach(row => {
      const storeName =
        row.querySelector('.store-name, .retailer, td:first-child, .store')
           ?.innerText?.trim();
      const price =
        row.querySelector('.price, .store-price, td.price, .current-price')
           ?.innerText?.trim();
      const link =
        row.querySelector('a[href]')?.href || null;
      const availability =
        row.querySelector('.stock, .availability, .in-stock')
           ?.innerText?.trim() || null;

      if (storeName && price) {
        storePrices.push({ store: storeName, price, link, availability });
      }
    });

    // ── Price History ───────────────────────────────────────
    // Grab any price history table rows if present
    const priceHistory = [];
    document.querySelectorAll('.price-history tr, .history-row').forEach(row => {
      const date = row.querySelector('td:first-child')?.innerText?.trim();
      const price = row.querySelector('td:last-child')?.innerText?.trim();
      if (date && price) priceHistory.push({ date, price });
    });

    // ── Specifications ──────────────────────────────────────
    const specs = {};
    document.querySelectorAll(
      '.spec-row, .specs tr, .specifications tr, .spec-item'
    ).forEach(row => {
      const key   = row.querySelector('td:first-child, .spec-key, th')?.innerText?.trim();
      const value = row.querySelector('td:last-child, .spec-value, td:nth-child(2)')?.innerText?.trim();
      if (key && value) specs[key] = value;
    });

    // ── Lowest / Highest Price Summary ──────────────────────
    const lowestPrice  = getText('.lowest-price, .min-price, .best-price') ||
                         (storePrices.length
                           ? storePrices.reduce((a, b) =>
                               parseFloat(a.price?.replace(/[^0-9.]/g, '')) <
                               parseFloat(b.price?.replace(/[^0-9.]/g, '')) ? a : b
                             ).price
                           : null);

    const rating       = getText('.rating, .product-rating, .stars');
    const reviewCount  = getText('.review-count, .num-reviews');

    return {
      url: pageUrl,
      name,
      category,
      image,
      lowestPrice,
      rating,
      reviewCount,
      storePrices,      // array: [{ store, price, link, availability }]
      priceHistory,     // array: [{ date, price }]
      specs,            // object: { "Brand": "ASUS", "Memory": "8GB", ... }
      scrapedAt: new Date().toISOString(),
    };
  }, url);
}

module.exports = { parseProductLinks, parseProductDetails };