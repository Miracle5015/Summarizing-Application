import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));

  // n8n Dispatch Route
  app.post("/api/dispatch", async (req, res) => {
    const { base64Data, mimeType, fileName, fileSize, userId, lastModified } = req.body;

    if (!base64Data || !mimeType) {
      return res.status(400).json({ error: "Missing required file data" });
    }

    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET || 'everything-document-proxy';

    if (!n8nUrl) {
      return res.status(500).json({ 
        error: "N8N_WEBHOOK_URL is not configured in the server environment." 
      });
    }

    try {
      console.log(`Forwarding document to n8n from ${userId || 'anonymous'}: ${fileName || 'unnamed'}`);
      
      const response = await axios.post(n8nUrl, {
        event: "document_upload",
        userId: userId || "anonymous",
        file: {
          name: fileName,
          type: mimeType,
          size: fileSize,
          lastModified: lastModified,
          data: base64Data
        },
        timestamp: new Date().toISOString()
      }, {
        headers: {
          'Content-Type': 'application/json',
          'X-EverythingDocument-Signature': webhookSecret,
        }
      });

      res.json({
        success: true,
        status: response.status,
        message: "Document dispatched to n8n successfully"
      });
    } catch (error: any) {
      console.error("n8n Dispatch Error:", error.message);
      res.status(500).json({
        success: false,
        error: "Failed to forward document to n8n",
        details: error.message
      });
    }
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
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
