import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

socket.on("connect", () => {
  console.log("Connected");
  socket.emit("session:init", "test_session_id");
});

socket.on("state:init", (state) => {
  console.log("Received state:", JSON.stringify(state, null, 2));
  process.exit(0);
});

socket.on("connect_error", (err) => {
  console.error("Connection error:", err);
  process.exit(1);
});
