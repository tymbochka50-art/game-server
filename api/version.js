export default function handler(req, res) {
  // Конфигурация обновления
  const updateInfo = {
    version: '1.1', // Новая версия
    currentVersion: '1.0',
    updateUrl: 'https://github.com/yourusername/extension/releases/download/v1.1/extension.zip',
    downloadUrl: 'https://your-project.vercel.app/api/download',
    changelog: 'Исправлены ошибки, добавлены новые функции',
    timestamp: new Date().toISOString(),
    
    // Динамическое обновление (опционально)
    files: {
      // Можно передавать обновленные файлы напрямую
      'popup.js': 'console.log("Updated version"); // Новый код'
    }
  };
  
  // Поддержка CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'GET') {
    res.status(200).json(updateInfo);
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
