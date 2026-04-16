// ─────────────────────────────────────────────────────────────
//  parser.js  —  primeabgb.com
//  Handles:
//    1. parseProductLinks()  — scrapes one listing page
//    2. getNextPageUrl()     — finds the "Next" pagination link
//    3. parseProductDetails() — scrapes a single product page
// ─────────────────────────────────────────────────────────────

/**
 * Extracts all product links from a category/listing page.
 *
 * primeabgb listing pages are WooCommerce-powered.
 * Product links look like:
 *   /online-price-reviews-india/intel-core-ultra-5-250k-plus-processor.../
 *
 * We filter by that URL segment to avoid nav/breadcrumb noise.
 */
async function parseProductLinks(page) {
  return await page.evaluate(() => {
    const links = new Set();

    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      // primeabgb product pages always contain this path segment
      if (href.includes('/online-price-reviews-india/')) {
        links.add(href.split('?')[0]); // strip query params
      }
    });

    return [...links];
  });
}

/**
 * Returns the URL of the next pagination page, or null if we're on the last page.
 *
 * WooCommerce pagination looks like:
 *   <a class="next page-numbers" href=".../?page=2">Next »</a>
 */
async function getNextPageUrl(page) {
  return await page.evaluate(() => {
    const next = document.querySelector('a.next.page-numbers');
    return next ? next.href : null;
  });
}

/**
 * Extracts all relevant data from a single product detail page.
 *
 * Target fields from your screenshots:
 *  - Product name (h1)
 *  - Price (sale price + original price)
 *  - SKU  ← this is what you need that pcpricetracker didn't have
 *  - Stock status
 *  - Category (from breadcrumb)
 *  - Product images
 *  - Discount percentage
 *  - Specifications / attributes table
 *
 * primeabgb runs WooCommerce so selectors are very standard.
 */
async function parseProductDetails(page, url) {
  return await page.evaluate((pageUrl) => {
    const getText = (selector) =>
      document.querySelector(selector)?.innerText?.trim() || null;

    const getAttr = (selector, attr) =>
      document.querySelector(selector)?.getAttribute(attr) || null;

    // ── Name ──────────────────────────────────────────────────
    const name =
      getText('.product_title') ||   // WooCommerce standard
      getText('h1.entry-title') ||
      getText('h1');

    // ── Prices ────────────────────────────────────────────────
    // Sale price  → <ins> tag inside .price
    // Original    → <del> tag inside .price
    const salePrice =
      getText('.price ins .woocommerce-Price-amount') ||
      getText('.price ins') ||
      getText('.woocommerce-Price-amount');              // if no sale, only one price shown

    const originalPrice =
      getText('.price del .woocommerce-Price-amount') ||
      getText('.price del') ||
      null;

    // Discount badge (e.g. "45% Off")
    const discountBadge =
      getText('.onsale') ||
      getText('.badge-sale') ||
      getText('.woocommerce-badge') ||
      null;

    // ── SKU ───────────────────────────────────────────────────
    // WooCommerce puts SKU in .sku element
    // From your screenshot: SKU: BX80768250K
    const sku =
      getText('.sku') ||
      getText('[class*="sku"]') ||
      null;

    // ── Stock Status ──────────────────────────────────────────
    // "In Stock" / "Out of Stock"
    const stockStatus =
      getText('.stock') ||
      getText('.availability .value') ||
      null;

    // ── Category (from breadcrumb) ────────────────────────────
    // Last breadcrumb item before the product name
    const breadcrumbs = [...document.querySelectorAll('.woocommerce-breadcrumb a, nav.breadcrumb a')]
      .map(a => a.innerText.trim())
      .filter(Boolean);

    // "Home > Shop > CPU (Processor)" — we want "CPU (Processor)"
    const category = breadcrumbs.length > 1
      ? breadcrumbs[breadcrumbs.length - 1]
      : getText('.posted_in a') || null;

    // ── Tags ──────────────────────────────────────────────────
    // From your screenshot: Tags: BX80768250K, Core Ultra 7 250K Plus
    const tags = [...document.querySelectorAll('.tagged_as a')]
      .map(a => a.innerText.trim())
      .filter(Boolean);

    // ── Images ───────────────────────────────────────────────
    const images = [...document.querySelectorAll(
      '.woocommerce-product-gallery img, .product-images img'
    )]
      .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
      .filter(Boolean);

    // ── Specifications / Attributes table ─────────────────────
    // WooCommerce renders specs in a table inside .woocommerce-product-attributes
    // or a standard HTML table in the "Additional information" tab
    const specs = {};
    document.querySelectorAll(
      '.woocommerce-product-attributes tr, .shop_attributes tr, table.variations tr'
    ).forEach(row => {
      const key   = row.querySelector('th')?.innerText?.trim();
      const value = row.querySelector('td')?.innerText?.trim();
      if (key && value) specs[key] = value;
    });

    // ── Short Description ─────────────────────────────────────
    const shortDescription =
      getText('.woocommerce-product-details__short-description') ||
      getText('.short-description') ||
      null;

    // ── Assemble ──────────────────────────────────────────────
    return {
      url: pageUrl,
      name,
      sku,               // ← KEY FIELD you were missing
      category,
      stockStatus,
      salePrice,
      originalPrice,
      discountBadge,
      shortDescription,
      tags,
      images,
      specs,
      scrapedAt: new Date().toISOString(),
    };
  }, url);
}

module.exports = { parseProductLinks, getNextPageUrl, parseProductDetails };