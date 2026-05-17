import express from "express";
import path from "path";
import { createServer as createHttpServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import fs from "fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;
const SESSIONS_DIR = path.join(process.cwd(), "sessions");

// Ensure sessions directory exists
fs.mkdir(SESSIONS_DIR, { recursive: true }).catch(console.error);

// S3 Client initialization
const s3Client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
});

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
    const csvData = await fs.readFile(path.join(process.cwd(), "src", "tasks.csv"), "utf-8");
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
  if (sessionStore.has(sessionId)) return sessionStore.get(sessionId)!;

  try {
    const file = path.join(SESSIONS_DIR, `${sessionId}.json`);
    const raw = await fs.readFile(file, 'utf-8');
    const state = JSON.parse(raw) as BoardState;
    sessionStore.set(sessionId, state);
    return state;
  } catch {
    // no saved session — first visit
  }

  const defaultTasks = await loadDefaultTasks();
  const initialState = { backlog: defaultTasks, iteration0: [], iteration1: [], iteration2: [], iteration3: [] };
  sessionStore.set(sessionId, initialState);
  return initialState;
}

async function saveSessionState(sessionId: string, state: BoardState) {
  sessionStore.set(sessionId, state);
  const file = path.join(SESSIONS_DIR, `${sessionId}.json`);
  await fs.writeFile(file, JSON.stringify(state), 'utf-8').catch(console.error);
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

  // Submit route - uploads board state to S3
  app.post("/api/submit", async (req, res) => {
    const { board, sessionId } = req.body;

    if (!board || !sessionId) {
      return res.status(400).json({ error: "board and sessionId required" });
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const filename = `votes-${sessionId}-${timestamp}.json`;
      const fileContent = JSON.stringify(board, null, 2);

      const command = new PutObjectCommand({
        Bucket: process.env.S3_BUCKET || "assembled-flask-38nwwg4lh",
        Key: filename,
        Body: fileContent,
        ContentType: "application/json",
      });

      await s3Client.send(command);

      console.log(`✓ Votes submitted from ${sessionId} → s3://${process.env.S3_BUCKET}/${filename}`);
      res.json({
        status: "success",
        message: "Votes uploaded successfully",
        filename
      });
    } catch (error) {
      console.error("S3 upload failed:", error);
      res.status(500).json({
        status: "error",
        message: "Failed to upload votes",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
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
