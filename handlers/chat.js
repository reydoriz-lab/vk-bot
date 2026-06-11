const db = require('../database');
const helpers = require('../utils/helpers');
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const { searchStates } = require('./search');

const chatSessions = new Map();

const chatMenuKeyboard = JSON.stringify({
    one_time: false,
    buttons: [
        [{ action: { type: "text", label: "❌ Завершить чат" }, color: "negative" }],
        [{ action: { type: "text", label: "🔙 В главное меню" }, color: "secondary" }]
    ]
});

const mainMenuKeyboard = JSON.stringify({
    one_time: false,
    buttons: [
        [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
        [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
        [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
        [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
    ]
});

const backMenuKeyboard = JSON.stringify({
    one_time: true,
    buttons: [
        [{ action: { type: "text", label: "🔙 Назад в меню" }, color: "secondary" }]
    ]
});

const activeChatKeyboard = JSON.stringify({
    one_time: false,
    buttons: [
        [{ action: { type: "text", label: "💬 Перейти в чат" }, color: "primary" }],
        [{ action: { type: "text", label: "❌ Завершить чат" }, color: "negative" }],
        [{ action: { type: "text", label: "🔙 Назад в меню" }, color: "secondary" }]
    ]
});

function containsLink(text) {
    if (!text) return false;
    const urlPattern = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/i;
    return urlPattern.test(text);
}

async function enterChat(context, vk, matchData = null) {
    const userId = context.senderId;
    const user = await db.getUserByVkId(userId);
    
    if (!user) {
        await context.send('❌ Ошибка. Напишите /start');
        return;
    }
    
    let chat = null;
    let match = null;
    
    // Если передан chatId, используем его
    if (matchData && matchData.chatId) {
        chat = await db.getChatById(matchData.chatId);
        if (chat) match = await db.getMatchByChatId(chat.id);
    }
    
    // Если не нашли, ищем активный чат пользователя
    if (!chat) {
        const allChats = await db.getAllChats();
        for (const c of allChats) {
            const isActive = parseInt(c.is_active);
            if (isActive === 1 && (c.user1_vk == userId || c.user2_vk == userId)) {
                chat = c;
                match = await db.getMatchByChatId(chat.id);
                break;
            }
        }
    }
    
    if (!chat || parseInt(chat.is_active) !== 1) {
        await context.send('❌ У тебя нет активных анонимных чатов.\n\nНачни анонимный поиск, чтобы найти собеседника!', {
            keyboard: mainMenuKeyboard
        });
        return;
    }
    
    let session = chatSessions.get(chat.id);
    if (!session) {
        const user1 = await db.getUserById(match.user1_id);
        const user2 = await db.getUserById(match.user2_id);
        session = {
            chatId: chat.id,
            matchId: match.id,
            user1Id: user1.id,
            user2Id: user2.id,
            user1Vk: user1.vk_id,
            user2Vk: user2.vk_id,
            isActive: true
        };
        chatSessions.set(chat.id, session);
    }
    
    const partnerId = (session.user1Vk == userId) ? session.user2Vk : session.user1Vk;
    
    await context.send(`💬 Вы вошли в анонимный чат!\n\nПравила чата:\n• Вы можете общаться свободно\n• Можно отправлять текст, фото, голосовые, стикеры\n• Запрещено отправлять ссылки\n• Бот пересылает все сообщения\n• Нажми "Завершить чат" когда захотите закончить общение\n\nНачинайте общение! 👇`, {
        keyboard: chatMenuKeyboard
    });
    
    try {
        await vk.api.messages.send({
            user_id: partnerId,
            message: `💬 Ваш собеседник зашел в чат! Можете начинать общение.`,
            keyboard: chatMenuKeyboard,
            random_id: Math.floor(Math.random() * 1000000000)
        });
    } catch (err) {
        console.error('Error notifying partner:', err);
    }
}

async function sendDirectMessage(accessToken, userId, message, attachment) {
    const params = new URLSearchParams();
    params.append('user_id', userId);
    params.append('random_id', Math.floor(Math.random() * 1000000000));
    params.append('access_token', accessToken);
    params.append('v', '5.199');
    
    if (message && message.trim() !== '') {
        params.append('message', message);
    }
    if (attachment) {
        params.append('attachment', attachment);
    }
    
    const response = await axios.post('https://api.vk.com/method/messages.send', params);
    return response.data;
}

async function getActiveChatFromDB(userId) {
    const allChats = await db.getAllChats();
    const activeChats = [];
    
    for (const chat of allChats) {
        const isActive = parseInt(chat.is_active);
        if (isActive === 1 && (chat.user1_vk == userId || chat.user2_vk == userId)) {
            activeChats.push(chat);
        }
    }
    
    if (activeChats.length === 0) return null;
    activeChats.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return activeChats[0];
}

async function reloadPhoto(vk, photoUrl) {
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            const fileStream = await helpers.downloadFile(photoUrl);
            const uploadServer = await vk.api.photos.getMessagesUploadServer();
            
            const form = new FormData();
            form.append('photo', fileStream, { filename: 'photo.jpg' });
            
            const uploadResponse = await axios.post(uploadServer.upload_url, form, {
                headers: form.getHeaders(),
                timeout: 120000
            });
            
            const savedPhoto = await vk.api.photos.saveMessagesPhoto({
                photo: uploadResponse.data.photo,
                server: uploadResponse.data.server,
                hash: uploadResponse.data.hash
            });
            
            if (savedPhoto && savedPhoto[0]) {
                return `photo${savedPhoto[0].owner_id}_${savedPhoto[0].id}`;
            }
        } catch (err) {
            console.error(`Перезагрузка фото, попытка ${attempt}/5 не удалась:`, err.message);
            if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    return null;
}

async function handleChatMessage(context, vk) {
    const userId = context.senderId;
    
    const user = await db.getUserByVkId(userId);
    if (!user) return;
    
    const activeChat = await getActiveChatFromDB(userId);
    
    if (!activeChat) {
        if (context.text && !context.text.startsWith('/')) {
            await context.send('💬 У тебя нет активного чата.\n\nНачни анонимный поиск, чтобы найти собеседника!', {
                keyboard: mainMenuKeyboard
            });
        }
        return;
    }
    
    const partnerId = (activeChat.user1_vk == userId) ? activeChat.user2_vk : activeChat.user1_vk;
    
    let messageText = context.text || '';
    let attachmentToSend = null;
    let attachmentType = '';
    let stickerIdToSend = null;
    
    if (messageText && containsLink(messageText)) {
        await context.send('🔒 Отправка ссылок в анонимном чате запрещена для вашей безопасности.');
        return;
    }
    
    if (context.attachments && context.attachments.length > 0) {
        const attach = context.attachments[0];
        
        // Фото
        if (attach.ownerId && attach.id && attach.albumId === -3) {
            const sizes = attach.sizes || attach.photo?.sizes;
            if (sizes && sizes.length > 0) {
                const photoUrl = sizes[sizes.length - 1].url;
                const newPhoto = await reloadPhoto(vk, photoUrl);
                if (newPhoto) {
                    attachmentToSend = newPhoto;
                    attachmentType = '📸 Фото';
                }
            }
        }
        // Голосовое сообщение
        else if (attach.type === 'audio_message' || (attach.doc && attach.doc.kind === 'audiomsg')) {
            const docData = attach.doc || attach;
            const audioUrl = docData.url || docData.mp3Url || docData.oggUrl;
            
            if (audioUrl) {
                for (let attempt = 1; attempt <= 5; attempt++) {
                    try {
                        const fileStream = await helpers.downloadFile(audioUrl);
                        const uploadServer = await vk.api.docs.getMessagesUploadServer({
                            type: 'audio_message',
                            peer_id: partnerId
                        });
                        
                        const form = new FormData();
                        form.append('file', fileStream, { filename: `voice_${Date.now()}.mp3` });
                        
                        const uploadResponse = await axios.post(uploadServer.upload_url, form, {
                            headers: form.getHeaders(),
                            timeout: 60000
                        });
                        
                        const savedDoc = await vk.api.docs.save({ file: uploadResponse.data.file });
                        
                        if (savedDoc.audio_message) {
                            attachmentToSend = `doc${savedDoc.audio_message.owner_id}_${savedDoc.audio_message.id}`;
                            attachmentType = '🎤 Голосовое сообщение';
                            break;
                        } else if (savedDoc.doc) {
                            attachmentToSend = `doc${savedDoc.doc.owner_id}_${savedDoc.doc.id}`;
                            attachmentType = '🎤 Голосовое сообщение';
                            break;
                        }
                    } catch (err) {
                        console.error(`Голосовое, попытка ${attempt}/5 не удалась:`, err.message);
                        if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }
        }
        // Стикер
        else if (attach.type === 'sticker' || attach.sticker) {
            const stickerData = attach.sticker || attach;
            const stickerId = stickerData.sticker_id || stickerData.id;
            
            if (stickerId) {
                stickerIdToSend = stickerId;
                attachmentType = 'sticker';
                console.log('Обработка стикера ID:', stickerId);
            } else {
                attachmentType = '😊 Стикер';
            }
        }
        // Документ
        else if (attach.type === 'doc' || attach.doc) {
            const docData = attach.doc || attach;
            attachmentToSend = `doc${docData.owner_id || docData.ownerId}_${docData.id}`;
            attachmentType = `📎 Файл: ${docData.title || 'документ'}`;
        }
        // Видео - игнорируем
        else if (attach.type === 'video' || attach.video) {
            await context.send('🎥 Видео не поддерживается в анонимном чате.');
            return;
        }
        else {
            console.log('НЕИЗВЕСТНЫЙ ТИП:', attach.type);
        }
    }
    
    const dbMessage = (messageText || '') + (attachmentType ? (messageText ? '\n' + attachmentType : attachmentType) : '');
    await db.addMessage(activeChat.id, user.id, dbMessage || 'Сообщение', attachmentToSend);
    
    if (messageText && messageText.trim() !== '') {
        try {
            await sendDirectMessage(config.token, partnerId, messageText, null);
        } catch (err) {
            console.error('Ошибка отправки текста:', err.message);
        }
    }
    
    if (attachmentType === 'sticker' && stickerIdToSend) {
        try {
            await vk.api.messages.send({
                user_id: partnerId,
                sticker_id: parseInt(stickerIdToSend),
                random_id: Math.floor(Math.random() * 1000000000)
            });
            console.log('Стикер отправлен успешно, ID:', stickerIdToSend);
        } catch (err) {
            console.error('Ошибка отправки стикера:', err.message);
        }
    }
    else if (attachmentToSend) {
        try {
            await sendDirectMessage(config.token, partnerId, null, attachmentToSend);
            console.log('Вложение отправлено успешно');
        } catch (err) {
            console.error('Ошибка отправки вложения:', err.message);
        }
    }
}

async function closeChat(context, vk) {
    const userId = context.senderId;
    const user = await db.getUserByVkId(userId);
    if (!user) return;
    
    const activeChat = await getActiveChatFromDB(userId);
    
    if (!activeChat) {
        await context.send('❌ У тебя нет активного чата для завершения.', {
            keyboard: mainMenuKeyboard
        });
        return;
    }
    
    const partnerId = (activeChat.user1_vk == userId) ? activeChat.user2_vk : activeChat.user1_vk;
    
    await db.closeChat(activeChat.id);
    await db.addUserLog(userId, 'close_chat', `Закрыт чат ${activeChat.id}`);
    
    if (chatSessions.has(activeChat.id)) {
        chatSessions.delete(activeChat.id);
    }
    
    if (searchStates && searchStates.has(userId)) {
        searchStates.delete(userId);
    }
    if (searchStates && searchStates.has(partnerId)) {
        searchStates.delete(partnerId);
    }
    
    if (partnerId) {
        try {
            await vk.api.messages.send({
                user_id: partnerId,
                message: `🔚 Собеседник завершил чат.\n\nЧат закрыт. Нажми "🔙 В главное меню", чтобы начать новый поиск.`,
                keyboard: backMenuKeyboard,
                random_id: Math.floor(Math.random() * 1000000000)
            });
        } catch (err) {
            console.error('Error notifying partner:', err);
        }
    }
    
    await context.send('✅ Чат завершён.\n\nТы можешь начать новый анонимный поиск в любое время!', {
        keyboard: mainMenuKeyboard
    });
}

async function handleMyChats(context, vk) {
    const userId = context.senderId;
    const user = await db.getUserByVkId(userId);
    if (!user) return;
    
    const activeChat = await getActiveChatFromDB(userId);
    
    if (!activeChat) {
        await context.send('📭 У тебя нет активных чатов.\n\nНачни анонимный поиск, чтобы найти собеседника!', {
            keyboard: mainMenuKeyboard
        });
        return;
    }
    
    const createdDate = new Date(activeChat.created_at).toLocaleString();
    
    let message = `💬 **У тебя есть активный чат!**\n\n`;
    message += `Создан: ${createdDate}\n`;
    message += `\nНажми "Перейти в чат" чтобы продолжить общение.\n`;
    message += `Нажми "Завершить чат" чтобы закрыть чат.\n`;
    
    await context.send(message, {
        keyboard: activeChatKeyboard
    });
}

module.exports = {
    enterChat,
    handleChatMessage,
    closeChat,
    handleMyChats,
    chatSessions
};