require('dotenv').config();

const app = require('./app');
const db = require('./db/connection');
const { startAutoCloseScheduler } = require('./services/auto-close.service');

const port = Number(process.env.PORT || 30040);

async function startServer() {
  try {
    await db.raw('SELECT 1');

    app.listen(port, () => {
      startAutoCloseScheduler();
      console.log(`Backend server listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Unable to connect to the database. Server was not started.');
    console.error(error.message);
    await db.destroy();
    process.exit(1);
  }
}

startServer();