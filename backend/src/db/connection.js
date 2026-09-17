const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const config = require('../../knexfile')[environment];
const knex = require('knex');

const db = knex(config);

module.exports = db;