// cleanup_mapper.js
// Reads from Cosmos noSQL → transforms → ready to insert into SQL

require('dotenv').config();
const { CosmosClient } = require('@azure/cosmos');

const client    = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const database  = client.database('ScraperDB');
const container = database.container('scrap_results');

function parsePrice(priceStr) {
  if (!priceStr) return null;
  return parseFloat(priceStr.replace(/[₹,]/g, '').trim()) || null;
}

function mapProduct(product) {
  const store = product.store;

  if (store === 'primeabgb') {
    return {
      SKU          : product.sku || null,
      Name         : product.name || null,
      CompetePrice : parsePrice(product.salePrice),
      ProductURL   : product.url,
      StockStatus    : product.stockStatus || null,
      StoreName    : 'primeabgb',
      Category     : product.category || null,
      ScrapedAt    : product.scrapedAt,
    };
  }

  if (store === 'mdcomputers') {
    return {
      SKU          : product.productCode || null,
      Name         : product.name || null,
      CompetePrice : parsePrice(product.salePrice),
      ProductURL   : product.url,
      StockStatus    : product.stockStatus || null,
      StoreName    : 'mdcomputers',
      Category     : product.category || null,
      ScrapedAt    : product.scrapedAt,
    };
  }

  if (store === 'pickpcparts') {
    // Get stock from the lowestPrice retailer's entry
    const lowestRetailer = product.lowestPrice?.retailer;
    const lowestEntry = product.retailerPrices?.find(
      r => r.retailer === lowestRetailer
    );

    return {
      SKU          : product.partIds?.[0] || null,
      Name         : product.name || null,
      CompetePrice : parsePrice(product.lowestPrice?.price),
      ProductURL   : product.url,
      StockStatus    : lowestEntry?.available || null,
      StoreName    : 'pickpcparts',
      Category     : product.category || null,
      ScrapedAt    : product.scrapedAt,
    };
  }

  return null; // unknown store
}

async function runMapper() {
  console.log('Reading from Cosmos...');

  const { resources } = await container.items
    .query('SELECT * FROM c')
    .fetchAll();

  console.log(`Found ${resources.length} documents`);

  const mapped = [];
  let skipped = 0;

  for (const product of resources) {
    const result = mapProduct(product);
    if (result) {
      mapped.push(result);
    } else {
      skipped++;
    }
  }

  console.log(`Mapped: ${mapped.length}`);
  console.log(`Skipped: ${skipped}`);

  // Preview first 3 records
  console.log('\nSample output:');
  console.log(JSON.stringify(mapped.slice(0, 3), null, 2));

  // TODO: When SQL DB is ready, insert mapped[] into SQL here
}

runMapper().catch(console.error);