// server/index.js
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// Serve the client folder (assumes this file is at client/server/index.js)
// So client root is one level up from server/
const clientRoot = path.resolve(__dirname, "..");
app.use(express.static(clientRoot));

// Optional: If you want a specific entry, uncomment:
// app.get("/", (_req, res) => res.sendFile(path.join(clientRoot, "index_multiplayer.html")));

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
  socket.emit("welcome", "Connected successfully");

  socket.on("pingServer", (data) => {
    console.log("Ping from client:", data);
    socket.emit("pongClient", { time: Date.now(), echo: data?.time ?? null });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

httpServer.listen(PORT, () => {
  console.log("Server running on port", PORT);
  console.log("Open: http://localhost:" + PORT + "/index_multiplayer.html");
});
