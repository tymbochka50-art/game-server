// Версия для Vercel Serverless Function
export default function handler(req, res) {
    // === ВАЖНО: РАЗРЕШАЕМ CORS ДЛЯ РАСШИРЕНИЙ ===
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Обрабатываем предварительный OPTIONS запрос
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    // === КОНФИГУРАЦИЯ ОБНОВЛЕНИЯ ===
    const config = {
        // Текущая актуальная версия
        currentVersion: "1.1",
        
        // Минимальная версия (если у пользователя ниже - критическое обновление)
        minVersion: "1.0",
        
        // URL для скачивания обновления
        downloadUrl: "https://github.com/YOUR-USERNAME/extension/archive/refs/tags/v1.1.zip",
        
        // GitHub релиз (альтернативная ссылка)
        githubRelease: "https://github.com/YOUR-USERNAME/extension/releases/tag/v1.1",
        
        // Что нового в обновлении
        changelog: [
            "✅ Исправлены все ошибки",
            "✨ Добавлена новая функция",
            "🚀 Улучшена производительность",
            "🔒 Повышена безопасность"
        ],
        
        // Размер обновления (в МБ)
        size: "2.4",
        
        // Дата релиза
        releaseDate: "2024-01-15",
        
        // Критическое ли обновление (true/false)
        critical: false,
        
        // Сообщение для пользователя
        message: "Доступно новое обновление!",
        
        // Таймстамп
        timestamp: new Date().toISOString()
    };
    
    // === ПАРАМЕТРЫ ИЗ ЗАПРОСА ===
    const userVersion = req.query.v || '1.0'; // Версия пользователя
    
    // === ЛОГИКА ПРОВЕРКИ ===
    const userVersionNum = parseVersion(userVersion);
    const currentVersionNum = parseVersion(config.currentVersion);
    
    // Если версия пользователя меньше актуальной
    if (userVersionNum < currentVersionNum) {
        res.status(200).json({
            success: true,
            updateAvailable: true,
            ...config,
            userVersion: userVersion,
            needsUpdate: true
        });
    } else {
        // Версия актуальна
        res.status(200).json({
            success: true,
            updateAvailable: false,
            message: "У вас актуальная версия!",
            currentVersion: config.currentVersion,
            userVersion: userVersion,
            timestamp: config.timestamp
        });
    }
}

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function parseVersion(versionString) {
    // Конвертируем "1.2.3" в 1002003 для сравнения
    const parts = versionString.split('.').map(Number);
    let result = 0;
    
    if (parts.length > 0) result += parts[0] * 1000000; // Мажорная
    if (parts.length > 1) result += parts[1] * 1000;    // Минорная
    if (parts.length > 2) result += parts[2];           // Патч
    
    return result;
}

// Альтернативная функция сравнения версий
function compareVersions(v1, v2) {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const part1 = v1Parts[i] || 0;
        const part2 = v2Parts[i] || 0;
        
        if (part1 > part2) return 1;
        if (part1 < part2) return -1;
    }
    return 0;
}
