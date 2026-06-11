const db = require('../database');
const helpers = require('../utils/helpers');
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');
const keyboards = require('../keyboards');

const userStates = new Map();

// Состояния для редактирования анкеты
const EditSteps = {
    CHOOSE_ANON_PUBLIC: 'choose_anon_public',
    CHOOSE_FIELD: 'choose_field',
    EDIT_NAME: 'edit_name',
    EDIT_AGE: 'edit_age',
    EDIT_CITY: 'edit_city',
    EDIT_PHOTO: 'edit_photo',
    EDIT_GENDER: 'edit_gender',
    EDIT_SEARCH_GENDER: 'edit_search_gender'
};

// Функция для получения главной клавиатуры (с админ-кнопкой или без)
function getMainKeyboard(userId) {
    if (userId == config.adminId) {
        return JSON.stringify(keyboards.adminButton);
    }
    return JSON.stringify(keyboards.mainMenu);
}

async function handleStart(context, vk) {
    const userId = context.senderId;
    
    let userName = 'Пользователь';
    
    try {
        if (context.sender && context.sender.first_name) {
            userName = `${context.sender.first_name} ${context.sender.last_name || ''}`;
        } else {
            const [user] = await vk.api.users.get({ user_ids: userId });
            if (user && user.first_name) {
                userName = `${user.first_name} ${user.last_name || ''}`;
            }
        }
    } catch (err) {
        console.error('Error getting user name:', err);
    }
    
    await db.addUser(userId, userName);
    await db.addUserLog(userId, 'start', 'Пользователь запустил бота');
    
    const welcomeMsg = `👋 Привет, ${userName}!

Добро пожаловать в бот знакомств!

📌 Что ты можешь делать:
• Создать анкету (обычную или анонимную)
• Находить людей для общения
• Общаться в анонимных чатах при взаимной симпатии

Выбери действие в меню ниже 👇`;

    await context.send(welcomeMsg, {
        keyboard: getMainKeyboard(userId)
    });
    
    return { action: 'menu_shown' };
}

