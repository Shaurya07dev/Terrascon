/*
 Test MongoDB connection (Atlas) using both MongoDB Node driver and Mongoose.
 Usage:
   npm run test:db
*/

require('dotenv').config();
const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');

function line(title) {
  console.log(`\n================ ${title} ================`);
}

(async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not set in .env');
    process.exit(1);
  }

  // Try native driver first
  line('MongoDB Native Driver');
  let client;
  try {
    client = new MongoClient(uri, {
      serverApi: { version: '1', strict: true, deprecationErrors: true },
      // You can add a short timeout while testing connectivity
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    });
    await client.connect();

    // Determine target DB name (if none provided, driver defaults to 'test')
    const db = client.db();
    const dbName = db.databaseName || 'test';

    // Ping
    await db.command({ ping: 1 });
    console.log(`✅ Native driver connected successfully. DB: ${dbName}`);
  } catch (err) {
    console.error('❌ Native driver connection failed:');
    console.error(`   Name: ${err.name}`);
    console.error(`   Code: ${err.code || 'N/A'}`);
    console.error(`   Message: ${err.message}`);
    console.log('\nHints:');
    console.log('- Ensure your IP is allowed in Atlas Network Access (Whitelist).');
    console.log('- Verify username/password in the connection string.');
    console.log('- If no DB name in URI, append one like "/restaurant" after the host.');
    console.log('- If using SRV (mongodb+srv), ensure DNS works from your network.');
  } finally {
    try { if (client) await client.close(); } catch (_) {}
  }

  // Try via Mongoose
  line('Mongoose');
  try {
    const conn = await mongoose.connect(uri, {
      // Mongoose 7/8 does not require useNewUrlParser/useUnifiedTopology
      connectTimeoutMS: 10000,
      socketTimeoutMS: 10000,
    });
    console.log(`✅ Mongoose connected: host=${conn.connection.host} db=${conn.connection.name}`);
  } catch (err) {
    console.error('❌ Mongoose connection failed:');
    console.error(`   Name: ${err.name}`);
    console.error(`   Code: ${err.code || 'N/A'}`);
    console.error(`   Message: ${err.message}`);
    console.log('\nHints:');
    console.log('- If you see IP whitelist or auth errors, update Atlas settings or credentials.');
    console.log('- Append a database name in MONGODB_URI if missing, e.g., "/restaurant".');
  } finally {
    try { await mongoose.disconnect(); } catch (_) {}
  }

  line('Done');
  process.exit(0);
})();
