import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const PORT = 3000;

// Lobby state: key -> { players: { id: { name, ... } }, targetScore: number }
const lobbies: Record<string, { players: Record<string, { id: string, name: string }>, targetScore: number }> = {};
const socketToPlayer: Record<string, { lobbyKey: string, playerId: string }> = {};

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
        console.log(`Player ${playerId} left lobby ${lobbyKey}. Remaining: ${remainingPlayers.length}`);
      }
    }
  };

  socket.on("join-lobby", ({ lobbyKey, playerName, playerId }) => {
    // Leave previous lobby if any
    const oldInfo = socketToPlayer[socket.id];
    if (oldInfo) {
      handleLeave(oldInfo.lobbyKey, oldInfo.playerId);
      socket.leave(oldInfo.lobbyKey);
    }

    socket.join(lobbyKey);
    
    if (!lobbies[lobbyKey]) {
      lobbies[lobbyKey] = { players: {}, targetScore: 100 };
      console.log(`Created new lobby: ${lobbyKey}`);
    }

    lobbies[lobbyKey].players[playerId] = { id: playerId, name: playerName };
    socketToPlayer[socket.id] = { lobbyKey, playerId };
    
    const playerList = Object.values(lobbies[lobbyKey].players);
    io.to(lobbyKey).emit("lobby-update", {
      players: playerList,
      targetScore: lobbies[lobbyKey].targetScore
    });
    console.log(`Player ${playerName} (${playerId}) joined lobby ${lobbyKey}. Total players: ${playerList.length}`);
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

  socket.on("start-game", ({ lobbyKey, initialState }) => {
    io.to(lobbyKey).emit("game-started", initialState);
  });

  socket.on("game-update", ({ lobbyKey, gameState }) => {
    io.to(lobbyKey).emit("game-updated", gameState);
  });

  socket.on("player-ready", ({ lobbyKey, playerId }) => {
    io.to(lobbyKey).emit("player-ready-updated", playerId);
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
    console.log("User disconnected:", socket.id);
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
