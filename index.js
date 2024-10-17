require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const clients = new Map();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

wss.on('connection', (ws, request) => {
  const userId = request.userId;
  console.log(`User ${userId} connected`);

  clients.set(userId, ws);

  ws.on('close', () => {
    clients.delete(userId);
    console.log(`User ${userId} disconnected`);
  });
});

app.use(cors());
app.use(express.json());

app.post('/api/login', (req, res) => {
  const userId = req.body.userId;
  console.log(userId);
  const token = jwt.sign({ userId: userId }, process.env.JWT_SECRET);
  res.json({ token });
});

app.post('/api/send-message', authenticateToken, (req, res) => {
  const { userId, message } = req.body;
  console.log(userId);
  const senderUserId = req.user.userId;

  const client = clients.get(userId);

  if (client) {
    client.send(JSON.stringify({ type: 'new_message', message, from: senderUserId }));
    res.status(200).json({ success: true, message: 'Message sent' });
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

app.post('/api/send-function-response', authenticateToken, (req, res) => {
  const { userId, functionResponse } = req.body;
  console.log(userId);
  const senderUserId = req.user.userId;

  const client = clients.get(userId);

  if (client) {
    client.send(JSON.stringify({ type: 'function_response', functionResponse, from: senderUserId }));
    res.status(200).json({ success: true, message: 'function response sent' });
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

server.on('upgrade', function upgrade(request, socket, head) {
  const token = request.url.split('token=')[1];

  if (!token) {
    socket.destroy();
    return;
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      socket.destroy();
      return;
    }

    request.userId = decoded.userId;
    wss.handleUpgrade(request, socket, head, function done(ws) {
      wss.emit('connection', ws, request);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});