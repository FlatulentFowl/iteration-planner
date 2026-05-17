import express from "express";
import path from "path";
import { createServer as createHttpServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";

const PORT = 3000;
const SESSIONS_DIR = path.join(process.cwd(), "sessions");

// Ensure sessions directory exists
fs.mkdir(SESSIONS_DIR, { recursive: true }).catch(console.error);

interface Task {
  id: string;
  content: string;
  color?: string;
  area?: string;
}

interface BoardState {
  backlog: Task[];
  iteration0: Task[];
  iteration1: Task[];
  iteration2: Task[];
  iteration3: Task[];
}

const DEFAULT_STATE: BoardState = {
  backlog: [
    { id: "task-1", content: "Design user profile mockup", color: "#6366f1" },
    { id: "task-2", content: "Implement authentication flow", color: "#3b82f6" },
    { id: "task-3", content: "Setup database schema", color: "#ef4444" },
    { id: "task-4", content: "Create landing page assets", color: "#10b981" },
    { id: "task-5", content: "Write API documentation", color: "#f59e0b" },
    { id: "task-6", content: "Refactor state management", color: "#8b5cf6" },
  ],
  iteration0: [],
  iteration1: [],
  iteration2: [],
  iteration3: [],
};

let cachedDefaultTasks: Task[] | null = null;

async function loadDefaultTasks(): Promise<Task[]> {
  try {
    const csvData = await fs.readFile(path.join(process.cwd(), "tasks.csv"), "utf-8");
    const lines = csvData.split("\n");
    const tasks: Task[] = [];
    
    // Skip header: area,task,color
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const [area, taskName, color] = line.split(",").map(part => part.trim());
      if (taskName) {
        tasks.push({
          id: `task-static-${i}`,
          content: taskName,
          area: area || "",
          color: color || "#6366f1"
        });
      }
    }
    cachedDefaultTasks = tasks;
    return tasks;
  } catch (error) {
    console.error("Error loading tasks.csv, using empty backlog:", error);
    return [];
  }
}

// Sessions in memory
const sessionStore = new Map<string, BoardState>();

async function loadSessionState(sessionId: string): Promise<BoardState> {
  if (sessionStore.has(sessionId)) {
    return sessionStore.get(sessionId)!;
  }
  const defaultTasks = await loadDefaultTasks();
  const initialState = {
    backlog: defaultTasks,
    iteration0: [],
    iteration1: [],
    iteration2: [],
    iteration3: [],
  };
  sessionStore.set(sessionId, initialState);
  return initialState;
}

async function saveSessionState(sessionId: string, state: BoardState) {
  sessionStore.set(sessionId, state);
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    
    // Handle session initialization
    socket.on("session:init", async (sessionId: string) => {
      if (!sessionId || sessionId.length < 5) return;
      
      socket.join(sessionId);
      const sessionState = await loadSessionState(sessionId);
      socket.emit("state:init", sessionState);
    });

    // Handle updates for a specific session
    socket.on("state:update", async ({ sessionId, state }: { sessionId: string; state: BoardState }) => {
      if (!sessionId) return;
      await saveSessionState(sessionId, state);
      // Only broadcast to other tabs of the SAME user session
      socket.to(sessionId).emit("state:updated", state);
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // API Route for raw data access (requires sessionId query param)
  app.get("/api/data", async (req, res) => {
    const sessionId = req.query.sessionId as string;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    const state = await loadSessionState(sessionId);
    res.json(state);
  });

  // Submit route - handles the final vote and "emails" result
  app.post("/api/submit", async (req, res) => {
    const { board, sessionId } = req.body;
    const recipient = "rgottwald@bluebridgeone.com";
    
    console.log("======================================");
    console.log(`SUBMISSION RECEIVED from session ${sessionId} for ${recipient}`);
    console.log("======================================");

    res.json({ status: "ok", message: "Logged submission to console." });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
