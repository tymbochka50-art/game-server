const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);

// Настройка CORS для Express API
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://tymbochka50-art.github.io',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5500'
    ];
    
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
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
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'http://localhost:5500'
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
    }
};

// API для получения списка серверов
app.use(express.json());

app.get('/api/servers', (req, res) => {
    console.log('GET /api/servers');
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
    res.json(servers);
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Debug endpoint
app.get('/api/debug', (req, res) => {
    const debugInfo = {
        totalConnections: io.engine?.clientsCount || 0,
        servers: {}
    };
    
    Object.keys(gameServers).forEach(serverId => {
        debugInfo.servers[serverId] = {
            playerCount: Object.keys(gameServers[serverId].players).length,
            players: Object.values(gameServers[serverId].players).map(p => ({
                id: p.id,
                username: p.username
            }))
        };
    });
    
    res.json(debugInfo);
});

// Обработка WebSocket соединений
io.on('connection', (socket) => {
    console.log(`Новое подключение: ${socket.id}`);
    
    socket.emit('welcome', { 
        message: 'Connected to game server',
        socketId: socket.id,
        timestamp: Date.now()
    });

    socket.on('join', (data) => {
        console.log('Join request:', data);
        const { username, room } = data;
        
        if (!gameServers[room]) {
            socket.emit('error', 'Server not found');
            return;
        }

        const server = gameServers[room];
        
        if (Object.keys(server.players).length >= server.maxPlayers) {
            socket.emit('error', 'Server is full');
            return;
        }

        if (!username || username.length < 2 || username.length > 20) {
            socket.emit('error', 'Invalid username');
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

        // Отправка текущих игроков
        socket.emit('currentPlayers', server.players);
        
        // Уведомление других игроков
        socket.to(room).emit('newPlayer', server.players[socket.id]);

        // Обновление счетчика
        io.to(room).emit('playerCount', Object.keys(server.players).length);
        
        console.log(`${username} joined ${room}, total: ${Object.keys(server.players).length}`);
    });

    socket.on('playerMovement', (data) => {
        const { room, position } = data;
        
        if (gameServers[room] && gameServers[room].players[socket.id]) {
            gameServers[room].players[socket.id].position = position;
            
            socket.to(room).emit('playerMoved', {
                id: socket.id,
                position: position
            });
        }
    });

    socket.on('disconnect', () => {
        Object.keys(gameServers).forEach(room => {
            const server = gameServers[room];
            if (server.players[socket.id]) {
                const username = server.players[socket.id].username;
                delete server.players[socket.id];
                
                io.to(room).emit('playerDisconnected', socket.id);
                io.to(room).emit('playerCount', Object.keys(server.players).length);
                
                console.log(`${username} disconnected from ${room}`);
            }
        });
    });
});

// Для локальной разработки
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`🚀 Local server running on port ${PORT}`);
        console.log(`📡 Socket.IO: ws://localhost:${PORT}/socket.io/`);
        console.log(`🌐 API: http://localhost:${PORT}/api/servers`);
    });
}

// Экспорт для Vercel Serverless
module.exports = (req, res) => {
    // Обработка HTTP запросов через Express
    if (req.url.includes('/socket.io/')) {
        // Socket.IO обрабатывает WebSocket соединения автоматически
        // Для Vercel нужно вернуть правильный ответ
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'socket.io' }));
    } else {
        // Остальные запросы через Express
        app(req, res);
    }
};
