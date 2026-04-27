// ─────────────────────────────────────────────────────────────
//  parsers/mdcomputers.js
// ─────────────────────────────────────────────────────────────

async function parseProductLinks(page) {
  return await page.evaluate(() => {
    const links = new Set();
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      // MDComputers product URLs pattern:
      // mdcomputers.in/product/amd-ryzen-5-5500-.../processor
      if (href.includes('mdcomputers.in/product/')) {
        links.add(href.split('?')[0]);
      }
    });
    return [...links];
  });
}

async function getNextPageUrl(page) {
  return await page.evaluate(() => {
    // MDComputers uses ?page=2 style pagination
    const next = document.querySelector('a[rel="next"], .pagination li.active + li a, ul.pagination a');
    if (next && next.href && !next.href.includes('javascript')) return next.href;

    // Fallback: look for a ">" or "Next" link
    const allLinks = [...document.querySelectorAll('.pagination a')];
    const current = document.querySelector('.pagination li.active');
    if (current) {
      const nextLi = current.nextElementSibling;
      const nextA = nextLi?.querySelector('a');
      if (nextA && nextA.href) return nextA.href;
    }
    return null;
  });
}

async function parseProductDetails(page, url) {
  return await page.evaluate((pageUrl) => {
    const getText = (selector) =>
      document.querySelector(selector)?.innerText?.trim() || null;

    // ── Name ──────────────────────────────────────────────────
    // From screenshots: <h1> or <h2> with product title
    const name =
      getText('h1') ||
      getText('h2.product-name') ||
      getText('.product-title');

    // ── Prices ────────────────────────────────────────────────
    // From screenshots: "Offer Price ₹8,659" and "(54% off) ₹19,000"
    const salePrice =
      getText('.offer-price') ||
      getText('.special-price .price') ||
      getText('.price-new') ||
      null;

    const originalPrice =
      getText('.price-old') ||
      getText('.regular-price .price') ||
      null;

    // Discount badge: "54% off" shown in red badge
    const discountBadge =
      getText('.discount-badge') ||
      getText('.badge-danger') ||
      getText('[class*="off"]') ||
      null;

    // ── SKU ───────────────────────────────────────────────────
    // MDComputers shows SKU in product details or breadcrumb slug
    // Extract from URL as fallback: /product/amd-ryzen-5-5500-100-100000457box.../
    const skuFromMeta = getText('.product-code') ||
      getText('.sku') ||
      getText('[class*="model"]') ||
      null;

    // Fallback: extract from URL
    const urlSlug = pageUrl.split('/product/')[1]?.split('/')[0] || null;

    const sku = skuFromMeta || urlSlug;

    // ── Stock Status ──────────────────────────────────────────
    // From screenshots filter: "In Stock" / "Out of Stock"
    const stockStatus =
      getText('.stock-status') ||
      getText('.availability') ||
      getText('[class*="stock"]') ||
      null;

    // ── Rating ────────────────────────────────────────────────
    const rating = getText('.rating-num') ||
      getText('.stars') ||
      null;

    // ── Category (from breadcrumb) ────────────────────────────
    // From screenshots: Home / Processor / AMD Ryzen 5 5500 Processor
    const breadcrumbs = [...document.querySelectorAll('.breadcrumb li, nav ol li')]
      .map(li => li.innerText?.trim())
      .filter(t => t && t !== '/' && t !== 'Home');

    const category = breadcrumbs.length > 0
      ? breadcrumbs[0]  // "Processor" is first after Home
      : null;

    // ── Images ───────────────────────────────────────────────
    const images = [...document.querySelectorAll(
      '.product-image img, .thumbnails img, .gallery img, [class*="product"] img'
    )]
      .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
      .filter(src => src && !src.includes('placeholder'))
      .map(src => src.startsWith('http') ? src : 'https://mdcomputers.in' + src);

    // ── Specs ─────────────────────────────────────────────────
    const specs = {};
    document.querySelectorAll(
      'table tr, .product-attribute tr, [class*="spec"] tr'
    ).forEach(row => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 2) {
        const key   = cells[0]?.innerText?.trim();
        const value = cells[1]?.innerText?.trim();
        if (key && value && key !== value) specs[key] = value;
      }
    });

    // ── Short Description ─────────────────────────────────────
    const shortDescription =
      getText('.product-description p') ||
      getText('[class*="description"] p') ||
      null;

    return {
      url: pageUrl,
      store: 'mdcomputers',
      name,
      sku,
      category,
      stockStatus,
      rating,
      salePrice,
      originalPrice,
      discountBadge,
      shortDescription,
      tags: [],
      images,
      specs,
      scrapedAt: new Date().toISOString(),
    };
  }, url);
}

module.exports = { parseProductLinks, getNextPageUrl, parseProductDetails };