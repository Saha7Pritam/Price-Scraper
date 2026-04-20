// ─────────────────────────────────────────────────────────────
//  parsers/primeabgb.js
//  WooCommerce-based store — selectors are standard WooCommerce
// ─────────────────────────────────────────────────────────────

/**
 * Extracts all product links from a category/listing page.
 */
async function parseProductLinks(page) {
  return await page.evaluate(() => {
    const links = new Set();
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      if (href.includes('/online-price-reviews-india/')) {
        links.add(href.split('?')[0]);
      }
    });
    return [...links];
  });
}

/**
 * Returns the next pagination URL, or null on last page.
 */
async function getNextPageUrl(page) {
  return await page.evaluate(() => {
    const next = document.querySelector('a.next.page-numbers');
    return next ? next.href : null;
  });
}

/**
 * Extracts all product data from a single product detail page.
 */
async function parseProductDetails(page, url) {
  return await page.evaluate((pageUrl) => {
    const getText = (selector) =>
      document.querySelector(selector)?.innerText?.trim() || null;

    // ── Name ──────────────────────────────────────────────────
    const name =
      getText('.product_title') ||
      getText('h1.entry-title') ||
      getText('h1');

    // ── Prices ────────────────────────────────────────────────
    const salePrice =
      getText('.price ins .woocommerce-Price-amount') ||
      getText('.price ins') ||
      getText('.woocommerce-Price-amount');

    const originalPrice =
      getText('.price del .woocommerce-Price-amount') ||
      getText('.price del') ||
      null;

    const discountBadge =
      getText('.onsale') ||
      getText('.badge-sale') ||
      null;

    // ── SKU & Stock ───────────────────────────────────────────
    const sku = getText('.sku') || null;

    const stockStatus =
      getText('.stock') ||
      getText('.availability .value') ||
      null;

    // ── Category ──────────────────────────────────────────────
    const breadcrumbs = [...document.querySelectorAll('.woocommerce-breadcrumb a, nav.breadcrumb a')]
      .map(a => a.innerText.trim())
      .filter(Boolean);

    const category = breadcrumbs.length > 1
      ? breadcrumbs[breadcrumbs.length - 1]
      : getText('.posted_in a') || null;

    // ── Tags ──────────────────────────────────────────────────
    const tags = [...document.querySelectorAll('.tagged_as a')]
      .map(a => a.innerText.trim())
      .filter(Boolean);

    // ── Images ───────────────────────────────────────────────
    const images = [...document.querySelectorAll(
      '.woocommerce-product-gallery img, .product-images img'
    )]
      .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
      .filter(Boolean);

    // ── Specs ─────────────────────────────────────────────────
    const specs = {};
    document.querySelectorAll(
      '.woocommerce-product-attributes tr, .shop_attributes tr'
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

    return {
      url: pageUrl,
      store: 'primeabgb',
      name,
      sku,
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