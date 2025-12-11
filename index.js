const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Настройка CORS для работы с GitHub Pages
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
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
app.use(cors());
app.use(express.json());

app.get('/api/servers', (req, res) => {
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

// Обработка WebSocket соединений
io.on('connection', (socket) => {
  console.log(`Новый игрок подключился: ${socket.id}`);

  socket.on('join', (data) => {
    const { username, room } = data;
    
    // Проверка существования сервера
    if (!gameServers[room]) {
      socket.emit('error', 'Сервер не найден');
      return;
    }

    const server = gameServers[room];
    
    // Проверка заполненности сервера
    const playerCount = Object.keys(server.players).length;
    if (playerCount >= server.maxPlayers) {
      socket.emit('error', 'Сервер переполнен');
      return;
    }

    // Проверка имени пользователя
    if (!username || username.length < 2 || username.length > 20) {
      socket.emit('error', 'Неверное имя пользователя');
      return;
    }

    // Проверка уникальности имени на сервере
    const existingUsernames = Object.values(server.players).map(p => p.username);
    if (existingUsernames.includes(username)) {
      socket.emit('error', 'Имя уже занято на этом сервере');
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
    
    console.log(`${username} присоединился к ${room}`);
  });

  socket.on('playerMovement', (data) => {
    const { room, position, rotation } = data;
    
    if (!gameServers[room] || !gameServers[room].players[socket.id]) {
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
  });

  socket.on('disconnect', () => {
    // Поиск и удаление игрока из всех серверов
    Object.keys(gameServers).forEach(room => {
      const server = gameServers[room];
      if (server.players[socket.id]) {
        const username = server.players[socket.id].username;
        delete server.players[socket.id];
        
        // Уведомление других игроков
        io.to(room).emit('playerDisconnected', socket.id);
        io.to(room).emit('playerCount', Object.keys(server.players).length);
        
        console.log(`${username} отключился от ${room}`);
      }
    });
  });

  socket.on('ping', () => {
    socket.emit('pong');
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
      }
    });
  });
}, 60000); // Каждую минуту

// Старт сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
  console.log('Доступные серверы:');
  Object.keys(gameServers).forEach(serverId => {
    const server = gameServers[serverId];
    console.log(`- ${server.name} (ID: ${serverId})`);
  });
});

// Экспорт для Vercel
module.exports = app;
