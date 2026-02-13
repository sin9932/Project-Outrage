// client/js/network.js
// Socket.IO client bootstrap for local dev server on port 3000.
// Usage:
// 1) Ensure server is running: npm start
// 2) Open the served page (recommended) or your local file (CORS may apply depending on your setup)
// 3) Check DevTools console

const socket = io("http://localhost:3000", {
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("[net] connected:", socket.id);
});

socket.on("disconnect", (reason) => {
  console.log("[net] disconnected:", reason);
});

socket.on("welcome", (data) => {
  console.log("[net] welcome:", data);
});

// Ping test: call window.testSend() in console
window.testSend = function () {
  socket.emit("pingServer", { time: Date.now() });
};

// Export if you want to hook it into your game code later
export { socket };
