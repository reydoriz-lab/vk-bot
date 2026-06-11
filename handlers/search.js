const db = require('../database');

const searchStates = new Map();

async function handlePublicSearch(context, vk) {
    const userId = context.senderId;
    const user = await db.getUserByVkId(userId);
    
    if (!user) {
        await context.send('❌ Ошибка. Напишите /start');
        return;
    }
    
    const profile = await db.getProfileByUserIdAndType(user.id, 'public');
    
    if (!profile) {
        const mainKeyboard = JSON.stringify({
            one_time: false,
            buttons: [
                [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
            ]
        });
        await context.send('❌ У тебя нет обычной анкеты!\n\nСоздай её через "✏️ Создать анкету"', {
            keyboard: mainKeyboard
        });
        return;
    }
    
    const profiles = await db.getProfilesForSearchByCity(user.id, profile, profile.age, profile.city);
    
    if (!profiles || profiles.length === 0) {
        const mainKeyboard = JSON.stringify({
            one_time: false,
            buttons: [
                [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
            ]
        });
        await context.send('😔 По твоим критериям пока никого не найдено.\n\nПопробуй позже или измени критерии поиска (создав новую анкету)', {
            keyboard: mainKeyboard
        });
        return;
    }
    
    searchStates.set(userId, {
        type: 'public',
        profiles: profiles,
        currentIndex: 0,
        currentProfile: profiles[0]
    });
    
    await showNextProfile(context, vk, userId);
}

async function handleAnonSearch(context, vk) {
    const userId = context.senderId;
    const user = await db.getUserByVkId(userId);
    
    if (!user) {
        await context.send('❌ Ошибка. Напишите /start');
        return;
    }
    
    const profile = await db.getProfileByUserIdAndType(user.id, 'anon');
    
    if (!profile) {
        const mainKeyboard = JSON.stringify({
            one_time: false,
            buttons: [
                [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
            ]
        });
        await context.send('❌ У тебя нет анонимной анкеты!\n\nСоздай её через "✏️ Создать анкету"', {
            keyboard: mainKeyboard
        });
        return;
    }
    
    const profiles = await db.getProfilesForSearchByCity(user.id, profile, profile.age, profile.city);
    
    if (!profiles || profiles.length === 0) {
        const mainKeyboard = JSON.stringify({
            one_time: false,
            buttons: [
                [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
            ]
        });
        await context.send('😔 По твоим критериям пока никого не найдено.\n\nПопробуй позже', {
            keyboard: mainKeyboard
        });
        return;
    }
    
    searchStates.set(userId, {
        type: 'anon',
        profiles: profiles,
        currentIndex: 0,
        currentProfile: profiles[0]
    });
    
    await showNextProfile(context, vk, userId);
}

async function showNextProfile(context, vk, userId) {
    const searchState = searchStates.get(userId);
    if (!searchState) return;
    
    const { profiles, currentIndex, type } = searchState;
    
    if (currentIndex >= profiles.length) {
        const mainKeyboard = JSON.stringify({
            one_time: false,
            buttons: [
                [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
            ]
        });
        await context.send('🏁 Ты просмотрел(а) все анкеты!\n\nНажми поиск снова, чтобы найти новых людей.', {
            keyboard: mainKeyboard
        });
        searchStates.delete(userId);
        return;
    }
    
    const profile = profiles[currentIndex];
    const isAnon = type === 'anon';
    
    let message = isAnon ? '🔞 АНОНИМНЫЙ ПОИСК\n\n' : '🔍 ОБЫЧНЫЙ ПОИСК\n\n';
    message += `📝 Имя: ${profile.name}\n`;
    message += `🎂 Возраст: ${profile.age}\n`;
    if (!isAnon) {
        message += `🏙 Город: ${profile.city}\n`;
    }
    if (profile.city === profiles[0]?.city && currentIndex === 0 && !isAnon) {
        message += `\n⭐ Из твоего города!`;
    }
    message += `\n\n❤️ Лайк - если нравится\n👎 Дизлайк - если нет`;
    
    let searchKeyboard;
    if (isAnon) {
        searchKeyboard = JSON.stringify({
            one_time: true,
            buttons: [
                [{ action: { type: "text", label: "❤️ Лайк" }, color: "positive" }],
                [{ action: { type: "text", label: "👎 Дизлайк" }, color: "negative" }],
                [{ action: { type: "text", label: "💬 Мои чаты" }, color: "secondary" }],
                [{ action: { type: "text", label: "🚫 Закончить поиск" }, color: "secondary" }]
            ]
        });
    } else {
        searchKeyboard = JSON.stringify({
            one_time: true,
            buttons: [
                [{ action: { type: "text", label: "❤️ Лайк" }, color: "positive" }],
                [{ action: { type: "text", label: "👎 Дизлайк" }, color: "negative" }],
                [{ action: { type: "text", label: "🚫 Закончить поиск" }, color: "secondary" }]
            ]
        });
    }
    
    // Обновляем currentProfile в состоянии
    searchState.currentProfile = profile;
    searchStates.set(userId, searchState);
    
    if (profile.photo && profile.photo !== 'undefined' && profile.photo !== 'null' && profile.photo !== '') {
        await context.send(message, {
            attachment: profile.photo,
            keyboard: searchKeyboard
        });
    } else {
        await context.send(message, {
            keyboard: searchKeyboard
        });
    }
}

async function handleLike(context, vk) {
    const userId = context.senderId;
    const searchState = searchStates.get(userId);
    
    if (!searchState) {
        const mainKeyboard = JSON.stringify({
            one_time: false,
            buttons: [
                [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
            ]
        });
        await context.send('❌ Сначала начни поиск!', {
            keyboard: mainKeyboard
        });
        return;
    }
    
    const { currentProfile, type, profiles, currentIndex } = searchState;
    
    console.log(`=== ЛАЙК ===`);
    console.log(`Текущий пользователь (кто ставит лайк): ${userId}`);
    console.log(`VK ID пользователя для лайка: ${currentProfile.vk_id}`);
    
    const user = await db.getUserByVkId(userId);
    const likedUser = await db.getUserByVkId(currentProfile.vk_id);
    
    if (!user || !likedUser) {
        console.log('Ошибка: пользователь не найден');
        await context.send('❌ Ошибка');
        await stopSearch(context, userId);
        return;
    }
    
    await db.addLike(user.id, currentProfile.id, type);
    await db.addUserLog(userId, 'like', `${type === 'public' ? 'Обычный' : 'Анонимный'} лайк пользователю ${currentProfile.vk_id}`);
    
    const senderProfile = await db.getProfileByUserIdAndType(user.id, type);
    if (senderProfile) {
        let notificationMessage = `❤️ ВАМ КТО-ТО ПОСТАВИЛ ЛАЙК! ❤️\n\n`;
        notificationMessage += `👤 Имя: ${senderProfile.name}\n`;
        notificationMessage += `🎂 Возраст: ${senderProfile.age}\n`;
        if (type === 'public') {
            notificationMessage += `🏙 Город: ${senderProfile.city}\n`;
        }
        notificationMessage += `\nЧто делаем?`;
        
        const likeResponseKeyboard = JSON.stringify({
            one_time: true,
            buttons: [
                [{ action: { type: "text", label: `❤️ Взаимный лайк #${userId}#${type}` }, color: "positive" }],
                [{ action: { type: "text", label: "👎 Отклонить" }, color: "negative" }]
            ]
        });
        
        try {
            if (senderProfile.photo) {
                await vk.api.messages.send({
                    user_id: currentProfile.vk_id,
                    message: notificationMessage,
                    attachment: senderProfile.photo,
                    keyboard: likeResponseKeyboard,
                    random_id: Math.floor(Math.random() * 1000000000)
                });
            } else {
                await vk.api.messages.send({
                    user_id: currentProfile.vk_id,
                    message: notificationMessage,
                    keyboard: likeResponseKeyboard,
                    random_id: Math.floor(Math.random() * 1000000000)
                });
            }
            console.log(`Уведомление о лайке отправлено пользователю ${currentProfile.vk_id}`);
        } catch (err) {
            console.error('Ошибка отправки уведомления о лайке:', err);
        }
    }
    
    const likeCheck = await db.checkLikeDirect(likedUser.id, currentProfile.id, type);
    console.log(`Взаимный лайк: ${likeCheck ? 'ЕСТЬ' : 'НЕТ'}`);
    
    if (likeCheck) {
        console.log('=== МЭТЧ! ===');
        await db.addUserLog(userId, 'match', `${type === 'public' ? 'Обычный' : 'Анонимный'} мэтч с ${currentProfile.vk_id}`);
        await db.addUserLog(currentProfile.vk_id, 'match', `${type === 'public' ? 'Обычный' : 'Анонимный'} мэтч с ${userId}`);
        
        if (type === 'public') {
            await context.send(`💕 ВЗАИМНАЯ СИМПАТИЯ! 💕\n\nСсылка на страницу: vk.com/id${currentProfile.vk_id}\n\nМожешь написать человеку в личные сообщения!`);
            
            await vk.api.messages.send({
                user_id: currentProfile.vk_id,
                message: `💕 ВЗАИМНАЯ СИМПАТИЯ! 💕\n\nСсылка на страницу: vk.com/id${userId}\n\nМожешь написать человеку в личные сообщения!`,
                random_id: Math.floor(Math.random() * 1000000000)
            });
            
            await db.createMatch(user.id, likedUser.id, 'public');
        } else {
            const matchId = await db.createMatch(user.id, likedUser.id, 'anon');
            const chatId = await db.createChat(matchId);
            
            if (!global.userChats) global.userChats = new Map();
            global.userChats.set(`${userId}_${currentProfile.vk_id}`, chatId);
            global.userChats.set(`${currentProfile.vk_id}_${userId}`, chatId);
            
            const matchKeyboard = JSON.stringify({
                one_time: true,
                buttons: [
                    [{ action: { type: "text", label: "💬 Перейти в чат" }, color: "primary" }],
                    [{ action: { type: "text", label: "🔙 В главное меню" }, color: "secondary" }]
                ]
            });
            
            await context.send(`💕 ВЗАИМНАЯ СИМПАТИЯ! 💕\n\nУ вас анонимный мэтч! Нажми "Перейти в чат" чтобы начать общение.`, {
                keyboard: matchKeyboard
            });
            
            await vk.api.messages.send({
                user_id: currentProfile.vk_id,
                message: `💕 ВЗАИМНАЯ СИМПАТИЯ! 💕\n\nУ вас анонимный мэтч! Нажми "Перейти в чат" чтобы начать общение.`,
                keyboard: matchKeyboard,
                random_id: Math.floor(Math.random() * 1000000000)
            });
        }
        
        // Очищаем состояние поиска после мэтча
        searchStates.delete(userId);
        return;
    }
    
    // Переходим к следующей анкете
    const nextIndex = currentIndex + 1;
    if (nextIndex < profiles.length) {
        searchState.currentIndex = nextIndex;
        searchState.currentProfile = profiles[nextIndex];
        searchStates.set(userId, searchState);
        await showNextProfile(context, vk, userId);
    } else {
        await context.send('✅ Лайк поставлен! Ищем дальше...');
        searchState.currentIndex++;
        await showNextProfile(context, vk, userId);
    }
}

async function handleDislike(context, vk) {
    const userId = context.senderId;
    const searchState = searchStates.get(userId);
    
    if (!searchState) {
        const mainKeyboard = JSON.stringify({
            one_time: false,
            buttons: [
                [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
            ]
        });
        await context.send('❌ Сначала начни поиск!', {
            keyboard: mainKeyboard
        });
        return;
    }
    
    const { profiles, currentIndex } = searchState;
    
    // Переходим к следующей анкете
    const nextIndex = currentIndex + 1;
    if (nextIndex < profiles.length) {
        searchState.currentIndex = nextIndex;
        searchState.currentProfile = profiles[nextIndex];
        searchStates.set(userId, searchState);
        await showNextProfile(context, vk, userId);
    } else {
        await context.send('👎 Пропускаем...');
        searchState.currentIndex++;
        await showNextProfile(context, vk, userId);
    }
}

async function stopSearch(context, userId) {
    searchStates.delete(userId);
    const mainKeyboard = JSON.stringify({
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
            [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
            [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
            [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
        ]
    });
    await context.send('🔍 Поиск завершён. Возвращаю в главное меню.', {
        keyboard: mainKeyboard
    });
}

module.exports = {
    handlePublicSearch,
    handleAnonSearch,
    handleLike,
    handleDislike,
    stopSearch,
    searchStates
};