const db = require('../database');
const config = require('../config');
const keyboards = require('../keyboards');

// Проверка, является ли пользователь админом
function isAdmin(userId) {
    return userId == config.adminId;
}

// Главная админ-панель
async function handleAdminCommand(context, vk, command, args) {
    const userId = context.senderId;
    
    if (!isAdmin(userId)) {
        await context.send('❌ У вас нет доступа к админ-панели.');
        return;
    }
    
    await db.addAdminLog(userId, command, null, args ? JSON.stringify(args) : null);
    
    switch (command) {
        case 'stats':
            await showStats(context);
            break;
        case 'users':
            await showUsers(context);
            break;
        case 'profiles':
            await showProfiles(context);
            break;
        case 'chats':
            await showChats(context);
            break;
        case 'chat':
            if (args && args[0]) {
                await showChatMessages(context, args[0]);
            } else {
                await context.send('ℹ️ Использование: /admin chat <id_чата>');
            }
            break;
        case 'logs':
            await showLogs(context);
            break;
        case 'ban':
            if (args && args[0]) {
                await banUser(context, args[0]);
            } else {
                await context.send('ℹ️ Использование: /admin ban <vk_id>');
            }
            break;
        case 'unban':
            if (args && args[0]) {
                await unbanUser(context, args[0]);
            } else {
                await context.send('ℹ️ Использование: /admin unban <vk_id>');
            }
            break;
        case 'broadcast':
            if (args && args.join(' ')) {
                await broadcast(context, vk, args.join(' '));
            } else {
                await context.send('ℹ️ Использование: /admin broadcast <текст сообщения>');
            }
            break;
        default:
            await showAdminHelp(context);
    }
}

