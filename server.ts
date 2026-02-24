import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);

// Enable CORS so your Netlify site can talk to this Render server
const io = new Server(httpServer, {
  cors: {
    origin: "*", // This allows any website to connect
    methods: ["GET", "POST"]
  },
});

// Render provides the port in an environment variable. If it's missing, use 10000.
const PORT = process.env.PORT || 10000;

// Lobby state
const lobbies: Record<string, { players: Record<string, { id: string, name: string }>, targetScore: number }> = {};
const socketToPlayer: Record<string, { lobbyKey: string, playerId: string }> = {};

// Basic health check for Render
app.get("/", (req: any, res: any) => {
  res.send("Lobby Server is Running!");
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  const handleLeave = (lobbyKey: string, playerId: string) => {
    if (lobbies[lobbyKey] && lobbies[lobbyKey].players[playerId]) {
      delete lobbies[lobbyKey].players[playerId];
      delete socketToPlayer[socket.id];
      
      const remainingPlayers = Object.values(lobbies[lobbyKey].players);
      if (remainingPlayers.length === 0) {
        delete lobbies[lobbyKey];
        console.log(`Lobby ${lobbyKey} deleted (empty)`);
      } else {
        io.to(lobbyKey).emit("lobby-update", {
          players: remainingPlayers,
          targetScore: lobbies[lobbyKey].targetScore
        });
      }
    }
  };

  socket.on("join-lobby", ({ lobbyKey, playerName, playerId }) => {
    const oldInfo = socketToPlayer[socket.id];
    if (oldInfo) {
      handleLeave(oldInfo.lobbyKey, oldInfo.playerId);
      socket.leave(oldInfo.lobbyKey);
    }

    socket.join(lobbyKey);
    
    if (!lobbies[lobbyKey]) {
      lobbies[lobbyKey] = { players: {}, targetScore: 100 };
    }

    lobbies[lobbyKey].players[playerId] = { id: playerId, name: playerName };
    socketToPlayer[socket.id] = { lobbyKey, playerId };
    
    const playerList = Object.values(lobbies[lobbyKey].players);
    io.to(lobbyKey).emit("lobby-update", {
      players: playerList,
      targetScore: lobbies[lobbyKey].targetScore
    });
  });

  socket.on("update-target-score", ({ lobbyKey, targetScore }) => {
    if (lobbies[lobbyKey]) {
      lobbies[lobbyKey].targetScore = targetScore;
      io.to(lobbyKey).emit("target-score-updated", targetScore);
    }
  });

  socket.on("change-name", ({ lobbyKey, playerId, newName }) => {
    if (lobbies[lobbyKey] && lobbies[lobbyKey].players[playerId]) {
      lobbies[lobbyKey].players[playerId].name = newName;
      io.to(lobbyKey).emit("lobby-update", {
        players: Object.values(lobbies[lobbyKey].players),
        targetScore: lobbies[lobbyKey].targetScore
      });
    }
  });

  socket.on("start-game", ({ lobbyKey }) => {
    io.to(lobbyKey).emit("game-started");
  });

  socket.on("leave-lobby", ({ lobbyKey }) => {
    const info = socketToPlayer[socket.id];
    if (info) {
      handleLeave(info.lobbyKey, info.playerId);
      socket.leave(info.lobbyKey);
    }
  });

  socket.on("disconnect", () => {
    const info = socketToPlayer[socket.id];
    if (info) {
      handleLeave(info.lobbyKey, info.playerId);
    }
  });
});

// Simplified start command
httpServer.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
