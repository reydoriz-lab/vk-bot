const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');

const sqlite = new sqlite3.Database('./bot.db');

// Подключение к PostgreSQL на Render
const pool = new Pool({
    connectionString: 'postgresql://vkbot:xKvDqAua7FQVEv9gyMF1C4DhKWEG30UP@dpg-d8kqktt7vvec73bhptkg-a.frankfurt-postgres.render.com/vkbot_hw5v',
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    console.log('🚀 Начинаю миграцию данных...');
    
    try {
        // Проверка подключения
        await pool.query('SELECT 1');
        console.log('✅ Подключение к PostgreSQL успешно');
        
        // 1. Пользователи
        const users = await new Promise((resolve, reject) => {
            sqlite.all(`SELECT * FROM users`, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        console.log(`📥 Найдено пользователей: ${users.length}`);
        
        for (const user of users) {
            await pool.query(
                `INSERT INTO users (id, vk_id, name, is_banned, registered_at) 
                 VALUES ($1, $2, $3, $4, $5) 
                 ON CONFLICT (vk_id) DO NOTHING`,
                [user.id, user.vk_id, user.name, user.is_banned, user.registered_at]
            );
        }
        console.log('✅ Пользователи перенесены');
        
        // 2. Анкеты
        const profiles = await new Promise((resolve, reject) => {
            sqlite.all(`SELECT * FROM profiles`, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        console.log(`📥 Найдено анкет: ${profiles.length}`);
        
        for (const profile of profiles) {
            await pool.query(
                `INSERT INTO profiles (id, user_id, type, gender, search_gender, name, age, city, photo, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 ON CONFLICT (id) DO NOTHING`,
                [profile.id, profile.user_id, profile.type, profile.gender, 
                 profile.search_gender, profile.name, profile.age, profile.city, 
                 profile.photo, profile.created_at]
            );
        }
        console.log('✅ Анкеты перенесены');
        
        // 3. Лайки
        const likes = await new Promise((resolve, reject) => {
            sqlite.all(`SELECT * FROM likes`, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        console.log(`📥 Найдено лайков: ${likes.length}`);
        
        for (const like of likes) {
            await pool.query(
                `INSERT INTO likes (id, from_user_id, to_profile_id, type, created_at) 
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (from_user_id, to_profile_id) DO NOTHING`,
                [like.id, like.from_user_id, like.to_profile_id, like.type, like.created_at]
            );
        }
        console.log('✅ Лайки перенесены');
        
        // 4. Мэтчи
        const matches = await new Promise((resolve, reject) => {
            sqlite.all(`SELECT * FROM matches`, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        console.log(`📥 Найдено мэтчей: ${matches.length}`);
        
        for (const match of matches) {
            await pool.query(
                `INSERT INTO matches (id, user1_id, user2_id, type, chat_id, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (id) DO NOTHING`,
                [match.id, match.user1_id, match.user2_id, match.type, match.chat_id, match.created_at]
            );
        }
        console.log('✅ Мэтчи перенесены');
        
        // 5. Чаты
        const chats = await new Promise((resolve, reject) => {
            sqlite.all(`SELECT * FROM chats`, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        console.log(`📥 Найдено чатов: ${chats.length}`);
        
        for (const chat of chats) {
            await pool.query(
                `INSERT INTO chats (id, match_id, is_active, created_at, closed_at) 
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (id) DO NOTHING`,
                [chat.id, chat.match_id, chat.is_active, chat.created_at, chat.closed_at]
            );
        }
        console.log('✅ Чаты перенесены');
        
        // 6. Сообщения
        const messages = await new Promise((resolve, reject) => {
            sqlite.all(`SELECT * FROM chat_messages`, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
        console.log(`📥 Найдено сообщений: ${messages.length}`);
        
        for (const msg of messages) {
            await pool.query(
                `INSERT INTO chat_messages (id, chat_id, from_user_id, message, attachment, sent_at) 
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (id) DO NOTHING`,
                [msg.id, msg.chat_id, msg.from_user_id, msg.message, msg.attachment, msg.sent_at]
            );
        }
        console.log('✅ Сообщения перенесены');
        
        console.log('🎉 МИГРАЦИЯ ЗАВЕРШЕНА!');
        
    } catch (err) {
        console.error('Ошибка:', err);
    } finally {
        sqlite.close();
        await pool.end();
    }
}

migrate();