// cleanup_mapper.js
// Reads from Cosmos noSQL → transforms → inserts into Azure SQL

require('dotenv').config();
const { CosmosClient } = require('@azure/cosmos');
const { v4: uuidv4 }   = require('uuid');
const sql              = require('mssql');

// ── Cosmos setup ──────────────────────────────────────────────
const client    = new CosmosClient(process.env.COSMOS_CONNECTION_STRING);
const database  = client.database('ScraperDB');
const container = database.container('scrap_results');

// ── SQL setup ─────────────────────────────────────────────────
const sqlConfig = {
  server  : 'tpsintsql.database.windows.net',
  database: 'db_tpstechautomata',
  user    : process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

// ── Helpers ───────────────────────────────────────────────────
function parsePrice(priceStr) {
  if (!priceStr) return null;
  return parseFloat(priceStr.replace(/[₹,]/g, '').trim()) || null;
}

function mapProduct(product) {
  const store = product.store;

  if (store === 'primeabgb') {
    return {
      ScrapID         : uuidv4(),
      SKU             : product.sku || null,
      Name            : product.name || null,
      CompetitorPrice : parsePrice(product.salePrice),
      ProductURL      : product.url,
      StockStatus     : product.stockStatus || null,
      StoreName       : 'primeabgb',
      Category        : product.category || null,
      ScrapedAt       : product.scrapedAt,
    };
  }

  if (store === 'mdcomputers') {
    return {
      ScrapID         : uuidv4(),
      SKU             : product.productCode || null,
      Name            : product.name || null,
      CompetitorPrice : parsePrice(product.salePrice),
      ProductURL      : product.url,
      StockStatus     : product.stockStatus || null,
      StoreName       : 'mdcomputers',
      Category        : product.category || null,
      ScrapedAt       : product.scrapedAt,
    };
  }

  if (store === 'pickpcparts') {
    const lowestRetailer = product.lowestPrice?.retailer;
    const lowestEntry    = product.retailerPrices?.find(
      r => r.retailer === lowestRetailer
    );

    return {
      ScrapID         : uuidv4(),
      SKU             : product.partIds?.[0] || null,
      Name            : product.name || null,
      CompetitorPrice : parsePrice(product.lowestPrice?.price),
      ProductURL      : product.url,
      StockStatus     : lowestEntry?.available || null,
      StoreName       : 'pickpcparts',
      Category        : product.category || null,
      ScrapedAt       : product.scrapedAt,
    };
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────
async function runMapper() {

  // Step 1: Read from Cosmos
  console.log('📖 Reading from Cosmos...');
  const { resources } = await container.items
    .query('SELECT * FROM c')
    .fetchAll();
  console.log(`   Found ${resources.length} documents`);

  // Step 2: Map to standard structure
  const mapped = [];
  let skipped  = 0;

  for (const product of resources) {
    const result = mapProduct(product);
    if (result && result.SKU !== null) {
      mapped.push(result);
    } else {
      skipped++;
    }
  }

  console.log(`   Mapped : ${mapped.length}`);
  console.log(`   Skipped: ${skipped} (null SKU or unknown store)`);

  // Step 3: Connect to SQL
  console.log('\n🔌 Connecting to Azure SQL...');
  const pool = await sql.connect(sqlConfig);
  console.log('   Connected');

  // Step 4: Insert into SQL using MERGE
  console.log('\n📤 Inserting into CompetitorPrices...');
  let inserted = 0;
  let updated  = 0;

  for (const row of mapped) {
    const result = await pool.request()
      .input('ScrapID',         sql.NVarChar(36),       row.ScrapID)
      .input('SKU',             sql.NVarChar(100),      row.SKU)
      .input('Name',            sql.NVarChar(500),      row.Name)
      .input('CompetitorPrice', sql.Decimal(10, 2),     row.CompetitorPrice)
      .input('ProductURL',      sql.NVarChar(sql.MAX),  row.ProductURL)
      .input('StockStatus',     sql.NVarChar(50),       row.StockStatus)
      .input('StoreName',       sql.NVarChar(100),      row.StoreName)
      .input('Category',        sql.NVarChar(100),      row.Category)
      .input('ScrapedAt',       sql.NVarChar(50),       row.ScrapedAt)
      .query(`
        MERGE CompetitorPrices AS target
        USING (SELECT @SKU AS SKU, @StoreName AS StoreName) AS source
          ON target.SKU = source.SKU AND target.StoreName = source.StoreName
        WHEN MATCHED THEN
          UPDATE SET
            CompetitorPrice = @CompetitorPrice,
            StockStatus     = @StockStatus,
            ScrapedAt       = @ScrapedAt
        WHEN NOT MATCHED THEN
          INSERT (ScrapID, SKU, Name, CompetitorPrice, ProductURL, StockStatus, StoreName, Category, ScrapedAt)
          VALUES (@ScrapID, @SKU, @Name, @CompetitorPrice, @ProductURL, @StockStatus, @StoreName, @Category, @ScrapedAt);
      `);

    if (result.rowsAffected[0] === 1) inserted++;
    else updated++;
  }

  console.log(`\n🎉 Done!`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Updated : ${updated}`);

  await sql.close();
}

runMapper().catch(err => {
  console.error('Fatal error FULL:', err);
  process.exit(1);
});