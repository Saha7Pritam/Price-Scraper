// ─────────────────────────────────────────────────────────────
//  parsers/mdcomputers.js
// ─────────────────────────────────────────────────────────────

async function parseProductLinks(page) {
  return await page.evaluate(() => {
    const links = new Set();
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.href;
      if (href.includes('mdcomputers.in/product/')) {
        links.add(href.split('?')[0]);
      }
    });
    return [...links];
  });
}

async function getNextPageUrl(page) {
  return await page.evaluate(() => {
    // MDComputers uses Bootstrap pagination with ?page=N query params.
    //
    // FIX: The old selector matched ANY pagination link including the current
    // page or previous links, causing an infinite loop between page 1 and page 2.
    //
    // Strategy: find the <li class="active"> item, then get the NEXT sibling's link.
    // Only return it if it's a real numeric next page (not "»" or disabled).

    const activeLi = document.querySelector('ul.pagination li.active');
    if (!activeLi) return null;

    const nextLi = activeLi.nextElementSibling;
    if (!nextLi) return null;

    // Skip if it's a disabled item or a "»" / "next" arrow without a page number
    if (nextLi.classList.contains('disabled')) return null;

    const nextA = nextLi.querySelector('a');
    if (!nextA || !nextA.href) return null;

    // Must be a URL with ?page= to be a valid next page
    if (!nextA.href.includes('?page=') && !nextA.href.includes('page=')) return null;

    // Don't follow if it points back to the same URL as current page
    if (nextA.href === window.location.href) return null;

    return nextA.href;
  });
}

async function parseProductDetails(page, url) {
  return await page.evaluate((pageUrl) => {
    const getText = (selector) =>
      document.querySelector(selector)?.innerText?.trim() || null;

    // ── Name ──────────────────────────────────────────────────
    const name =
      getText('h1') ||
      getText('h2.product-name') ||
      getText('.product-title');

    // ── Prices ────────────────────────────────────────────────
    const salePrice =
      getText('.offer-price') ||
      getText('.special-price .price') ||
      getText('.price-new') ||
      null;

    const originalPrice =
      getText('.price-old') ||
      getText('.regular-price .price') ||
      null;

    const discountBadge =
      getText('.discount-badge') ||
      getText('.badge-danger') ||
      getText('[class*="off"]') ||
      null;

    // ── SKU ───────────────────────────────────────────────────
    const skuFromMeta =
      getText('.product-code') ||
      getText('.sku') ||
      getText('[class*="model"]') ||
      null;

    const urlSlug = pageUrl.split('/product/')[1]?.split('/')[0] || null;
    const sku = skuFromMeta || urlSlug;

    // ── Stock Status ──────────────────────────────────────────
    const stockStatus =
      getText('.stock-status') ||
      getText('.availability') ||
      getText('[class*="stock"]') ||
      null;

    // ── Rating ────────────────────────────────────────────────
    const rating =
      getText('.rating-num') ||
      getText('.stars') ||
      null;

    // ── Category (from breadcrumb) ────────────────────────────
    const breadcrumbs = [...document.querySelectorAll('.breadcrumb li, nav ol li')]
      .map(li => li.innerText?.trim())
      .filter(t => t && t !== '/' && t !== 'Home');

    const category = breadcrumbs.length > 0 ? breadcrumbs[0] : null;

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