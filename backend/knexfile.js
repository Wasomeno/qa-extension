require('dotenv').config();

module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'qa_command_center',
      user: process.env.DB_USER || 'qa_user',
      password: process.env.DB_PASSWORD || 'qa_password'
    },
    migrations: {
      directory: '../database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: '../database/seeds'
    },
    pool: {
      min: 2,
      max: 10
    }
  },

  staging: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: '../database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: '../database/seeds'
    },
    pool: {
      min: 2,
      max: 10
    }
  },

  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: '../database/migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: '../database/seeds'
    },
    pool: {
      min: 2,
      max: 20
    }
  }
};