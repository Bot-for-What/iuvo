const db = require('./connection');

async function checkDatabaseConnection() {
  try {
    const result = await db.raw('SELECT current_database() AS database_name, NOW() AS connected_at');

    console.log('Database connection successful.');
    console.log(`Database: ${result.rows[0].database_name}`);
    console.log(`Connected at: ${result.rows[0].connected_at.toISOString()}`);
  } catch (error) {
    console.error('Database connection failed.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

checkDatabaseConnection();
