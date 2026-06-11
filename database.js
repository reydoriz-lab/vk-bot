const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function initTables() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                vk_id BIGINT UNIQUE,
                name TEXT,
                is_banned INTEGER DEFAULT 0,
                registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS profiles (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                type TEXT CHECK(type IN ('public', 'anon')),
                gender TEXT CHECK(gender IN ('male', 'female')),
                search_gender TEXT CHECK(search_gender IN ('male', 'female', 'all')),
                name TEXT,
                age INTEGER,
                city TEXT,
                photo TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS likes (
                id SERIAL PRIMARY KEY,
                from_user_id INTEGER REFERENCES users(id),
                to_profile_id INTEGER REFERENCES profiles(id),
                type TEXT CHECK(type IN ('public', 'anon')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(from_user_id, to_profile_id)
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS matches (
                id SERIAL PRIMARY KEY,
                user1_id INTEGER REFERENCES users(id),
                user2_id INTEGER REFERENCES users(id),
                type TEXT CHECK(type IN ('public', 'anon')),
                chat_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS chats (
                id SERIAL PRIMARY KEY,
                match_id INTEGER REFERENCES matches(id),
                is_active INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                closed_at TIMESTAMP
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                chat_id INTEGER REFERENCES chats(id),
                from_user_id INTEGER REFERENCES users(id),
                message TEXT,
                attachment TEXT,
                sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS admin_logs (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER,
                action TEXT,
                target_id INTEGER,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                action TEXT,
                details TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        console.log('✅ База данных PostgreSQL инициализирована');
    } finally {
        client.release();
    }
}

initTables().catch(console.error);

module.exports = {
    addUser: async (vk_id, name) => {
        const result = await pool.query(
            `INSERT INTO users (vk_id, name) VALUES ($1, $2) ON CONFLICT (vk_id) DO NOTHING RETURNING id`,
            [vk_id, name]
        );
        if (result.rows[0]) return result.rows[0].id;
        const user = await module.exports.getUserByVkId(vk_id);
        return user ? user.id : null;
    },
    
    getUserByVkId: async (vk_id) => {
        const result = await pool.query(`SELECT * FROM users WHERE vk_id = $1`, [vk_id]);
        return result.rows[0];
    },
    
    getUserById: async (id) => {
        const result = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
        return result.rows[0];
    },
    
    createProfile: async (userId, type, gender, searchGender, name, age, city, photo) => {
        const result = await pool.query(
            `INSERT INTO profiles (user_id, type, gender, search_gender, name, age, city, photo) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [userId, type, gender, searchGender, name, age, city, photo]
        );
        return result.rows[0].id;
    },
    
    getProfileByUserIdAndType: async (userId, type) => {
        const result = await pool.query(
            `SELECT * FROM profiles WHERE user_id = $1 AND type = $2`,
            [userId, type]
        );
        return result.rows[0];
    },
    
    deleteProfile: async (profileId) => {
        await pool.query(`DELETE FROM profiles WHERE id = $1`, [profileId]);
    },
    
    getProfilesForSearch: async (currentUserId, currentProfile, age) => {
        const minAge = 18;
        const maxAge = 100;
        let searchGenderCondition = '';
        const params = [currentUserId, currentProfile.type, minAge, maxAge];
        
        if (currentProfile.search_gender === 'male') {
            searchGenderCondition = `AND p.gender = 'male'`;
        } else if (currentProfile.search_gender === 'female') {
            searchGenderCondition = `AND p.gender = 'female'`;
        }
        
        const query = `
            SELECT p.*, u.vk_id 
            FROM profiles p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id != $1 
                AND p.type = $2 
                AND p.age BETWEEN $3 AND $4
                ${searchGenderCondition}
                AND u.is_banned = 0
            ORDER BY RANDOM()
        `;
        
        const result = await pool.query(query, params);
        return result.rows || [];
    },
    
    getProfilesForSearchByCity: async (currentUserId, currentProfile, age, userCity) => {
        const minAge = 18;
        const maxAge = 100;
        let searchGenderCondition = '';
        const params = [userCity, currentUserId, currentProfile.type, minAge, maxAge];
        
        if (currentProfile.search_gender === 'male') {
            searchGenderCondition = `AND p.gender = 'male'`;
        } else if (currentProfile.search_gender === 'female') {
            searchGenderCondition = `AND p.gender = 'female'`;
        }
        
        const query = `
            SELECT p.*, u.vk_id,
                   CASE WHEN p.city = $1 THEN 1 ELSE 0 END as city_match
            FROM profiles p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id != $2 
                AND p.type = $3 
                AND p.age BETWEEN $4 AND $5
                ${searchGenderCondition}
                AND u.is_banned = 0
            ORDER BY city_match DESC, RANDOM()
        `;
        
        const result = await pool.query(query, params);
        return result.rows || [];
    },
    
    addLike: async (fromUserId, toProfileId, type) => {
        try {
            await pool.query(
                `INSERT INTO likes (from_user_id, to_profile_id, type) VALUES ($1, $2, $3)`,
                [fromUserId, toProfileId, type]
            );
            return true;
        } catch (err) {
            return false;
        }
    },
    
    checkLikeDirect: async (fromUserId, toProfileId, type) => {
        const result = await pool.query(
            `SELECT * FROM likes WHERE from_user_id = $1 AND to_profile_id = $2 AND type = $3`,
            [fromUserId, toProfileId, type]
        );
        return result.rows[0];
    },
    
    checkMutualLike: async (userId, otherUserProfileId, type) => {
        const profileResult = await pool.query(`SELECT user_id FROM profiles WHERE id = $1`, [otherUserProfileId]);
        if (!profileResult.rows[0]) return null;
        
        const result = await pool.query(`
            SELECT l1.* FROM likes l1
            JOIN profiles p ON l1.to_profile_id = p.id
            WHERE l1.from_user_id = $1 
                AND p.user_id = $2
                AND l1.type = $3
        `, [userId, profileResult.rows[0].user_id, type]);
        return result.rows[0];
    },
    
    createMatch: async (user1Id, user2Id, type, chatId = null) => {
        const existing = await pool.query(
            `SELECT id FROM matches WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
            [user1Id, user2Id]
        );
        
        if (existing.rows[0]) {
            return existing.rows[0].id;
        }
        
        const result = await pool.query(
            `INSERT INTO matches (user1_id, user2_id, type, chat_id) VALUES ($1, $2, $3, $4) RETURNING id`,
            [user1Id, user2Id, type, chatId]
        );
        return result.rows[0].id;
    },
    
    createChat: async (matchId) => {
        const existing = await pool.query(
            `SELECT id, is_active FROM chats WHERE match_id = $1`,
            [matchId]
        );
        
        if (existing.rows[0]) {
            if (existing.rows[0].is_active === 0) {
                await pool.query(
                    `UPDATE chats SET is_active = 1, closed_at = NULL WHERE id = $1`,
                    [existing.rows[0].id]
                );
            }
            return existing.rows[0].id;
        }
        
        const result = await pool.query(
            `INSERT INTO chats (match_id, is_active) VALUES ($1, 1) RETURNING id`,
            [matchId]
        );
        return result.rows[0].id;
    },
    
    getChatById: async (chatId) => {
        const result = await pool.query(`SELECT * FROM chats WHERE id = $1`, [chatId]);
        return result.rows[0];
    },
    
    getChatByMatchId: async (matchId) => {
        const result = await pool.query(`SELECT * FROM chats WHERE match_id = $1`, [matchId]);
        return result.rows[0];
    },
    
    getMatchByChatId: async (chatId) => {
        const result = await pool.query(
            `SELECT m.* FROM matches m JOIN chats c ON m.id = c.match_id WHERE c.id = $1`,
            [chatId]
        );
        return result.rows[0];
    },
    
    closeChat: async (chatId) => {
        const result = await pool.query(
            `UPDATE chats SET is_active = 0, closed_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [chatId]
        );
        return result.rowCount;
    },
    
    addMessage: async (chatId, fromUserId, message, attachment = null) => {
        const result = await pool.query(
            `INSERT INTO chat_messages (chat_id, from_user_id, message, attachment) VALUES ($1, $2, $3, $4) RETURNING id`,
            [chatId, fromUserId, message, attachment]
        );
        return result.rows[0].id;
    },
    
    getChatMessages: async (chatId) => {
        const result = await pool.query(
            `SELECT * FROM chat_messages WHERE chat_id = $1 ORDER BY sent_at ASC`,
            [chatId]
        );
        return result.rows;
    },
    
    getActiveChatByUsers: async (user1Id, user2Id) => {
        const result = await pool.query(`
            SELECT c.* FROM chats c
            JOIN matches m ON c.match_id = m.id
            WHERE ((m.user1_id = $1 AND m.user2_id = $2) OR (m.user1_id = $3 AND m.user2_id = $4))
            AND c.is_active = 1
        `, [user1Id, user2Id, user2Id, user1Id]);
        return result.rows[0];
    },
    
    addAdminLog: async (adminId, action, targetId, details) => {
        await pool.query(
            `INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES ($1, $2, $3, $4)`,
            [adminId, action, targetId, details]
        );
    },
    
    addUserLog: async (userId, action, details) => {
        await pool.query(
            `INSERT INTO user_logs (user_id, action, details) VALUES ($1, $2, $3)`,
            [userId, action, details]
        );
    },
    
    getAllUsers: async () => {
        const result = await pool.query(`SELECT * FROM users ORDER BY registered_at DESC`);
        return result.rows;
    },
    
    getAllProfiles: async () => {
        const result = await pool.query(
            `SELECT p.*, u.vk_id, u.name as user_name FROM profiles p JOIN users u ON p.user_id = u.id`
        );
        return result.rows;
    },
    
    getAllChats: async () => {
        const result = await pool.query(`
            SELECT c.*, 
                   u1.vk_id as user1_vk, u2.vk_id as user2_vk,
                   (SELECT message FROM chat_messages WHERE chat_id = c.id ORDER BY sent_at DESC LIMIT 1) as last_message
            FROM chats c
            JOIN matches m ON c.match_id = m.id
            JOIN users u1 ON m.user1_id = u1.id
            JOIN users u2 ON m.user2_id = u2.id
            ORDER BY c.created_at DESC
        `);
        return result.rows;
    },
    
    banUser: async (vkId) => {
        const result = await pool.query(`UPDATE users SET is_banned = 1 WHERE vk_id = $1`, [vkId]);
        return result.rowCount;
    },
    
    unbanUser: async (vkId) => {
        const result = await pool.query(`UPDATE users SET is_banned = 0 WHERE vk_id = $1`, [vkId]);
        return result.rowCount;
    },
    
    getStats: async () => {
        const result = await pool.query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM profiles) as total_profiles,
                (SELECT COUNT(*) FROM matches WHERE type = 'public') as public_matches,
                (SELECT COUNT(*) FROM matches WHERE type = 'anon') as anon_matches,
                (SELECT COUNT(*) FROM chats WHERE is_active = 1) as active_chats
        `);
        return result.rows[0];
    },
    
    getLastLogs: async (limit = 50) => {
        const result = await pool.query(`
            SELECT 'user' as type, user_id as actor, action, details, created_at 
            FROM user_logs 
            UNION ALL
            SELECT 'admin' as type, admin_id as actor, action, details, created_at 
            FROM admin_logs
            ORDER BY created_at DESC LIMIT $1
        `, [limit]);
        return result.rows;
    },
    
    direct: {
        run: async (sql, params) => {
            const result = await pool.query(sql, params);
            return { changes: result.rowCount };
        }
    }
};