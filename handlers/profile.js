const db = require('../database');
const helpers = require('../utils/helpers');
const axios = require('axios');
const FormData = require('form-data');
const { userStates } = require('./start');

const ProfileSteps = {
    CHOOSE_TYPE: 'choose_type',
    CHOOSE_GENDER: 'choose_gender',
    CHOOSE_SEARCH_GENDER: 'choose_search_gender',
    ENTER_NAME: 'enter_name',
    ENTER_AGE: 'enter_age',
    ENTER_CITY: 'enter_city',
    UPLOAD_PHOTO: 'upload_photo'
};

// Функция для проверки города через ВК API
async function validateCity(cityName, vk) {
    try {
        const response = await vk.api.database.getCities({
            country_id: 1,
            q: cityName,
            count: 1,
            need_all: 0
        });
        
        if (response.items && response.items.length > 0) {
            const city = response.items[0];
            return {
                valid: true,
                name: city.title,
                id: city.id
            };
        }
        return {
            valid: false,
            name: null,
            id: null
        };
    } catch (err) {
        console.error('Ошибка проверки города:', err);
        return {
            valid: false,
            name: null,
            id: null
        };
    }
}

// Функция для перезагрузки фото через сервер ВК
async function reloadPhoto(vk, photoUrl) {
    try {
        console.log('Перезагрузка фото, URL:', photoUrl);
        const fileStream = await helpers.downloadFile(photoUrl);
        const uploadServer = await vk.api.photos.getMessagesUploadServer();
        
        const form = new FormData();
        form.append('photo', fileStream, { filename: 'photo.jpg' });
        
        const uploadResponse = await axios.post(uploadServer.upload_url, form, {
            headers: form.getHeaders(),
            timeout: 60000
        });
        
        const savedPhoto = await vk.api.photos.saveMessagesPhoto({
            photo: uploadResponse.data.photo,
            server: uploadResponse.data.server,
            hash: uploadResponse.data.hash
        });
        
        if (savedPhoto && savedPhoto[0]) {
            const newAttachment = `photo${savedPhoto[0].owner_id}_${savedPhoto[0].id}`;
            console.log('Фото перезагружено, новый attachment:', newAttachment);
            return newAttachment;
        }
        return null;
    } catch (err) {
        console.error('Ошибка перезагрузки фото:', err.message);
        return null;
    }
}

