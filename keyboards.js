const keyboards = {
    mainMenu: {
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
            [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
            [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
            [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }]
        ]
    },
    
    adminButton: {
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "🔍 Обычный поиск" }, color: "primary" }],
            [{ action: { type: "text", label: "🔞 Анонимный поиск" }, color: "primary" }],
            [{ action: { type: "text", label: "📋 Моя анкета" }, color: "primary" }],
            [{ action: { type: "text", label: "✏️ Создать анкету" }, color: "positive" }],
            [{ action: { type: "text", label: "👑 Админ-панель" }, color: "negative" }]
        ]
    },
    
    adminPanel: {
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "📊 Статистика" }, color: "primary" }],
            [{ action: { type: "text", label: "👥 Пользователи" }, color: "primary" }],
            [{ action: { type: "text", label: "📋 Анкеты" }, color: "primary" }],
            [{ action: { type: "text", label: "🚫 Бан/Разбан" }, color: "negative" }],
            [{ action: { type: "text", label: "📢 Рассылка" }, color: "positive" }],
            [{ action: { type: "text", label: "🔙 В главное меню" }, color: "secondary" }]
        ]
    },
    
    adminUsersNav: {
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "⬅️ Предыдущие" }, color: "primary" }],
            [{ action: { type: "text", label: "➡️ Следующие" }, color: "primary" }],
            [{ action: { type: "text", label: "🔙 Назад в админку" }, color: "secondary" }]
        ]
    },
    
    adminProfilesNav: {
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "⬅️ Предыдущие" }, color: "primary" }],
            [{ action: { type: "text", label: "➡️ Следующие" }, color: "primary" }],
            [{ action: { type: "text", label: "🔙 Назад в админку" }, color: "secondary" }]
        ]
    },
    
    adminBanMenu: {
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "🔙 Назад в админку" }, color: "secondary" }]
        ]
    },
    
    adminBroadcastMenu: {
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "🔙 Назад в админку" }, color: "secondary" }]
        ]
    },
    
    // ... остальные клавиатуры без изменений
    profileTypeMenu: {
        one_time: true,
        buttons: [
            [{ action: { type: "text", label: "📋 Обычная анкета" }, color: "primary" }],
            [{ action: { type: "text", label: "🔞 Анонимная анкета" }, color: "primary" }]
        ]
    },
    
    genderMenu: {
        one_time: true,
        buttons: [
            [{ action: { type: "text", label: "👨 Мужской" }, color: "primary" }],
            [{ action: { type: "text", label: "👩 Женский" }, color: "primary" }]
        ]
    },
    
    searchGenderMenu: {
        one_time: true,
        buttons: [
            [{ action: { type: "text", label: "👨 Мужчин" }, color: "primary" }],
            [{ action: { type: "text", label: "👩 Женщин" }, color: "primary" }],
            [{ action: { type: "text", label: "👥 Всех" }, color: "primary" }]
        ]
    },
    
    profileActionsMenu: {
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "🗑 Удалить анкету" }, color: "negative" }],
            [{ action: { type: "text", label: "🔙 Назад в меню" }, color: "secondary" }]
        ]
    },
    
    searchActionsMenu: {
        one_time: true,
        buttons: [
            [{ action: { type: "text", label: "❤️ Лайк" }, color: "positive" }],
            [{ action: { type: "text", label: "👎 Дизлайк" }, color: "negative" }],
            [{ action: { type: "text", label: "🚫 Закончить поиск" }, color: "secondary" }]
        ]
    },
    
    chatMenu: {
        one_time: false,
        buttons: [
            [{ action: { type: "text", label: "❌ Завершить чат" }, color: "negative" }],
            [{ action: { type: "text", label: "🔙 В главное меню" }, color: "secondary" }]
        ]
    },
    
    matchMenu: {
        one_time: true,
        buttons: [
            [{ action: { type: "text", label: "💬 Перейти в чат" }, color: "primary" }],
            [{ action: { type: "text", label: "🔙 В главное меню" }, color: "secondary" }]
        ]
    },
    
    backMenu: {
        one_time: true,
        buttons: [
            [{ action: { type: "text", label: "🔙 Назад в меню" }, color: "secondary" }]
        ]
    },
    
    removeKeyboard: { buttons: [] }
};

module.exports = keyboards;