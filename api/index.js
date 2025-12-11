const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);

// Настройка CORS для Express API
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://tymbochka50-art.github.io',
        'https://tymb.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ];
    
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // Обработка предварительного запроса OPTIONS
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Настройка Socket.IO
const io = socketIO(server, {
    cors: {
        origin: (origin, callback) => {
            const allowedOrigins = [
                'https://tymbochka50-art.github.io',
                'https://tymb.github.io',
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'http://localhost:5500',
                'http://127.0.0.1:5500'
            ];
            
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Not allowed by CORS'));
            }
        },
        methods: ["GET", "POST"],
        credentials: true,
        transports: ['websocket', 'polling']
    },
    path: '/socket.io/'
});

// Хранилище серверов и игроков
const gameServers = {
    'main-server': {
        name: 'Основной сервер',
        description: 'Основной игровой сервер',
        maxPlayers: 20,
        players: {}
    },
    'server-europe': {
        name: 'Европейский сервер',
        description: 'Низкий пинг для Европы',
        maxPlayers: 15,
        players: {}
    },
    'server-usa': {
        name: 'Американский сервер',
        description: 'Для игроков из США',
        maxPlayers: 15,
        players: {}
    }
};

// API для получения списка серверов
app.use(express.json());

app.get('/api/servers', (req, res) => {
    try {
        const servers = Object.keys(gameServers).map(serverId => {
            const server = gameServers[serverId];
            return {
                id: serverId,
                name: server.name,
                description: server.description,
                maxPlayers: server.maxPlayers,
                players: Object.keys(server.players).length
            };
        });
        console.log('Запрос списка серверов:', servers);
        res.json(servers);
    } catch (error) {
        console.error('Ошибка при получении списка серверов:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

// Тестовый endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Отладка подключений
app.get('/debug', (req, res) => {
    const debugInfo = {
        totalConnections: io.engine.clientsCount,
        servers: {}
    };
    
    Object.keys(gameServers).forEach(serverId => {
        debugInfo.servers[serverId] = {
            playerCount: Object.keys(gameServers[serverId].players).length,
            players: Object.values(gameServers[serverId].players).map(p => ({
                id: p.id,
                username: p.username,
                position: p.position
            }))
        };
    });
    
    res.json(debugInfo);
});

// Обработка WebSocket соединений
io.on('connection', (socket) => {
    console.log(`✅ Новое подключение: ${socket.id}`);
    console.log(`📡 Клиент подключился с origin: ${socket.handshake.headers.origin}`);
    console.log(`🔗 Socket transport: ${socket.conn.transport.name}`);
    
    // Отправляем приветственное сообщение
    socket.emit('welcome', { 
        message: 'Подключено к игровому серверу',
        serverTime: Date.now(),
        socketId: socket.id
    });

    socket.on('join', (data) => {
        console.log(`🎮 Запрос на подключение:`, data);
        
        const { username, room } = data;
        
        // Проверка существования сервера
        if (!gameServers[room]) {
            socket.emit('error', 'Сервер не найден');
            console.log(`❌ Сервер ${room} не найден для ${socket.id}`);
            return;
        }

        const server = gameServers[room];
        
        // Проверка заполненности сервера
        const playerCount = Object.keys(server.players).length;
        if (playerCount >= server.maxPlayers) {
            socket.emit('error', 'Сервер переполнен');
            console.log(`❌ Сервер ${room} переполнен для ${socket.id}`);
            return;
        }

        // Проверка имени пользователя
        if (!username || username.length < 2 || username.length > 20) {
            socket.emit('error', 'Неверное имя пользователя');
            console.log(`❌ Неверное имя пользователя: ${username}`);
            return;
        }

        // Проверка уникальности имени на сервере
        const existingUsernames = Object.values(server.players).map(p => p.username);
        if (existingUsernames.includes(username)) {
            socket.emit('error', 'Имя уже занято на этом сервере');
            console.log(`❌ Имя ${username} уже занято на сервере ${room}`);
            return;
        }

        // Вход в комнату
        socket.join(room);
        
        // Создание данных игрока
        server.players[socket.id] = {
            id: socket.id,
            username: username,
            position: { 
                x: Math.random() * 10 - 5, 
                y: 1, 
                z: Math.random() * 10 - 5 
            },
            rotation: { x: 0, y: 0, z: 0 },
            room: room,
            joinedAt: Date.now()
        };

        // Отправка текущих игроков новому игроку
        socket.emit('currentPlayers', server.players);
        
        // Уведомление других игроков о новом игроке
        socket.to(room).emit('newPlayer', server.players[socket.id]);

        // Обновление счета игроков для всех в комнате
        io.to(room).emit('playerCount', Object.keys(server.players).length);
        
        console.log(`✅ ${username} присоединился к ${room}`);
        console.log(`📊 Игроков на сервере ${room}: ${Object.keys(server.players).length}`);
        
        // Отправляем отладочную информацию
        socket.emit('serverInfo', {
            serverName: server.name,
            playerCount: Object.keys(server.players).length,
            otherPlayers: Object.keys(server.players).length - 1
        });
    });

    socket.on('playerMovement', (data) => {
        const { room, position, rotation } = data;
        
        if (!gameServers[room] || !gameServers[room].players[socket.id]) {
            console.log(`❌ Движение игрока не обработано: не найден сервер или игрок`);
            return;
        }

        // Обновление позиции игрока
        gameServers[room].players[socket.id].position = position;
        gameServers[room].players[socket.id].rotation = rotation;
        
        // Рассылка обновления другим игрокам
        socket.to(room).emit('playerMoved', {
            id: socket.id,
            position: position,
            rotation: rotation
        });
        
        // Логируем движение
        console.log(`🚶 ${gameServers[room].players[socket.id].username} движется:`, 
                   `x:${position.x.toFixed(2)}, y:${position.y.toFixed(2)}, z:${position.z.toFixed(2)}`);
    });

    socket.on('disconnect', (reason) => {
        console.log(`❌ Отключение: ${socket.id}, причина: ${reason}`);
        
        // Поиск и удаление игрока из всех серверов
        Object.keys(gameServers).forEach(room => {
            const server = gameServers[room];
            if (server.players[socket.id]) {
                const username = server.players[socket.id].username;
                delete server.players[socket.id];
                
                // Уведомление других игроков
                io.to(room).emit('playerDisconnected', socket.id);
                io.to(room).emit('playerCount', Object.keys(server.players).length);
                
                console.log(`👋 ${username} отключился от ${room}`);
            }
        });
    });

    socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
    });
});

// Функция очистки неактивных игроков
setInterval(() => {
    Object.keys(gameServers).forEach(room => {
        const server = gameServers[room];
        const now = Date.now();
        
        Object.keys(server.players).forEach(playerId => {
            const player = server.players[playerId];
            // Удаляем игроков, которые не активны более 5 минут
            if (now - player.joinedAt > 300000) {
                delete server.players[playerId];
                io.to(room).emit('playerDisconnected', playerId);
                io.to(room).emit('playerCount', Object.keys(server.players).length);
                console.log(`🕒 Удален неактивный игрок ${player.username} из ${room}`);
            }
        });
    });
}, 60000); // Каждую минуту

// Старт сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    console.log('🌐 Доступные серверы:');
    Object.keys(gameServers).forEach(serverId => {
        const server = gameServers[serverId];
        console.log(`   - ${server.name} (ID: ${serverId}) [${server.maxPlayers} игроков]`);
    });
    console.log(`📡 Socket.IO endpoint: ws://localhost:${PORT}/socket.io/`);
    console.log(`🌐 HTTP API: http://localhost:${PORT}/api/servers`);
});

// Для Vercel Serverless Functions
module.exports = (req, res) => {
    // Перенаправляем все запросы к /socket.io на WebSocket сервер
    if (req.url.includes('/socket.io/')) {
        // WebSocket соединения обрабатываются автоматически
        res.writeHead(200);
        res.end('Socket.IO endpoint');
    } else {
        // Обычные HTTP запросы
        app(req, res);
    }
};