async function handleCreateProfile(context, vk) {
    const userId = context.senderId;
    console.log(`🔵 [СОЗДАНИЕ АНКЕТЫ] Пользователь ${userId} начал создание анкеты`);
    
    const user = await db.getUserByVkId(userId);
    
    if (!user) {
        console.log(`🔴 [СОЗДАНИЕ АНКЕТЫ] Пользователь ${userId} не найден в БД`);
        await context.send('❌ Ошибка. Напишите /start');
        return { action: 'error' };
    }
    
    const publicProfile = await db.getProfileByUserIdAndType(user.id, 'public');
    const anonProfile = await db.getProfileByUserIdAndType(user.id, 'anon');
    
    console.log(`📊 [СОЗДАНИЕ АНКЕТЫ] Пользователь ${userId}: public=${!!publicProfile}, anon=${!!anonProfile}`);
    
    if (publicProfile && anonProfile) {
        console.log(`🔴 [СОЗДАНИЕ АНКЕТЫ] У пользователя ${userId} уже есть обе анкеты`);
        await context.send('❌ У тебя уже есть обе анкеты (обычная и анонимная).\n\nЧтобы создать новую, сначала удали старую через "Моя анкета"', {
            keyboard: JSON.stringify({
                one_time: false,
                buttons: [
                    [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                    [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                    [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                    [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
                ]
            })
        });
        return { action: 'max_profiles' };
    }
    
    userStates.set(userId, {
        step: ProfileSteps.CHOOSE_TYPE,
        tempData: {}
    });
    
    console.log(`🟢 [СОЗДАНИЕ АНКЕТЫ] Состояние установлено: CHOOSE_TYPE для ${userId}`);
    
    await context.send('📝 Какую анкету хочешь создать?', {
        keyboard: JSON.stringify({
            one_time: true,
            buttons: [
                [{ action: { type: "text", label: "📋 Обычная анкета" }, color: "primary" }],
                [{ action: { type: "text", label: "🔞 Анонимная анкета" }, color: "primary" }]
            ]
        })
    });
    
    return { action: 'profile_creation_started' };
}

async function handleProfileTypeChoice(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    console.log(`🔵 [ВЫБОР ТИПА] Пользователь ${userId}, текст: "${text}", состояние: ${state ? state.step : 'нет'}`);
    
    if (!state || state.step !== ProfileSteps.CHOOSE_TYPE) return false;
    
    let type = null;
    if (text === '📋 Обычная анкета') type = 'public';
    else if (text === '🔞 Анонимная анкета') type = 'anon';
    else return false;
    
    console.log(`📝 [ВЫБОР ТИПА] Пользователь ${userId} выбрал тип: ${type}`);
    
    const user = await db.getUserByVkId(userId);
    const existingProfile = await db.getProfileByUserIdAndType(user.id, type);
    
    if (existingProfile) {
        console.log(`🔴 [ВЫБОР ТИПА] У пользователя ${userId} уже есть анкета типа ${type}`);
        await context.send(`❌ У тебя уже есть ${type === 'public' ? 'обычная' : 'анонимная'} анкета.\n\nСначала удали её через "Моя анкета"`, {
            keyboard: JSON.stringify({
                one_time: false,
                buttons: [
                    [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                    [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                    [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                    [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
                ]
            })
        });
        userStates.delete(userId);
        return { action: 'already_exists' };
    }
    
    state.tempData.type = type;
    state.step = ProfileSteps.CHOOSE_GENDER;
    userStates.set(userId, state);
    
    console.log(`🟢 [ВЫБОР ТИПА] Переход к CHOOSE_GENDER для ${userId}`);
    
    await context.send('👤 Укажи свой пол:', {
        keyboard: JSON.stringify({
            one_time: true,
            buttons: [
                [{ action: { type: "text", label: "👨 Мужской" }, color: "primary" }],
                [{ action: { type: "text", label: "👩 Женский" }, color: "primary" }]
            ]
        })
    });
    
    return { action: 'gender_asked' };
}

async function handleGenderChoice(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    console.log(`🔵 [ВЫБОР ПОЛА] Пользователь ${userId}, текст: "${text}"`);
    
    if (!state || state.step !== ProfileSteps.CHOOSE_GENDER) return false;
    
    let gender = null;
    if (text === '👨 Мужской') gender = 'male';
    else if (text === '👩 Женский') gender = 'female';
    else return false;
    
    console.log(`📝 [ВЫБОР ПОЛА] Пользователь ${userId} выбрал пол: ${gender}`);
    
    state.tempData.gender = gender;
    state.step = ProfileSteps.CHOOSE_SEARCH_GENDER;
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
    
    return { action: 'search_gender_asked' };
}

async function handleSearchGenderChoice(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    console.log(`🔵 [ВЫБОР ПОИСКА] Пользователь ${userId}, текст: "${text}"`);
    
    if (!state || state.step !== ProfileSteps.CHOOSE_SEARCH_GENDER) return false;
    
    let searchGender = null;
    if (text === '👨 Мужчин') searchGender = 'male';
    else if (text === '👩 Женщин') searchGender = 'female';
    else if (text === '👥 Всех') searchGender = 'all';
    else return false;
    
    console.log(`📝 [ВЫБОР ПОИСКА] Пользователь ${userId} выбрал ищет: ${searchGender}`);
    
    state.tempData.searchGender = searchGender;
    state.step = ProfileSteps.ENTER_NAME;
    userStates.set(userId, state);
    
    await context.send('📝 Введи своё имя (от 2 до 50 символов):', {
        keyboard: JSON.stringify({ buttons: [] })
    });
    
    return { action: 'name_asked' };
}

async function handleNameInput(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    console.log(`🔵 [ВВОД ИМЕНИ] Пользователь ${userId}, имя: "${text}"`);
    
    if (!state || state.step !== ProfileSteps.ENTER_NAME) return false;
    
    if (!helpers.isValidName(text)) {
        console.log(`🔴 [ВВОД ИМЕНИ] Невалидное имя: ${text}`);
        await context.send('❌ Имя должно быть от 2 до 50 символов. Попробуй ещё раз:');
        return { action: 'name_invalid' };
    }
    
    state.tempData.name = text.trim();
    state.step = ProfileSteps.ENTER_AGE;
    userStates.set(userId, state);
    
    console.log(`🟢 [ВВОД ИМЕНИ] Имя сохранено: ${text.trim()}, переход к ENTER_AGE`);
    
    await context.send('🎂 Введи свой возраст (от 18 лет):');
    
    return { action: 'age_asked' };
}

async function handleAgeInput(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    console.log(`🔵 [ВВОД ВОЗРАСТА] Пользователь ${userId}, возраст: "${text}"`);
    
    if (!state || state.step !== ProfileSteps.ENTER_AGE) return false;
    
    if (!helpers.isValidAge(text)) {
        console.log(`🔴 [ВВОД ВОЗРАСТА] Невалидный возраст: ${text}`);
        await context.send('❌ Возраст должен быть числом от 18 до 100 лет. Попробуй ещё раз:');
        return { action: 'age_invalid' };
    }
    
    state.tempData.age = parseInt(text);
    state.step = ProfileSteps.ENTER_CITY;
    userStates.set(userId, state);
    
    console.log(`🟢 [ВВОД ВОЗРАСТА] Возраст сохранен: ${text}, переход к ENTER_CITY`);
    
    await context.send('🏙 Введи название своего города:');
    
    return { action: 'city_asked' };
}

async function handleCityInput(context, vk, text) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    console.log(`🔵 [ВВОД ГОРОДА] Пользователь ${userId}, город: "${text}"`);
    
    if (!state || state.step !== ProfileSteps.ENTER_CITY) return false;
    
    // Базовая валидация города
    const cityRegex = /^[а-яА-ЯёЁ\s\-\.]+$/;
    
    if (!cityRegex.test(text)) {
        console.log(`🔴 [ВВОД ГОРОДА] Невалидный город (символы): ${text}`);
        await context.send('❌ Название города может содержать только русские буквы, пробелы, дефис или точку.\n\nПримеры: Москва, Санкт-Петербург, Ростов-на-Дону\n\nПопробуй ещё раз:');
        return { action: 'city_invalid' };
    }
    
    if (text.length < 2 || text.length > 50) {
        console.log(`🔴 [ВВОД ГОРОДА] Невалидный город (длина): ${text.length}`);
        await context.send('❌ Название города должно быть от 2 до 50 символов. Попробуй ещё раз:');
        return { action: 'city_invalid' };
    }
    
    // Приводим к нормальному виду
    const normalizedCity = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    
    state.tempData.city = normalizedCity;
    state.step = ProfileSteps.UPLOAD_PHOTO;
    userStates.set(userId, state);
    
    console.log(`🟢 [ВВОД ГОРОДА] Город сохранен: ${normalizedCity}, переход к UPLOAD_PHOTO`);
    
    await context.send(`✅ Город сохранён: ${normalizedCity}\n\n📸 Отправь своё фото для анкеты.\n\nПросто отправь изображение в этот чат:`);
    
    return { action: 'photo_asked' };
}

async function handlePhotoUpload(context, vk) {
    const userId = context.senderId;
    const state = userStates.get(userId);
    
    console.log(`🔵 [ЗАГРУЗКА ФОТО] Пользователь ${userId}, есть вложения: ${!!context.attachments}`);
    
    if (!state || state.step !== ProfileSteps.UPLOAD_PHOTO) return false;
    
    let photoAttachment = null;
    let photoUrl = null;
    
    if (context.attachments && context.attachments.length > 0) {
        const attach = context.attachments[0];
        console.log(`📎 [ЗАГРУЗКА ФОТО] Тип вложения: ${attach.type || 'unknown'}`);
        
        if (attach.ownerId && attach.id && attach.albumId === -3) {
            if (attach.sizes && attach.sizes.length > 0) {
                photoUrl = attach.sizes[attach.sizes.length - 1].url;
                console.log(`📸 [ЗАГРУЗКА ФОТО] URL фото: ${photoUrl}`);
            }
            
            if (photoUrl) {
                console.log(`🔄 [ЗАГРУЗКА ФОТО] Перезагрузка фото...`);
                const newPhoto = await reloadPhoto(vk, photoUrl);
                if (newPhoto) {
                    photoAttachment = newPhoto;
                    console.log(`✅ [ЗАГРУЗКА ФОТО] Фото перезагружено: ${photoAttachment}`);
                } else {
                    console.log(`🔴 [ЗАГРУЗКА ФОТО] Ошибка перезагрузки фото`);
                }
            }
        }
    }
    
    if (!photoAttachment) {
        console.log(`🔴 [ЗАГРУЗКА ФОТО] Не удалось получить фото от пользователя ${userId}`);
        await context.send('❌ Не удалось распознать фото. Пожалуйста, отправь изображение заново.');
        return { action: 'photo_invalid' };
    }
    
    state.tempData.photo = photoAttachment;
    
    const user = await db.getUserByVkId(userId);
    console.log(`👤 [ЗАГРУЗКА ФОТО] Пользователь найден: id=${user.id}, vk_id=${user.vk_id}`);
    
    try {
        console.log(`💾 [СОХРАНЕНИЕ АНКЕТЫ] Данные: type=${state.tempData.type}, name=${state.tempData.name}, age=${state.tempData.age}, city=${state.tempData.city}`);
        
        await db.createProfile(
            user.id,
            state.tempData.type,
            state.tempData.gender,
            state.tempData.searchGender,
            state.tempData.name,
            state.tempData.age,
            state.tempData.city,
            state.tempData.photo
        );
        
        console.log(`✅ [СОХРАНЕНИЕ АНКЕТЫ] Анкета успешно создана для пользователя ${userId}`);
        
        await db.addUserLog(userId, 'create_profile', `Создана ${state.tempData.type === 'public' ? 'обычная' : 'анонимная'} анкета`);
        
        const profileTypeText = state.tempData.type === 'public' ? 'Обычная' : 'Анонимная';
        
        const successMessage = `✅ ${profileTypeText} анкета успешно создана!\n\n📝 Имя: ${state.tempData.name}\n🎂 Возраст: ${state.tempData.age}\n🏙 Город: ${state.tempData.city}\n\nТеперь ты можешь начинать поиск!`;
        
        await context.send(successMessage, {
            keyboard: JSON.stringify({
                one_time: false,
                buttons: [
                    [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                    [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                    [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                    [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
                ]
            })
        });
        
        // Отправляем фото отдельным сообщением
        await vk.api.messages.send({
            user_id: userId,
            attachment: state.tempData.photo,
            random_id: Math.floor(Math.random() * 1000000000)
        });
        
        userStates.delete(userId);
        console.log(`🗑 [СОЗДАНИЕ АНКЕТЫ] Состояние пользователя ${userId} очищено`);
        
        return { action: 'profile_created', profile: state.tempData };
        
    } catch (err) {
        console.error(`🔴 [ОШИБКА СОЗДАНИЯ АНКЕТЫ] Пользователь ${userId}:`, err);
        await context.send('❌ Ошибка при создании анкеты. Попробуй позже.', {
            keyboard: JSON.stringify({
                one_time: false,
                buttons: [
                    [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
                    [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
                    [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
                    [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
                ]
            })
        });
        userStates.delete(userId);
        return { action: 'error' };
    }
}

module.exports = {
    handleCreateProfile,
    handleProfileTypeChoice,
    handleGenderChoice,
    handleSearchGenderChoice,
    handleNameInput,
    handleAgeInput,
    handleCityInput,
    handlePhotoUpload,
    ProfileSteps
};