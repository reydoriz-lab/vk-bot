const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');

// Проверка возраста
function isValidAge(age) {
    const numAge = parseInt(age);
    return !isNaN(numAge) && numAge >= 18 && numAge <= 100;
}

// Проверка имени
function isValidName(name) {
    return name && name.trim().length >= 2 && name.trim().length <= 50;
}

// Проверка города
function isValidCity(city) {
    return city && city.trim().length >= 2 && city.trim().length <= 50;
}

// Создание временной папки
function ensureTempFolder() {
    if (!fs.existsSync(config.tempFolder)) {
        fs.mkdirSync(config.tempFolder, { recursive: true });
    }
}

// Генерация случайного ID
function generateTempId() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Очистка старых временных файлов
function cleanOldTempFiles() {
    if (!fs.existsSync(config.tempFolder)) return;
    
    const now = Date.now();
    const files = fs.readdirSync(config.tempFolder);
    
    for (const file of files) {
        const filePath = path.join(config.tempFolder, file);
        const stats = fs.statSync(filePath);
        const ageHours = (now - stats.mtimeMs) / (1000 * 60 * 60);
        
        if (ageHours > 1) {
            fs.unlinkSync(filePath);
        }
    }
}

// Задержка
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Экранирование текста
function escapeText(text) {
    if (!text) return '';
    return text.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// Форматирование анкеты
function formatProfile(profile, isAnon = false) {
    if (isAnon) {
        return `🔞 Анонимная анкета:\n\n📝 Имя: ${escapeText(profile.name)}\n🎂 Возраст: ${profile.age}`;
    } else {
        return `📋 Обычная анкета:\n\n📝 Имя: ${escapeText(profile.name)}\n🎂 Возраст: ${profile.age}\n🏙 Город: ${escapeText(profile.city)}`;
    }
}

// Скачивание файла по URL
async function downloadFile(url) {
    const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream'
    });
    return response.data;
}

// Загрузка файла на сервер ВК
async function uploadFileToVK(uploadUrl, fileStream, filename = 'file.mp3') {
    const form = new FormData();
    form.append('file', fileStream, { filename: filename });
    
    const response = await axios.post(uploadUrl, form, {
        headers: form.getHeaders()
    });
    return response.data;
}

module.exports = {
    isValidAge,
    isValidName,
    isValidCity,
    ensureTempFolder,
    generateTempId,
    cleanOldTempFiles,
    sleep,
    escapeText,
    formatProfile,
    downloadFile,
    uploadFileToVK
};