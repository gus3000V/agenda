import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Fallback in case PostgreSQL is not running yet
let isConnected = false;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/express_vue_db',
});

// Try to connect once at startup
pool.connect()
  .then(() => {
    console.log('✅ Connected to PostgreSQL database');
    isConnected = true;
  })
  .catch((err) => {
    console.log('⚠️ Could not connect to PostgreSQL database (is it running?). Using fallback mock data.');
    console.error('   Connection Error:', err.message);
  });

export const db = {
  query: async (text, params) => {
    if (!isConnected) {
      throw new Error('Database not connected. Mock mode active.');
    }
    return pool.query(text, params);
  },
  isConnected: () => isConnected,
};
