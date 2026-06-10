const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database('./bot.db');

// Инициализация всех таблиц
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vk_id INTEGER UNIQUE,
        name TEXT,
        is_banned INTEGER DEFAULT 0,
        registered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        type TEXT CHECK(type IN ('public', 'anon')),
        gender TEXT CHECK(gender IN ('male', 'female')),
        search_gender TEXT CHECK(search_gender IN ('male', 'female', 'all')),
        name TEXT,
        age INTEGER,
        city TEXT,
        photo TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user_id INTEGER,
        to_profile_id INTEGER,
        type TEXT CHECK(type IN ('public', 'anon')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(from_user_id, to_profile_id),
        FOREIGN KEY(from_user_id) REFERENCES users(id),
        FOREIGN KEY(to_profile_id) REFERENCES profiles(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1_id INTEGER,
        user2_id INTEGER,
        type TEXT CHECK(type IN ('public', 'anon')),
        chat_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user1_id) REFERENCES users(id),
        FOREIGN KEY(user2_id) REFERENCES users(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS chats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id INTEGER,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at DATETIME,
        FOREIGN KEY(match_id) REFERENCES matches(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        from_user_id INTEGER,
        message TEXT,
        attachment TEXT,
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(chat_id) REFERENCES chats(id),
        FOREIGN KEY(from_user_id) REFERENCES users(id)
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS admin_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER,
        action TEXT,
        target_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS user_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    console.log('✅ База данных инициализирована');
});

module.exports = {
    addUser: (vk_id, name) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT OR IGNORE INTO users (vk_id, name) VALUES (?, ?)`, [vk_id, name], function(err) {
                if (err) reject(err);
                resolve(this.lastID);
            });
        });
    },
    
    getUserByVkId: (vk_id) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE vk_id = ?`, [vk_id], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    
    getUserById: (id) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM users WHERE id = ?`, [id], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    
    createProfile: (userId, type, gender, searchGender, name, age, city, photo) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO profiles (user_id, type, gender, search_gender, name, age, city, photo) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, type, gender, searchGender, name, age, city, photo],
                function(err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                });
        });
    },
    
    getProfileByUserIdAndType: (userId, type) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM profiles WHERE user_id = ? AND type = ?`, [userId, type], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    
    deleteProfile: (profileId) => {
        return new Promise((resolve, reject) => {
            db.run(`DELETE FROM profiles WHERE id = ?`, [profileId], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    },
    
    getProfilesForSearch: (currentUserId, currentProfile, age) => {
        const minAge = 18;
        const maxAge = 100;
        let searchGenderCondition = '';
        
        if (currentProfile.search_gender === 'male') {
            searchGenderCondition = "AND p.gender = 'male'";
        } else if (currentProfile.search_gender === 'female') {
            searchGenderCondition = "AND p.gender = 'female'";
        } else {
            searchGenderCondition = "";
        }
        
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT p.*, u.vk_id 
                FROM profiles p
                JOIN users u ON p.user_id = u.id
                WHERE p.user_id != ? 
                    AND p.type = ? 
                    AND p.age BETWEEN ? AND ?
                    ${searchGenderCondition}
                    AND u.is_banned = 0
                ORDER BY RANDOM()
            `, [currentUserId, currentProfile.type, minAge, maxAge], (err, rows) => {
                if (err) {
                    console.error('Ошибка getProfilesForSearch:', err);
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    },
    
    getProfilesForSearchByCity: (currentUserId, currentProfile, age, userCity) => {
        const minAge = 18;
        const maxAge = 100;
        let searchGenderCondition = '';
        
        if (currentProfile.search_gender === 'male') {
            searchGenderCondition = "AND p.gender = 'male'";
        } else if (currentProfile.search_gender === 'female') {
            searchGenderCondition = "AND p.gender = 'female'";
        } else {
            searchGenderCondition = "";
        }
        
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT p.*, u.vk_id,
                       CASE WHEN p.city = ? THEN 1 ELSE 0 END as city_match
                FROM profiles p
                JOIN users u ON p.user_id = u.id
                WHERE p.user_id != ? 
                    AND p.type = ? 
                    AND p.age BETWEEN ? AND ?
                    ${searchGenderCondition}
                    AND u.is_banned = 0
                ORDER BY city_match DESC, RANDOM()
            `, [userCity, currentUserId, currentProfile.type, minAge, maxAge], (err, rows) => {
                if (err) {
                    console.error('Ошибка getProfilesForSearchByCity:', err);
                    reject(err);
                } else {
                    console.log(`Найдено анкет: ${rows ? rows.length : 0}`);
                    resolve(rows || []);
                }
            });
        });
    },
    
    addLike: (fromUserId, toProfileId, type) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT OR IGNORE INTO likes (from_user_id, to_profile_id, type) VALUES (?, ?, ?)`,
                [fromUserId, toProfileId, type],
                function(err) {
                    if (err) reject(err);
                    resolve(this.changes > 0);
                });
        });
    },
    
    checkLikeDirect: (fromUserId, toProfileId, type) => {
        return new Promise((resolve, reject) => {
            db.get(
                `SELECT * FROM likes WHERE from_user_id = ? AND to_profile_id = ? AND type = ?`,
                [fromUserId, toProfileId, type],
                (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                }
            );
        });
    },
    
    checkMutualLike: (userId, otherUserProfileId, type) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT user_id FROM profiles WHERE id = ?`, [otherUserProfileId], (err, profile) => {
                if (err) {
                    reject(err);
                    return;
                }
                if (!profile) {
                    resolve(null);
                    return;
                }
                
                db.get(`
                    SELECT l1.* FROM likes l1
                    JOIN profiles p ON l1.to_profile_id = p.id
                    WHERE l1.from_user_id = ? 
                        AND p.user_id = ?
                        AND l1.type = ?
                `, [userId, profile.user_id, type], (err2, row) => {
                    if (err2) reject(err2);
                    resolve(row);
                });
            });
        });
    },
    
    createMatch: (user1Id, user2Id, type, chatId = null) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO matches (user1_id, user2_id, type, chat_id) VALUES (?, ?, ?, ?)`,
                [user1Id, user2Id, type, chatId],
                function(err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                });
        });
    },
    
    createChat: (matchId) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO chats (match_id) VALUES (?)`, [matchId], function(err) {
                if (err) reject(err);
                resolve(this.lastID);
            });
        });
    },
    
    getChatById: (chatId) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM chats WHERE id = ?`, [chatId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    
    getChatByMatchId: (matchId) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT * FROM chats WHERE match_id = ?`, [matchId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    
    getMatchByChatId: (chatId) => {
        return new Promise((resolve, reject) => {
            db.get(`SELECT m.* FROM matches m JOIN chats c ON m.id = c.match_id WHERE c.id = ?`, [chatId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    
    closeChat: (chatId) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE chats SET is_active = 0, closed_at = CURRENT_TIMESTAMP WHERE id = ?`, [chatId], function(err) {
                if (err) {
                    console.error('Ошибка закрытия чата:', err);
                    reject(err);
                } else {
                    console.log(`✅ Чат ${chatId} закрыт, is_active = 0, изменено строк: ${this.changes}`);
                    resolve(this.changes);
                }
            });
        });
    },
    
    addMessage: (chatId, fromUserId, message, attachment = null) => {
        return new Promise((resolve, reject) => {
            db.run(`INSERT INTO chat_messages (chat_id, from_user_id, message, attachment) VALUES (?, ?, ?, ?)`,
                [chatId, fromUserId, message, attachment],
                function(err) {
                    if (err) reject(err);
                    resolve(this.lastID);
                });
        });
    },
    
    getChatMessages: (chatId) => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY sent_at ASC`, [chatId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },
    
    getActiveChatByUsers: (user1Id, user2Id) => {
        return new Promise((resolve, reject) => {
            db.get(`
                SELECT c.* FROM chats c
                JOIN matches m ON c.match_id = m.id
                WHERE ((m.user1_id = ? AND m.user2_id = ?) OR (m.user1_id = ? AND m.user2_id = ?))
                AND c.is_active = 1
            `, [user1Id, user2Id, user2Id, user1Id], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    
    addAdminLog: (adminId, action, targetId, details) => {
        db.run(`INSERT INTO admin_logs (admin_id, action, target_id, details) VALUES (?, ?, ?, ?)`,
            [adminId, action, targetId, details]);
    },
    
    addUserLog: (userId, action, details) => {
        db.run(`INSERT INTO user_logs (user_id, action, details) VALUES (?, ?, ?)`,
            [userId, action, details]);
    },
    
    getAllUsers: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM users ORDER BY registered_at DESC`, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },
    
    getAllProfiles: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT p.*, u.vk_id, u.name as user_name FROM profiles p JOIN users u ON p.user_id = u.id`, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },
    
    getAllChats: () => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT c.*, 
                       u1.vk_id as user1_vk, u2.vk_id as user2_vk,
                       (SELECT message FROM chat_messages WHERE chat_id = c.id ORDER BY sent_at DESC LIMIT 1) as last_message
                FROM chats c
                JOIN matches m ON c.match_id = m.id
                JOIN users u1 ON m.user1_id = u1.id
                JOIN users u2 ON m.user2_id = u2.id
                ORDER BY c.created_at DESC
            `, (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },
    
    banUser: (vkId) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE users SET is_banned = 1 WHERE vk_id = ?`, [vkId], function(err) {
                if (err) reject(err);
                resolve(this.changes);
            });
        });
    },
    
    unbanUser: (vkId) => {
        return new Promise((resolve, reject) => {
            db.run(`UPDATE users SET is_banned = 0 WHERE vk_id = ?`, [vkId], function(err) {
                if (err) reject(err);
                resolve(this.changes);
            });
        });
    },
    
    getStats: () => {
        return new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    (SELECT COUNT(*) FROM users) as total_users,
                    (SELECT COUNT(*) FROM profiles) as total_profiles,
                    (SELECT COUNT(*) FROM matches WHERE type = 'public') as public_matches,
                    (SELECT COUNT(*) FROM matches WHERE type = 'anon') as anon_matches,
                    (SELECT COUNT(*) FROM chats WHERE is_active = 1) as active_chats
            `, (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    },
    
    getLastLogs: (limit = 50) => {
        return new Promise((resolve, reject) => {
            db.all(`
                SELECT 'user' as type, user_id as actor, action, details, created_at 
                FROM user_logs 
                UNION ALL
                SELECT 'admin' as type, admin_id as actor, action, details, created_at 
                FROM admin_logs
                ORDER BY created_at DESC LIMIT ?
            `, [limit], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    },
    
    // Прямой доступ к базе для операций UPDATE/DELETE
    direct: {
        run: (sql, params) => {
            return new Promise((resolve, reject) => {
                db.run(sql, params, function(err) {
                    if (err) reject(err);
                    resolve(this);
                });
            });
        }
    }
};