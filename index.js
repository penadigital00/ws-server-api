require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });

const MAX_CONNECTIONS_PER_USER = 5; // Set the maximum allowed connections per user
const clients = new Map();

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

wss.on("connection", (ws, request) => {
  const userId = request.userId;
  console.log(`User ${userId} connected`);

  if (!clients.has(userId)) {
    clients.set(userId, new Set());
  }

  const userConnections = clients.get(userId);

  if (userConnections.size >= MAX_CONNECTIONS_PER_USER) {
    console.log(
      `User ${userId} exceeded max connections. Closing new connection.`,
    );
    ws.close(1008, "Maximum connections limit reached");
    return;
  }

  userConnections.add(ws);

  ws.on("close", () => {
    userConnections.delete(ws);
    if (userConnections.size === 0) {
      clients.delete(userId);
    }
    console.log(`User ${userId} disconnected`);
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error for user ${userId}:`, error);
    userConnections.delete(ws);
    if (userConnections.size === 0) {
      clients.delete(userId);
    }
  });
});

app.use(cors());
app.use(express.json());

app.post("/api/login", (req, res) => {
  const userId = req.body.userId;
  console.log(userId);
  const token = jwt.sign({ userId: userId }, process.env.JWT_SECRET);
  res.json({ token });
});

app.post("/api/send-message", authenticateToken, (req, res) => {
  const { userId, message } = req.body;
  console.log(userId);
  const senderUserId = req.user.userId;

  if (clients.has(userId)) {
    clients.get(userId).forEach((client) => {
      client.send(
        JSON.stringify({ type: "new_message", message, from: senderUserId }),
      );
    });
    res.status(200).json({ success: true, message: "Message sent" });
  } else {
    res.status(404).json({ success: false, message: "User not found" });
  }
});

server.on("upgrade", function upgrade(request, socket, head) {
  const token = request.url.split("token=")[1];

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

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

process.on("unhandledRejection", (reason, promise) => {
  console.log("Unhandled Rejection at:", promise, "reason:", reason);
});

