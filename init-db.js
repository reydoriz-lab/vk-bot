const { Pool } = require('pg');

const pool = new Pool({
    connectionString: 'postgresql://vkbot:xKvDqAua7FQVEv9gyMF1C4DhKWEG30UP@dpg-d8kqktt7vvec73bhptkg-a.frankfurt-postgres.render.com/vkbot_hw5v',
    ssl: { rejectUnauthorized: false }
});

async function init() {
    console.log('🚀 Создаю таблицы...');
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            vk_id BIGINT UNIQUE,
            name TEXT,
            is_banned INTEGER DEFAULT 0,
            registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS profiles (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            type TEXT,
            gender TEXT,
            search_gender TEXT,
            name TEXT,
            age INTEGER,
            city TEXT,
            photo TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS likes (
            id SERIAL PRIMARY KEY,
            from_user_id INTEGER,
            to_profile_id INTEGER,
            type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(from_user_id, to_profile_id)
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS matches (
            id SERIAL PRIMARY KEY,
            user1_id INTEGER,
            user2_id INTEGER,
            type TEXT,
            chat_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS chats (
            id SERIAL PRIMARY KEY,
            match_id INTEGER,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            closed_at TIMESTAMP
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id SERIAL PRIMARY KEY,
            chat_id INTEGER,
            from_user_id INTEGER,
            message TEXT,
            attachment TEXT,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS admin_logs (
            id SERIAL PRIMARY KEY,
            admin_id INTEGER,
            action TEXT,
            target_id INTEGER,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_logs (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            action TEXT,
            details TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    console.log('✅ Таблицы созданы');
    await pool.end();
}

init();