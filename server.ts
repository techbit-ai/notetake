import express from "express";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", env: process.env.NODE_ENV });
});

// Gemini API Route
app.post("/api/gemini", async (req, res) => {
  console.log(`[Gemini API] Received request: ${req.body?.action}`);
  try {
    const { action, payload } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("[Gemini API] Error: GEMINI_API_KEY is missing");
      return res.status(500).json({ error: "GEMINI_API_KEY is not set on the server." });
    }

    const ai = new GoogleGenAI({ apiKey });
    let result;

    switch (action) {
      case 'generateContent':
        result = await ai.models.generateContent(payload);
        return res.json(result);
      case 'embedContent':
        result = await ai.models.embedContent(payload);
        return res.json(result);
      default:
        console.warn(`[Gemini API] Warning: Invalid action received: ${action}`);
        return res.status(400).json({ error: "Invalid action" });
    }
  } catch (error: any) {
    console.error("[Gemini API] Server Error:", error);
    res.status(500).json({ 
      error: error.message || "Internal Server Error",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only listen if running directly (not as a serverless function)
  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});

// Export for Vercel
export default app;