// Функция для перезагрузки фото с 5 попытками
async function reloadPhoto(vk, photoUrl) {
    let success = false;
    let lastError = null;
    
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            console.log(`Перезагрузка фото, попытка ${attempt}/5, URL:`, photoUrl);
            
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
                console.log(`Фото успешно перезагружено, попытка ${attempt}/5`);
                return `photo${savedPhoto[0].owner_id}_${savedPhoto[0].id}`;
            }
        } catch (err) {
            lastError = err;
            console.error(`Попытка ${attempt}/5 не удалась:`, err.message);
            if (attempt < 5) {
                console.log(`Ждём 3 секунды перед повтором...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }
    
    console.error('Ошибка перезагрузки фото после 5 попыток:', lastError?.message);
    return null;
}

async function handleMyProfile(context, vk) {
    const userId = context.senderId;
    const user = await db.getUserByVkId(userId);
    
    if (!user) {
        await context.send('❌ Ошибка: пользователь не найден. Напиши /start');
        return { action: 'error' };
    }
    
    const publicProfile = await db.getProfileByUserIdAndType(user.id, 'public');
    const anonProfile = await db.getProfileByUserIdAndType(user.id, 'anon');
    
    if (!publicProfile && !anonProfile) {
        await context.send('📭 У тебя пока нет ни одной анкеты.\n\nНажми "✏️ Создать анкету" чтобы создать!', {
            keyboard: getMainKeyboard(userId)
        });
        return { action: 'no_profiles' };
    }
    
    // Отправляем обычную анкету
    if (publicProfile) {
        let message = `🔹 Обычная анкета:\n`;
        message += `📝 Имя: ${publicProfile.name}\n`;
        message += `🎂 Возраст: ${publicProfile.age}\n`;
        message += `🏙 Город: ${publicProfile.city}\n`;
        message += `👤 Пол: ${publicProfile.gender === 'male' ? 'Мужской' : 'Женский'}\n`;
        message += `🔍 Ищет: ${getGenderText(publicProfile.search_gender)}`;
        
        await context.send(message);
        
        if (publicProfile.photo) {
            try {
                await vk.api.messages.send({
                    user_id: userId,
                    attachment: publicProfile.photo,
                    random_id: Math.floor(Math.random() * 1000000000)
                });
            } catch (err) {
                console.error('Ошибка отправки фото:', err);
            }
        }
    }
    
    // Отправляем анонимную анкету
    if (anonProfile) {
        let message = `🔞 Анонимная анкета:\n`;
        message += `📝 Имя: ${anonProfile.name}\n`;
        message += `🎂 Возраст: ${anonProfile.age}\n`;
        message += `🏙 Город: ${anonProfile.city}\n`;
        message += `👤 Пол: ${anonProfile.gender === 'male' ? 'Мужской' : 'Женский'}\n`;
        message += `🔍 Ищет: ${getGenderText(anonProfile.search_gender)}`;
        
        await context.send(message);
        
        if (anonProfile.photo) {
            try {
                await vk.api.messages.send({
                    user_id: userId,
                    attachment: anonProfile.photo,
                    random_id: Math.floor(Math.random() * 1000000000)
                });
            } catch (err) {
                console.error('Ошибка отправки фото:', err);
            }
        }
    }
    
    const actionKeyboard = JSON.stringify({
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "✏️ Редактировать анкету" }, color: "primary" }],
            [{ action: { type: "text", label: "🗑 Удалить анкету" }, color: "negative" }],
            [{ action: { type: "text", label: "🔙 Назад в меню" }, color: "secondary" }]
        ]
    });
    
    await context.send(`💡 Выбери действие:`, {
        keyboard: actionKeyboard
    });
    
    return { action: 'profile_shown' };
}

async function handleEditProfile(context, vk) {
    const userId = context.senderId;
    
    // ОЧИЩАЕМ СОСТОЯНИЕ УДАЛЕНИЯ, ЕСЛИ ОНО БЫЛО
    const state = userStates.get(userId);
    if (state && state.step === 'delete_choose_type') {
        userStates.delete(userId);
    }
    
    const user = await db.getUserByVkId(userId);
    
    if (!user) {
        await context.send('❌ Ошибка');
        return { action: 'error' };
    }
    
    const publicProfile = await db.getProfileByUserIdAndType(user.id, 'public');
    const anonProfile = await db.getProfileByUserIdAndType(user.id, 'anon');
    
    // Если есть обе анкеты, спрашиваем какую редактировать
    if (publicProfile && anonProfile) {
        const chooseKeyboard = JSON.stringify({
            one_time: true,
            buttons: [
                [{ action: { type: "text", label: "📋 Обычную анкету" }, color: "primary" }],
                [{ action: { type: "text", label: "🔞 Анонимную анкету" }, color: "primary" }],
                [{ action: { type: "text", label: "🔙 Назад" }, color: "secondary" }]
            ]
        });
        
        await context.send('Какую анкету хочешь редактировать?', {
            keyboard: chooseKeyboard
        });
        return { action: 'waiting_edit_choice' };
    } else if (publicProfile) {
        userStates.set(userId, {
            step: EditSteps.CHOOSE_FIELD,
            editType: 'public',
            profile: publicProfile
        });
        await showEditFieldMenu(context, 'public');
    } else if (anonProfile) {
        userStates.set(userId, {
            step: EditSteps.CHOOSE_FIELD,
            editType: 'anon',
            profile: anonProfile
        });
        await showEditFieldMenu(context, 'anon');
    }
    
    return { action: 'edit_started' };
}

async function showEditFieldMenu(context, type) {
    const fieldKeyboard = JSON.stringify({
        one_time: true,
        buttons: [
            [{ action: { type: "text", label: "📝 Имя" }, color: "primary" }],
            [{ action: { type: "text", label: "🎂 Возраст" }, color: "primary" }],
            [{ action: { type: "text", label: "🏙 Город" }, color: "primary" }],
            [{ action: { type: "text", label: "📸 Фото" }, color: "primary" }],
            [{ action: { type: "text", label: "👤 Мой пол" }, color: "primary" }],
            [{ action: { type: "text", label: "🔍 Кого ищу" }, color: "primary" }],
            [{ action: { type: "text", label: "🔙 Назад" }, color: "secondary" }]
        ]
    });
    
    await context.send(`✏️ Редактирование ${type === 'public' ? 'обычной' : 'анонимной'} анкеты\n\nЧто хочешь изменить?`, {
        keyboard: fieldKeyboard
    });
}

async function handleEditFieldChoice(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    if (!state || state.step !== EditSteps.CHOOSE_FIELD) return false;
    
    const { editType, profile } = state;
    
    switch (text) {
        case '📝 Имя':
            state.step = EditSteps.EDIT_NAME;
            userStates.set(userId, state);
            await context.send('📝 Введи новое имя (от 2 до 50 символов):', {
                keyboard: JSON.stringify({ buttons: [] })
            });
            return { action: 'edit_name' };
            
        case '🎂 Возраст':
            state.step = EditSteps.EDIT_AGE;
            userStates.set(userId, state);
            await context.send('🎂 Введи новый возраст (от 18 лет):');
            return { action: 'edit_age' };
            
        case '🏙 Город':
            state.step = EditSteps.EDIT_CITY;
            userStates.set(userId, state);
            await context.send('🏙 Введи новый город:');
            return { action: 'edit_city' };
            
        case '📸 Фото':
            state.step = EditSteps.EDIT_PHOTO;
            userStates.set(userId, state);
            await context.send('📸 Отправь новое фото для анкеты:');
            return { action: 'edit_photo' };
            
        case '👤 Мой пол':
            state.step = EditSteps.EDIT_GENDER;
            userStates.set(userId, state);
            await context.send('👤 Укажи свой пол:', {
                keyboard: JSON.stringify({
                    one_time: true,
                    buttons: [
                        [{ action: { type: "text", label: "👨 Мужской" }, color: "primary" }],
                        [{ action: { type: "text", label: "👩 Женский" }, color: "primary" }]
                    ]
                })
            });
            return { action: 'edit_gender' };
            
        case '🔍 Кого ищу':
            state.step = EditSteps.EDIT_SEARCH_GENDER;
            userStates.set(userId, state);
            await context.send('🔍 Кого ты хочешь искать?', {
                keyboard: JSON.stringify({
                    one_time: true,
                    buttons: [
                        [{ action: { type: "text", label: "👨 Мужчин" }, color: "primary" }],
                        [{ action: { type: "text", label: "👩 Женщин" }, color: "primary" }],
                        [{ action: { type: "text", label: "👥 Всех" }, color: "primary" }]
                    ]
                })
            });
            return { action: 'edit_search_gender' };
            
        case '🔙 Назад':
            userStates.delete(userId);
            await handleMyProfile(context, vk);
            return { action: 'back' };
            
        default:
            return false;
    }
}

async function handleEditName(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    if (!state || state.step !== EditSteps.EDIT_NAME) return false;
    
    if (!helpers.isValidName(text)) {
        await context.send('❌ Имя должно быть от 2 до 50 символов. Попробуй ещё раз:');
        return { action: 'name_invalid' };
    }
    
    const user = await db.getUserByVkId(userId);
    const profile = await db.getProfileByUserIdAndType(user.id, state.editType);
    
    if (!profile) {
        await context.send('❌ Анкета не найдена');
        userStates.delete(userId);
        return { action: 'error' };
    }
    
    await db.direct.run(`UPDATE profiles SET name = $1 WHERE id = $2`, [text.trim(), profile.id]);
    await db.addUserLog(userId, 'edit_profile', `Изменено имя на ${text.trim()}`);
    
    await context.send(`✅ Имя успешно изменено на "${text.trim()}"!`);
    
    userStates.delete(userId);
    await handleMyProfile(context, vk);
    
    return { action: 'name_updated' };
}

async function handleEditAge(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    if (!state || state.step !== EditSteps.EDIT_AGE) return false;
    
    if (!helpers.isValidAge(text)) {
        await context.send('❌ Возраст должен быть числом от 18 до 100 лет. Попробуй ещё раз:');
        return { action: 'age_invalid' };
    }
    
    const user = await db.getUserByVkId(userId);
    const profile = await db.getProfileByUserIdAndType(user.id, state.editType);
    
    if (!profile) {
        await context.send('❌ Анкета не найдена');
        userStates.delete(userId);
        return { action: 'error' };
    }
    
    await db.direct.run(`UPDATE profiles SET age = $1 WHERE id = $2`, [parseInt(text), profile.id]);
    await db.addUserLog(userId, 'edit_profile', `Изменён возраст на ${text}`);
    
    await context.send(`✅ Возраст успешно изменён на ${text} лет!`);
    
    userStates.delete(userId);
    await handleMyProfile(context, vk);
    
    return { action: 'age_updated' };
}

async function handleEditCity(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    if (!state || state.step !== EditSteps.EDIT_CITY) return false;
    
    const cityRegex = /^[а-яА-ЯёЁ\s\-\.]+$/;
    
    if (!cityRegex.test(text)) {
        await context.send('❌ Название города может содержать только русские буквы, пробелы, дефис или точку.\n\nПримеры: Москва, Санкт-Петербург, Ростов-на-Дону\n\nПопробуй ещё раз:');
        return { action: 'city_invalid' };
    }
    
    if (text.length < 2 || text.length > 50) {
        await context.send('❌ Название города должно быть от 2 до 50 символов. Попробуй ещё раз:');
        return { action: 'city_invalid' };
    }
    
    const normalizedCity = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    
    const user = await db.getUserByVkId(userId);
    const profile = await db.getProfileByUserIdAndType(user.id, state.editType);
    
    if (!profile) {
        await context.send('❌ Анкета не найдена');
        userStates.delete(userId);
        return { action: 'error' };
    }
    
    await db.direct.run(`UPDATE profiles SET city = $1 WHERE id = $2`, [normalizedCity, profile.id]);
    await db.addUserLog(userId, 'edit_profile', `Изменён город на ${normalizedCity}`);
    
    await context.send(`✅ Город успешно изменён на "${normalizedCity}"!`);
    
    userStates.delete(userId);
    await handleMyProfile(context, vk);
    
    return { action: 'city_updated' };
}

async function handleEditPhoto(context, vk) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    if (!state || state.step !== EditSteps.EDIT_PHOTO) return false;
    
    let photoAttachment = null;
    
    if (context.attachments && context.attachments.length > 0) {
        const attach = context.attachments[0];
        
        if (attach.ownerId && attach.id && attach.albumId === -3) {
            if (attach.sizes && attach.sizes.length > 0) {
                const photoUrl = attach.sizes[attach.sizes.length - 1].url;
                console.log('URL фото для перезагрузки:', photoUrl);
                
                let success = false;
                let lastError = null;
                
                for (let attempt = 1; attempt <= 5; attempt++) {
                    try {
                        console.log(`Попытка ${attempt}/5: перезагрузка фото...`);
                        
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
                            photoAttachment = `photo${savedPhoto[0].owner_id}_${savedPhoto[0].id}`;
                            console.log(`Попытка ${attempt}/5: фото успешно перезагружено`);
                            success = true;
                            break;
                        }
                    } catch (err) {
                        lastError = err;
                        console.error(`Попытка ${attempt}/5 не удалась:`, err.message);
                        if (attempt < 5) {
                            console.log(`Ждём 3 секунды перед повтором...`);
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }
                    }
                }
                
                if (!success) {
                    console.error('Ошибка перезагрузки фото после 5 попыток:', lastError?.message);
                    await context.send('❌ Не удалось обработать фото. Пожалуйста, попробуй другое изображение или повтори позже.');
                    return { action: 'photo_invalid' };
                }
            }
        }
    }
    
    if (!photoAttachment) {
        await context.send('❌ Не удалось распознать фото. Пожалуйста, отправь изображение заново.');
        return { action: 'photo_invalid' };
    }
    
    const user = await db.getUserByVkId(userId);
    const profile = await db.getProfileByUserIdAndType(user.id, state.editType);
    
    if (!profile) {
        await context.send('❌ Анкета не найдена');
        userStates.delete(userId);
        return { action: 'error' };
    }
    
    await db.direct.run(`UPDATE profiles SET photo = $1 WHERE id = $2`, [photoAttachment, profile.id]);
    await db.addUserLog(userId, 'edit_profile', `Изменено фото`);
    
    await context.send(`✅ Фото успешно обновлено!`);
    
    userStates.delete(userId);
    await handleMyProfile(context, vk);
    
    return { action: 'photo_updated' };
}

async function handleEditGender(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    if (!state || state.step !== EditSteps.EDIT_GENDER) return false;
    
    let gender = null;
    if (text === '👨 Мужской') gender = 'male';
    else if (text === '👩 Женский') gender = 'female';
    else return false;
    
    const user = await db.getUserByVkId(userId);
    const profile = await db.getProfileByUserIdAndType(user.id, state.editType);
    
    if (!profile) {
        await context.send('❌ Анкета не найдена');
        userStates.delete(userId);
        return { action: 'error' };
    }
    
    await db.direct.run(`UPDATE profiles SET gender = $1 WHERE id = $2`, [gender, profile.id]);
    await db.addUserLog(userId, 'edit_profile', `Изменён пол на ${gender}`);
    
    await context.send(`✅ Пол успешно изменён!`);
    
    userStates.delete(userId);
    await handleMyProfile(context, vk);
    
    return { action: 'gender_updated' };
}

async function handleEditSearchGender(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    if (!state || state.step !== EditSteps.EDIT_SEARCH_GENDER) return false;
    
    let searchGender = null;
    if (text === '👨 Мужчин') searchGender = 'male';
    else if (text === '👩 Женщин') searchGender = 'female';
    else if (text === '👥 Всех') searchGender = 'all';
    else return false;
    
    const user = await db.getUserByVkId(userId);
    const profile = await db.getProfileByUserIdAndType(user.id, state.editType);
    
    if (!profile) {
        await context.send('❌ Анкета не найдена');
        userStates.delete(userId);
        return { action: 'error' };
    }
    
    await db.direct.run(`UPDATE profiles SET search_gender = $1 WHERE id = $2`, [searchGender, profile.id]);
    await db.addUserLog(userId, 'edit_profile', `Изменён поиск на ${searchGender}`);
    
    await context.send(`✅ Настройки поиска успешно изменены!`);
    
    userStates.delete(userId);
    await handleMyProfile(context, vk);
    
    return { action: 'search_gender_updated' };
}

async function handleEditChoice(context, vk, text) {
    const userId = context.senderId;
    
    console.log(`handleEditChoice: text="${text}", userId=${userId}`);
    
    if (text === '📋 Обычную анкету') {
        console.log('Выбрана обычная анкета');
        userStates.set(userId, {
            step: EditSteps.CHOOSE_FIELD,
            editType: 'public'
        });
        await showEditFieldMenu(context, 'public');
        return true;
    }
    
    if (text === '🔞 Анонимную анкету') {
        console.log('Выбрана анонимная анкета');
        userStates.set(userId, {
            step: EditSteps.CHOOSE_FIELD,
            editType: 'anon'
        });
        await showEditFieldMenu(context, 'anon');
        return true;
    }
    
    return false;
}

async function handleDeleteProfile(context, vk, profileType = null) {
    const userId = context.senderId;
    console.log(`🗑 DELETE PROFILE CALLED: userId=${userId}, profileType=${profileType}`);
    
    // ОЧИЩАЕМ СОСТОЯНИЕ РЕДАКТИРОВАНИЯ, ЕСЛИ ОНО БЫЛО
    const editState = userStates.get(userId);
    if (editState && editState.step === EditSteps.CHOOSE_FIELD) {
        userStates.delete(userId);
    }
    
    const user = await db.getUserByVkId(userId);
    
    if (!user) {
        await context.send('❌ Ошибка');
        return { action: 'error' };
    }
    
    // Если тип не указан, показываем выбор
    if (!profileType) {
        const publicProfile = await db.getProfileByUserIdAndType(user.id, 'public');
        const anonProfile = await db.getProfileByUserIdAndType(user.id, 'anon');
        
        console.log(`📊 Профили: public=${!!publicProfile}, anon=${!!anonProfile}`);
        
        if (publicProfile && anonProfile) {
            // Устанавливаем состояние, что мы в режиме выбора типа для удаления
            userStates.set(userId, { step: 'delete_choose_type' });
            
            const deleteKeyboard = JSON.stringify({
                one_time: true,
                buttons: [
                    [{ action: { type: "text", label: "📋 Обычную анкету" }, color: "primary" }],
                    [{ action: { type: "text", label: "🔞 Анонимную анкету" }, color: "primary" }],
                    [{ action: { type: "text", label: "🔙 Назад" }, color: "secondary" }]
                ]
            });
            await context.send('Какую анкету удалить?', {
                keyboard: deleteKeyboard
            });
            return { action: 'waiting_delete_choice' };
        } else if (publicProfile) {
            await db.deleteProfile(publicProfile.id);
            await db.addUserLog(userId, 'delete_profile', 'Удалена обычная анкета');
            await context.send('✅ Обычная анкета удалена!', { keyboard: getMainKeyboard(userId) });
        } else if (anonProfile) {
            await db.deleteProfile(anonProfile.id);
            await db.addUserLog(userId, 'delete_profile', 'Удалена анонимная анкета');
            await context.send('✅ Анонимная анкета удалена!', { keyboard: getMainKeyboard(userId) });
        } else {
            await context.send('❌ У тебя нет анкет для удаления', { keyboard: getMainKeyboard(userId) });
        }
        
        // Очищаем состояние удаления
        userStates.delete(userId);
        return { action: 'deleted' };
    }
    
    // Если тип указан, удаляем конкретную анкету
    const profile = await db.getProfileByUserIdAndType(user.id, profileType);
    if (profile) {
        await db.deleteProfile(profile.id);
        await db.addUserLog(userId, 'delete_profile', `Удалена ${profileType === 'public' ? 'обычная' : 'анонимная'} анкета`);
        await context.send(`✅ ${profileType === 'public' ? 'Обычная' : 'Анонимная'} анкета удалена!`, { keyboard: getMainKeyboard(userId) });
    } else {
        await context.send('❌ Анкета не найдена', { keyboard: getMainKeyboard(userId) });
    }
    
    // Очищаем состояние после удаления
    userStates.delete(userId);
    
    return { action: 'deleted' };
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
    handleStart,
    handleMyProfile,
    handleEditProfile,
    handleEditFieldChoice,
    handleEditName,
    handleEditAge,
    handleEditCity,
    handleEditPhoto,
    handleEditGender,
    handleEditSearchGender,
    handleDeleteProfile,
    handleEditChoice,
    userStates,
    EditSteps
};