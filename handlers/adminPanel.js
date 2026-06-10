const db = require('../database');
const config = require('../config');
const keyboards = require('../keyboards');

// Хранилище состояния пагинации для админа
const adminStates = new Map();

async function showAdminPanel(context) {
    const adminPanelText = `
🔐 **АДМИН-ПАНЕЛЬ**

Выберите действие:

📊 **Статистика** - общая статистика бота
👥 **Пользователи** - список пользователей
📋 **Анкеты** - все анкеты
🚫 **Бан/Разбан** - заблокировать/разблокировать пользователя
📢 **Рассылка** - отправить сообщение всем
`;

    await context.send(adminPanelText, {
        keyboard: JSON.stringify(keyboards.adminPanel)
    });
}

async function showStats(context) {
    const stats = await db.getStats();
    
    const message = `
📊 **СТАТИСТИКА БОТА**

👥 Пользователей: ${stats.total_users || 0}
📋 Всего анкет: ${stats.total_profiles || 0}
💕 Обычных мэтчей: ${stats.public_matches || 0}
🔞 Анонимных мэтчей: ${stats.anon_matches || 0}
💬 Активных чатов: ${stats.active_chats || 0}
`;

    await context.send(message, {
        keyboard: JSON.stringify(keyboards.adminPanel)
    });
}

