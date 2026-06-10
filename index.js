const { VK } = require('vk-io');
const express = require('express');
const config = require('./config');
const db = require('./database');
const helpers = require('./utils/helpers');
const keyboards = require('./keyboards');

const app = express();
const PORT = process.env.PORT || 3000;

const startHandler = require('./handlers/start');
const profileHandler = require('./handlers/profile');
const searchHandler = require('./handlers/search');
const chatHandler = require('./handlers/chat');
const adminHandler = require('./handlers/admin');
const adminPanel = require('./handlers/adminPanel');

helpers.ensureTempFolder();

const vk = new VK({
    token: config.token,
    apiVersion: config.apiVersion
});

// Функция для получения главной клавиатуры (с админ-кнопкой или без)
function getMainKeyboard(userId) {
    if (userId == config.adminId) {
        return JSON.stringify(keyboards.adminButton);
    }
    return JSON.stringify(keyboards.mainMenu);
}

async function startBot() {
    try {
        const response = await vk.api.groups.getById({ group_id: config.groupId });
        let groupName = 'VK Bot';
        if (response && response.length > 0 && response[0]) {
            groupName = response[0].name;
        }
        
        console.log(`✅ Бот "${groupName}" запущен!`);
        console.log(`📊 Админ ID: ${config.adminId}`);
        
        // ========== ВЕБ-СЕРВЕР ДЛЯ RENDER ==========
        app.get('/', (req, res) => {
            res.send('✅ VK Bot is alive!');
        });
        
        app.listen(PORT, () => {
            console.log(`🌐 Веб-сервер запущен на порту ${PORT}`);
        });
        // ========== КОНЕЦ ВЕБ-СЕРВЕРА ==========
        
        vk.updates.on('message_new', async (context) => {
            await handleMessage(context);
        });
        
        await vk.updates.start();
        console.log('🟢 Бот слушает сообщения...');
        
        setInterval(() => {
            helpers.cleanOldTempFiles();
        }, 60 * 60 * 1000);
        
    } catch (error) {
        console.error('❌ Ошибка запуска бота:', error);
    }
}

