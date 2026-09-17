require('dotenv').config();

const baseConnection = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL
    }
  : {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    };

module.exports = {
  development: {
    client: 'pg',
    connection: baseConnection,
    migrations: {
      directory: './src/db/migrations',
      tableName: 'knex_migrations'
    },
    pool: {
      min: 5,
      max: 50
    }
  },
  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL
      ? {
          ...baseConnection,
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
        }
      : baseConnection,
    migrations: {
      directory: './src/db/migrations',
      tableName: 'knex_migrations'
    },
    pool: {
      min: 5,
      max: 50
    }
  }
};
