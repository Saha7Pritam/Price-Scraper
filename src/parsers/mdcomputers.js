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
    const activeLi = document.querySelector('ul.pagination li.active');
    if (!activeLi) return null;

    const nextLi = activeLi.nextElementSibling;
    if (!nextLi) return null;

    if (nextLi.classList.contains('disabled')) return null;

    const nextA = nextLi.querySelector('a');
    if (!nextA || !nextA.href) return null;

    if (!nextA.href.includes('?page=') && !nextA.href.includes('page=')) return null;

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
    const salePrice = getText('h2.special-price') || null;

    const originalPrice =
      getText('.price-old') ||
      getText('.regular-price .price') ||
      null;

    const discountBadge = getText('.discount-percentage') || null;

    // ── Product Code ──────────────────────────────────────────
    // MDComputers shows it as "Product Code: YD3200C5FHBOX"
    // It's inside ul.product-status, second li item
    const productCodeEl = [...document.querySelectorAll('ul.product-status li')]
      .find(li => li.innerText?.includes('Product Code'));
    const productCode = productCodeEl
      ? productCodeEl.querySelector('.base-color')?.innerText?.trim() || null
      : null;

    // ── Stock Status ──────────────────────────────────────────
    // Third li in ul.product-status contains Availability
    const stockStatusEl = [...document.querySelectorAll('ul.product-status li')]
      .find(li => li.innerText?.includes('Availability'));
    const stockStatus = stockStatusEl
      ? stockStatusEl.querySelector('.base-color')?.innerText?.trim() || null
      : null;

    // ── Rating ────────────────────────────────────────────────
    const rating =
      getText('.rating-num') ||
      getText('.stars') ||
      null;

    // ── Category (from breadcrumb) ────────────────────────────
    const breadcrumbItems = [...document.querySelectorAll('.breadcrumb li a')]
      .map(a => a.innerText?.trim())
      .filter(t => t && t !== 'Home');

    const category = breadcrumbItems.length > 0 ? breadcrumbItems[0] : null;

    // ── Images — only from product gallery ───────────────────
    const images = [...document.querySelectorAll('.gallery-top img, .gallery-thumbs img')]
      .map(img => img.getAttribute('src') || img.getAttribute('data-src'))
      .filter(src => src && !src.includes('placeholder'))
      .map(src => src.startsWith('http') ? src : 'https://mdcomputers.in' + src);

    // ── Specs ─────────────────────────────────────────────────
    const specs = {};
    document.querySelectorAll('#tab-specification table tr').forEach(row => {
      const key   = row.querySelector('td:first-child')?.innerText?.trim();
      const value = row.querySelector('td:last-child')?.innerText?.trim();
      if (key && value && key !== value) specs[key] = value;
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
      productCode,
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