async function handleMessage(context) {
    const userId = context.senderId;
    const text = context.text || '';
    
    const user = await db.getUserByVkId(userId);
    if (user && user.is_banned === 1) {
        await context.send('🚫 Ваш аккаунт заблокирован в боте.');
        return;
    }
    
    // ========== ОБРАБОТКА АДМИН-ПАНЕЛИ (КНОПКИ) ==========
    if (userId == config.adminId) {
        const adminState = adminPanel.adminStates.get(userId);
        
        if (text === '🔙 Назад в админку') {
            adminPanel.adminStates.delete(userId);
            await adminPanel.showAdminPanel(context);
            return;
        }
        
        if (adminState && adminState.module === 'waiting_ban_id') {
            await adminPanel.handleBanInput(context, text);
            return;
        }
        
        if (adminState && adminState.module === 'waiting_broadcast_text') {
            await adminPanel.handleBroadcastInput(context, vk, text);
            return;
        }
        
        if (adminState && adminState.module === 'users') {
            if (text === '⬅️ Предыдущие') {
                await adminPanel.showUsers(context, adminState.page - 1);
                return;
            }
            if (text === '➡️ Следующие') {
                await adminPanel.showUsers(context, adminState.page + 1);
                return;
            }
            if (text === '🔙 Назад в админку') {
                await adminPanel.showAdminPanel(context);
                return;
            }
        }
        
        if (adminState && adminState.module === 'profiles') {
            if (text === '⬅️ Предыдущие') {
                await adminPanel.showProfiles(context, adminState.page - 1);
                return;
            }
            if (text === '➡️ Следующие') {
                await adminPanel.showProfiles(context, adminState.page + 1);
                return;
            }
            if (text === '🔙 Назад в админку') {
                await adminPanel.showAdminPanel(context);
                return;
            }
        }
        
        if (text === '👑 Админ-панель') {
            await adminPanel.showAdminPanel(context);
            return;
        }
        
        if (text === '📊 Статистика') {
            await adminPanel.showStats(context);
            return;
        }
        
        if (text === '👥 Пользователи') {
            await adminPanel.showUsers(context, 0);
            return;
        }
        
        if (text === '📋 Анкеты') {
            await adminPanel.showProfiles(context, 0);
            return;
        }
        
        if (text === '🚫 Бан/Разбан') {
            await adminPanel.showBanMenu(context);
            return;
        }
        
        if (text === '📢 Рассылка') {
            await adminPanel.showBroadcastMenu(context);
            return;
        }
    }
    
    // ========== ОБРАБОТКА РЕДАКТИРОВАНИЯ АНКЕТЫ ==========
    
    if (text === '📋 Обычную анкету' || text === '🔞 Анонимную анкету') {
        const result = await startHandler.handleEditChoice(context, vk, text);
        if (result) return;
    }
    
    if (text === '✏️ Редактировать анкету') {
        await startHandler.handleEditProfile(context, vk);
        return;
    }
    
    // ========== ОБРАБОТКА УДАЛЕНИЯ АНКЕТЫ ==========
    if (text === '🗑 Удалить анкету') {
        await startHandler.handleDeleteProfile(context, vk);
        return;
    }
    if (text === '🗑 Обычную анкету') {
        await startHandler.handleDeleteProfile(context, vk, 'public');
        return;
    }
    if (text === '🔞 Анонимную анкету') {
        await startHandler.handleDeleteProfile(context, vk, 'anon');
        return;
    }
    
    // ========== ОБРАБОТКА СОСТОЯНИЙ РЕДАКТИРОВАНИЯ ==========
    const editState = startHandler.userStates.get(userId);
    if (editState && editState.step === startHandler.EditSteps?.CHOOSE_FIELD) {
        const result = await startHandler.handleEditFieldChoice(context, vk, text);
        if (result) return;
    }
    
    if (editState && editState.step === startHandler.EditSteps?.EDIT_NAME) {
        const result = await startHandler.handleEditName(context, vk, text);
        if (result) return;
    }
    
    if (editState && editState.step === startHandler.EditSteps?.EDIT_AGE) {
        const result = await startHandler.handleEditAge(context, vk, text);
        if (result) return;
    }
    
    if (editState && editState.step === startHandler.EditSteps?.EDIT_CITY) {
        const result = await startHandler.handleEditCity(context, vk, text);
        if (result) return;
    }
    
    if (editState && editState.step === startHandler.EditSteps?.EDIT_PHOTO) {
        if (context.attachments && context.attachments.length > 0) {
            const result = await startHandler.handleEditPhoto(context, vk);
            if (result) return;
        } else {
            await context.send('📸 Пожалуйста, отправь фото.');
            return;
        }
    }
    
    if (editState && editState.step === startHandler.EditSteps?.EDIT_GENDER) {
        const result = await startHandler.handleEditGender(context, vk, text);
        if (result) return;
    }
    
    if (editState && editState.step === startHandler.EditSteps?.EDIT_SEARCH_GENDER) {
        const result = await startHandler.handleEditSearchGender(context, vk, text);
        if (result) return;
    }
    
    // ========== ОБРАБОТКА ВЗАИМНОГО ЛАЙКА ==========
    if (text && text.startsWith('❤️ Взаимный лайк #')) {
        const parts = text.split('#');
        const firstLikerId = parseInt(parts[1]);
        let likeType = null;
        if (parts[2]) {
            likeType = parts[2];
        }
        
        console.log(`=== ВЗАИМНЫЙ ЛАЙК ===`);
        console.log(`Текущий пользователь (кто отвечает): ${userId}`);
        console.log(`Пользователь, который лайкнул первым: ${firstLikerId}`);
        console.log(`Тип лайка из кнопки: ${likeType}`);
        
        const currentUser = await db.getUserByVkId(userId);
        const firstLiker = await db.getUserByVkId(firstLikerId);
        
        if (!currentUser || !firstLiker) {
            console.log('Пользователи не найдены');
            await context.send('❌ Ошибка: пользователи не найдены');
            return;
        }
        
        let profileType = likeType;
        let currentProfile = null;
        
        if (profileType === 'public') {
            currentProfile = await db.getProfileByUserIdAndType(currentUser.id, 'public');
        } else if (profileType === 'anon') {
            currentProfile = await db.getProfileByUserIdAndType(currentUser.id, 'anon');
        }
        
        if (!currentProfile) {
            const currentPublicProfile = await db.getProfileByUserIdAndType(currentUser.id, 'public');
            const currentAnonProfile = await db.getProfileByUserIdAndType(currentUser.id, 'anon');
            currentProfile = currentPublicProfile || currentAnonProfile;
            profileType = currentPublicProfile ? 'public' : 'anon';
        }
        
        const firstLikerProfile = await db.getProfileByUserIdAndType(firstLiker.id, profileType);
        
        if (!currentProfile || !firstLikerProfile) {
            console.log('Анкеты не найдены');
            await context.send('❌ Ошибка: анкеты не найдены');
            return;
        }
        
        console.log(`Анкета текущего: id=${currentProfile.id}, type=${profileType}`);
        console.log(`Анкета первого: id=${firstLikerProfile.id}`);
        
        await db.addLike(currentUser.id, firstLikerProfile.id, profileType);
        console.log(`Лайк добавлен: пользователь ${currentUser.id} -> анкета ${firstLikerProfile.id}`);
        
        const likeCheck = await db.checkLikeDirect(firstLiker.id, currentProfile.id, profileType);
        
        console.log(`Лайк от первого (${firstLiker.id}) к анкете текущего (${currentProfile.id}): ${likeCheck ? 'ЕСТЬ' : 'НЕТ'}`);
        
        if (likeCheck) {
            console.log('=== МЭТЧ! ===');
            
            if (profileType === 'public') {
                await context.send(`💕 ВЗАИМНАЯ СИМПАТИЯ! 💕\n\nСсылка на страницу: vk.com/id${firstLikerId}\n\nМожешь написать человеку в личные сообщения!`);
                
                await vk.api.messages.send({
                    user_id: firstLikerId,
                    message: `💕 ВЗАИМНАЯ СИМПАТИЯ! 💕\n\nСсылка на страницу: vk.com/id${userId}\n\nМожешь написать человеку в личные сообщения!`,
                    random_id: Math.floor(Math.random() * 1000000000)
                });
                
                await db.createMatch(currentUser.id, firstLiker.id, 'public');
            } else {
                const matchId = await db.createMatch(currentUser.id, firstLiker.id, 'anon');
                const chatId = await db.createChat(matchId);
                
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
                    user_id: firstLikerId,
                    message: `💕 ВЗАИМНАЯ СИМПАТИЯ! 💕\n\nУ вас анонимный мэтч! Нажми "Перейти в чат" чтобы начать общение.`,
                    keyboard: matchKeyboard,
                    random_id: Math.floor(Math.random() * 1000000000)
                });
            }
        } else {
            console.log('Мэтча нет, ожидаем ответа');
            await context.send(`✅ Ты поставил(а) взаимный лайк! Как только пользователь ответит - будет мэтч.`);
        }
        return;
    }
    
    if (text === '👎 Отклонить') {
        await context.send('👎 Ты отклонил(а) этот лайк.', {
            keyboard: getMainKeyboard(userId)
        });
        return;
    }
    
    if (text === '/start' || text === '/меню') {
        await startHandler.handleStart(context, vk);
        return;
    }
    
    // ========== ОБРАБОТКА СОЗДАНИЯ АНКЕТЫ ==========
    const profileState = startHandler.userStates.get(userId);
    if (profileState && !editState) {
        const step = profileState.step;
        
        if (step === profileHandler.ProfileSteps.CHOOSE_TYPE) {
            const result = await profileHandler.handleProfileTypeChoice(context, vk, text);
            if (result) return;
        }
        else if (step === profileHandler.ProfileSteps.CHOOSE_GENDER) {
            const result = await profileHandler.handleGenderChoice(context, vk, text);
            if (result) return;
        }
        else if (step === profileHandler.ProfileSteps.CHOOSE_SEARCH_GENDER) {
            const result = await profileHandler.handleSearchGenderChoice(context, vk, text);
            if (result) return;
        }
        else if (step === profileHandler.ProfileSteps.ENTER_NAME) {
            const result = await profileHandler.handleNameInput(context, vk, text);
            if (result) return;
        }
        else if (step === profileHandler.ProfileSteps.ENTER_AGE) {
            const result = await profileHandler.handleAgeInput(context, vk, text);
            if (result) return;
        }
        else if (step === profileHandler.ProfileSteps.ENTER_CITY) {
            const result = await profileHandler.handleCityInput(context, vk, text);
            if (result) return;
        }
        else if (step === profileHandler.ProfileSteps.UPLOAD_PHOTO) {
            if (context.attachments && context.attachments.length > 0) {
                const result = await profileHandler.handlePhotoUpload(context, vk);
                if (result) return;
            } else {
                await context.send('📸 Пожалуйста, отправь фото. Если передумал(а) - напиши "отмена"');
                return;
            }
        }
    }
    
    // ========== ОСНОВНЫЕ КНОПКИ МЕНЮ ==========
    if (text === '🔍 Обычный поиск') {
        await searchHandler.handlePublicSearch(context, vk);
        return;
    }
    if (text === '🔞 Анонимный поиск') {
        await searchHandler.handleAnonSearch(context, vk);
        return;
    }
    if (text === '📋 Моя анкета') {
        await startHandler.handleMyProfile(context, vk);
        return;
    }
    if (text === '✏️ Создать анкету') {
        await profileHandler.handleCreateProfile(context, vk);
        return;
    }
    if (text === '❤️ Лайк') {
        await searchHandler.handleLike(context, vk);
        return;
    }
    if (text === '👎 Дизлайк') {
        await searchHandler.handleDislike(context, vk);
        return;
    }
    if (text === '🚫 Закончить поиск') {
        await searchHandler.stopSearch(context, userId);
        return;
    }
    if (text === '💬 Перейти в чат') {
        await chatHandler.enterChat(context, vk);
        return;
    }
    if (text === '❌ Завершить чат') {
        await chatHandler.closeChat(context, vk);
        return;
    }
    if (text === '💬 Мои чаты') {
        await chatHandler.handleMyChats(context, vk);
        return;
    }
    if (text === '🔙 Назад в меню' || text === '🔙 В главное меню' || text === '🔙 Назад в админку') {
        await context.send('🔙 Возвращаю в главное меню', {
            keyboard: getMainKeyboard(userId)
        });
        return;
    }
    
    // ========== ОБРАБОТКА СООБЩЕНИЙ В ЧАТЕ ==========
    if ((text && !text.startsWith('/')) || context.attachments) {
        await chatHandler.handleChatMessage(context, vk);
        return;
    }
    
    if (text && !text.startsWith('/')) {
        await context.send('❓ Используй кнопки меню для навигации.\n\nЕсли нужна помощь - напиши /start', {
            keyboard: getMainKeyboard(userId)
        });
        return;
    }
}

startBot().catch(console.error);