async function showUsers(context, page = 0) {
    const users = await db.getAllUsers();
    const usersPerPage = 5;
    const totalPages = Math.ceil(users.length / usersPerPage);
    
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;
    
    const start = page * usersPerPage;
    const end = start + usersPerPage;
    const pageUsers = users.slice(start, end);
    
    let message = `👥 **ПОЛЬЗОВАТЕЛИ** (страница ${page + 1}/${totalPages})\n\n`;
    
    for (const user of pageUsers) {
        message += `🔹 ID: ${user.vk_id}\n`;
        message += `🔹 Ссылка: vk.com/id${user.vk_id}\n`;
        message += `🔹 Имя: ${user.name}\n`;
        message += `🔹 Статус: ${user.is_banned ? '🚫 Заблокирован' : '✅ Активен'}\n`;
        message += `🔹 Регистрация: ${user.registered_at}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    // Сохраняем состояние пагинации
    adminStates.set(context.senderId, {
        module: 'users',
        page: page,
        totalPages: totalPages
    });
    
    await context.send(message, {
        keyboard: JSON.stringify(keyboards.adminUsersNav)
    });
}

async function showProfiles(context, page = 0) {
    const profiles = await db.getAllProfiles();
    const profilesPerPage = 3;
    const totalPages = Math.ceil(profiles.length / profilesPerPage);
    
    if (page >= totalPages) page = totalPages - 1;
    if (page < 0) page = 0;
    
    const start = page * profilesPerPage;
    const end = start + profilesPerPage;
    const pageProfiles = profiles.slice(start, end);
    
    let message = `📋 **АНКЕТЫ** (страница ${page + 1}/${totalPages})\n\n`;
    
    for (const profile of pageProfiles) {
        message += `🆔 ID анкеты: ${profile.id}\n`;
        message += `👤 Пользователь: ${profile.user_name}\n`;
        message += `🔗 Ссылка: vk.com/id${profile.vk_id}\n`;
        message += `📝 Тип: ${profile.type === 'public' ? 'Обычная' : 'Анонимная'}\n`;
        message += `📛 Имя: ${profile.name}\n`;
        message += `🎂 Возраст: ${profile.age}\n`;
        message += `🏙 Город: ${profile.city}\n`;
        message += `🔍 Ищет: ${getGenderText(profile.search_gender)}\n`;
        message += `━━━━━━━━━━━━━━━━━━━━━\n`;
    }
    
    adminStates.set(context.senderId, {
        module: 'profiles',
        page: page,
        totalPages: totalPages
    });
    
    await context.send(message, {
        keyboard: JSON.stringify(keyboards.adminProfilesNav)
    });
}

async function showBanMenu(context) {
    const message = `
🚫 **БАН / РАЗБАН ПОЛЬЗОВАТЕЛЯ**

Введи ID пользователя (число) для блокировки или разблокировки.

Пример: \`286888243\`

Пользователь будет заблокирован, если он активен, и разблокирован, если заблокирован.
`;

    await context.send(message, {
        keyboard: JSON.stringify(keyboards.adminBanMenu)
    });
    
    // Устанавливаем состояние ожидания ввода ID
    adminStates.set(context.senderId, {
        module: 'waiting_ban_id'
    });
}

async function handleBanInput(context, text) {
    const vkId = parseInt(text);
    if (isNaN(vkId)) {
        await context.send('❌ Введи корректный числовой ID!', {
            keyboard: JSON.stringify(keyboards.adminBanMenu)
        });
        return;
    }
    
    const user = await db.getUserByVkId(vkId);
    if (!user) {
        await context.send(`❌ Пользователь с ID ${vkId} не найден`, {
            keyboard: JSON.stringify(keyboards.adminBanMenu)
        });
        return;
    }
    
    if (user.is_banned) {
        await db.unbanUser(vkId);
        await context.send(`✅ Пользователь ${vkId} (${user.name}) РАЗБЛОКИРОВАН`, {
            keyboard: JSON.stringify(keyboards.adminPanel)
        });
        await db.addAdminLog(context.senderId, 'unban', vkId, `Разблокирован пользователь ${user.name}`);
    } else {
        await db.banUser(vkId);
        await context.send(`✅ Пользователь ${vkId} (${user.name}) ЗАБЛОКИРОВАН`, {
            keyboard: JSON.stringify(keyboards.adminPanel)
        });
        await db.addAdminLog(context.senderId, 'ban', vkId, `Заблокирован пользователь ${user.name}`);
    }
    
    adminStates.delete(context.senderId);
}

async function showBroadcastMenu(context) {
    const message = `
📢 **РАССЫЛКА**

Введи текст сообщения для рассылки всем пользователям.

Сообщение будет отправлено ВСЕМ активным пользователям бота.
`;

    await context.send(message, {
        keyboard: JSON.stringify(keyboards.adminBroadcastMenu)
    });
    
    adminStates.set(context.senderId, {
        module: 'waiting_broadcast_text'
    });
}

async function handleBroadcastInput(context, vk, text) {
    const users = await db.getAllUsers();
    
    if (!users || users.length === 0) {
        await context.send('❌ Нет пользователей для рассылки', {
            keyboard: JSON.stringify(keyboards.adminPanel)
        });
        adminStates.delete(context.senderId);
        return;
    }
    
    await context.send(`📢 Начинаю рассылку ${users.length} пользователям...`);
    
    let success = 0;
    let failed = 0;
    
    for (const user of users) {
        if (user.is_banned) continue;
        
        try {
            await vk.api.messages.send({
                user_id: user.vk_id,
                message: `📢 **РАССЫЛКА ОТ АДМИНА**\n\n${text}`,
                random_id: Math.floor(Math.random() * 1000000000)
            });
            success++;
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
            failed++;
            console.error(`Failed to send to ${user.vk_id}:`, err);
        }
    }
    
    await context.send(`✅ Рассылка завершена!\n📨 Отправлено: ${success}\n❌ Не доставлено: ${failed}`, {
        keyboard: JSON.stringify(keyboards.adminPanel)
    });
    
    await db.addAdminLog(context.senderId, 'broadcast', null, `Рассылка: ${text.substring(0, 100)}`);
    adminStates.delete(context.senderId);
}

function getGenderText(gender) {
    switch(gender) {
        case 'male': return '👨 Мужчин';
        case 'female': return '👩 Женщин';
        case 'all': return '👥 Всех';
        default: return 'Всех';
    }
}

module.exports = {
    showAdminPanel,
    showStats,
    showUsers,
    showProfiles,
    showBanMenu,
    handleBanInput,
    showBroadcastMenu,
    handleBroadcastInput,
    adminStates
};