async function showAdminHelp(context) {
    const help = `
🔐 **АДМИН-ПАНЕЛЬ**

📊 **Статистика**
/admin stats - общая статистика

👥 **Пользователи**
/admin users - список всех пользователей

📋 **Анкеты**
/admin profiles - все анкеты

💬 **Чаты**
/admin chats - список всех чатов
/admin chat <id> - просмотреть переписку чата

📜 **Логи**
/admin logs - последние 50 действий

🚫 **Баны**
/admin ban <vk_id> - заблокировать пользователя
/admin unban <vk_id> - разблокировать

📢 **Рассылка**
/admin broadcast <текст> - отправить всем пользователям
`;
    
    await context.send(help, {
        keyboard: JSON.parse(keyboards.mainMenu)
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
    
    await context.send(message);
}

async function showUsers(context) {
    const users = await db.getAllUsers();
    
    if (!users || users.length === 0) {
        await context.send('Нет пользователей');
        return;
    }
    
    let message = '👥 **СПИСОК ПОЛЬЗОВАТЕЛЕЙ**\n\n';
    
    for (const user of users.slice(0, 20)) {
        message += `ID: ${user.vk_id}\n`;
        message += `Имя: ${user.name}\n`;
        message += `Статус: ${user.is_banned ? '🚫 Заблокирован' : '✅ Активен'}\n`;
        message += `Регистрация: ${user.registered_at}\n`;
        message += `---\n`;
    }
    
    if (users.length > 20) {
        message += `\n... и ещё ${users.length - 20} пользователей`;
    }
    
    await context.send(message);
}

async function showProfiles(context) {
    const profiles = await db.getAllProfiles();
    
    if (!profiles || profiles.length === 0) {
        await context.send('Нет анкет');
        return;
    }
    
    let message = '📋 **ВСЕ АНКЕТЫ**\n\n';
    
    for (const profile of profiles.slice(0, 15)) {
        message += `ID анкеты: ${profile.id}\n`;
        message += `Пользователь: ${profile.user_name} (${profile.vk_id})\n`;
        message += `Тип: ${profile.type === 'public' ? '📋 Обычная' : '🔞 Анонимная'}\n`;
        message += `Имя: ${profile.name}\n`;
        message += `Возраст: ${profile.age}\n`;
        message += `Город: ${profile.city}\n`;
        message += `Ищет: ${getGenderText(profile.search_gender)}\n`;
        message += `Фото: ${profile.photo}\n`;
        message += `---\n`;
    }
    
    if (profiles.length > 15) {
        message += `\n... и ещё ${profiles.length - 15} анкет`;
    }
    
    await context.send(message);
}

async function showChats(context) {
    const chats = await db.getAllChats();
    
    if (!chats || chats.length === 0) {
        await context.send('Нет чатов');
        return;
    }
    
    let message = '💬 **СПИСОК ЧАТОВ**\n\n';
    
    for (const chat of chats.slice(0, 15)) {
        message += `ID чата: ${chat.id}\n`;
        message += `Участники: ${chat.user1_vk} и ${chat.user2_vk}\n`;
        message += `Статус: ${chat.is_active ? '🟢 Активен' : '🔴 Закрыт'}\n`;
        message += `Создан: ${chat.created_at}\n`;
        if (chat.last_message) {
            message += `Последнее сообщение: ${chat.last_message.substring(0, 50)}...\n`;
        }
        message += `---\n`;
    }
    
    if (chats.length > 15) {
        message += `\n... и ещё ${chats.length - 15} чатов`;
    }
    
    message += `\n💡 Для просмотра переписки: /admin chat <id_чата>`;
    
    await context.send(message);
}

async function showChatMessages(context, chatId) {
    const messages = await db.getChatMessages(parseInt(chatId));
    const chats = await db.getAllChats();
    const chat = chats.find(c => c.id == chatId);
    
    if (!chat) {
        await context.send('❌ Чат не найден');
        return;
    }
    
    let message = `💬 **ПЕРЕПИСКА ЧАТА #${chatId}**\n`;
    message += `Участники: ${chat.user1_vk} и ${chat.user2_vk}\n`;
    message += `Статус: ${chat.is_active ? 'Активен' : 'Закрыт'}\n`;
    message += `Создан: ${chat.created_at}\n`;
    message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    if (!messages || messages.length === 0) {
        message += `Нет сообщений в этом чате`;
    } else {
        for (const msg of messages.slice(-30)) {
            const user = await db.getUserById(msg.from_user_id);
            const userName = user ? user.vk_id : msg.from_user_id;
            message += `[${msg.sent_at}] ${userName}:\n`;
            if (msg.message) message += `${msg.message}\n`;
            if (msg.attachment) message += `[Вложение: ${msg.attachment}]\n`;
            message += `---\n`;
        }
    }
    
    if (message.length > 4000) {
        const parts = message.match(/[\s\S]{1,4000}/g);
        for (const part of parts) {
            await context.send(part);
        }
    } else {
        await context.send(message);
    }
}

async function showLogs(context) {
    const logs = await db.getLastLogs(50);
    
    if (!logs || logs.length === 0) {
        await context.send('Нет логов');
        return;
    }
    
    let message = '📜 **ПОСЛЕДНИЕ 50 ДЕЙСТВИЙ**\n\n';
    
    for (const log of logs) {
        const actorType = log.type === 'admin' ? '👑 Админ' : '👤 Пользователь';
        message += `${actorType} (${log.actor}): ${log.action}\n`;
        if (log.details) message += `  └ ${log.details}\n`;
        message += `  📅 ${log.created_at}\n`;
        message += `---\n`;
    }
    
    if (message.length > 4000) {
        const parts = message.match(/[\s\S]{1,4000}/g);
        for (const part of parts) {
            await context.send(part);
        }
    } else {
        await context.send(message);
    }
}

async function banUser(context, vkId) {
    const result = await db.banUser(parseInt(vkId));
    
    if (result) {
        await context.send(`✅ Пользователь ${vkId} заблокирован`);
        await db.addAdminLog(context.senderId, 'ban', vkId, 'Заблокирован пользователь');
    } else {
        await context.send(`❌ Пользователь ${vkId} не найден`);
    }
}

async function unbanUser(context, vkId) {
    const result = await db.unbanUser(parseInt(vkId));
    
    if (result) {
        await context.send(`✅ Пользователь ${vkId} разблокирован`);
        await db.addAdminLog(context.senderId, 'unban', vkId, 'Разблокирован пользователь');
    } else {
        await context.send(`❌ Пользователь ${vkId} не найден`);
    }
}

async function broadcast(context, vk, message) {
    const users = await db.getAllUsers();
    
    if (!users || users.length === 0) {
        await context.send('Нет пользователей для рассылки');
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
                message: `📢 **РАССЫЛКА ОТ АДМИНА**\n\n${message}`,
                random_id: Math.floor(Math.random() * 1000000000)
            });
            success++;
            await helpers.sleep(100);
        } catch (err) {
            failed++;
            console.error(`Failed to send to ${user.vk_id}:`, err);
        }
    }
    
    await context.send(`✅ Рассылка завершена!\n📨 Отправлено: ${success}\n❌ Не доставлено: ${failed}`);
    await db.addAdminLog(context.senderId, 'broadcast', null, `Рассылка: ${message.substring(0, 100)}`);
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
    isAdmin,
    handleAdminCommand
};