const { Pool } = require('pg');

class Database {
  constructor() {
    this.pool = new Pool({
      user: process.env.DB_USER || 'your_db_user',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'your_db_name',
      password: process.env.DB_PASSWORD || 'your_password',
      port: process.env.DB_PORT || 5432,
    });
  }

  async query(text, params) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(text, params);
      return result.rows;
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
  async getClient() {
    const client = await this.pool.connect();
    return {
      query: (text, params) => client.query(text, params),
      release: () => client.release()
    };
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = new Database();