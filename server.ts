import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  const client = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY || '' 
  });

  // AI Summarization Route
  app.post("/api/summarize", async (req, res) => {
    const { base64Data, mimeType, fileName } = req.body;

    if (!base64Data || !mimeType) {
      return res.status(400).json({ error: "Missing required file data" });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY environment variable is not configured" });
    }

    try {
      console.log(`Summarizing document: ${fileName || 'unnamed'}`);
      
      const response = await client.models.generateContent({
        model: "gemini-2.0-flash", // Using the latest recommended stable/fast model
        contents: [
          {
            role: "user",
            parts: [
              { text: "Please provide a concise and professional summary of this document. Focus on key points, action items, and the overall purpose." },
              {
                inlineData: {
                  data: base64Data,
                  mimeType: mimeType
                }
              }
            ]
          }
        ]
      });

      const summary = response.text || "Could not generate summary.";

      res.json({
        success: true,
        summary,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("AI Error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to summarize document",
        details: error.message
      });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route to proxy webhooks (sending file data)
  app.post("/api/trigger-webhook", async (req, res) => {
    const { url, data, secret } = req.body;

    if (!url) {
      return res.status(400).json({ error: "Webhook URL is required" });
    }

    try {
      console.log(`Triggering webhook to: ${url}`);
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          'X-EverythingDocument-Signature': secret || 'default-secret',
        },
      });

      res.json({
        success: true,
        status: response.status,
        message: "File data sent to webhook successfully",
      });
    } catch (error: any) {
      console.error("Webhook trigger failed:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to trigger webhook",
        details: error.message,
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
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
