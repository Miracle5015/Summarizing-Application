import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import FormData from "form-data";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // n8n Dispatch Route (Direct Upload)
  app.post("/api/dispatch", async (req, res) => {
    const { base64Data, mimeType, fileName, fileSize, lastModified } = req.body;

    if (!base64Data || !mimeType) {
      return res.status(400).json({ error: "Missing required file data" });
    }

    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET || 'everything-document-proxy';
    const userId = "mimie5015@gmail.com";

    if (!n8nUrl || n8nUrl.includes('your-n8n-instance.com')) {
      return res.status(400).json({ 
        error: "n8n Webhook URL is not configured.",
        details: "Please set N8N_WEBHOOK_URL in the application settings with a valid n8n or automation endpoint."
      });
    }

    try {
      console.log(`Forwarding binary document to n8n from ${userId}: ${fileName || 'unnamed'}`);
      
      const buffer = Buffer.from(base64Data, 'base64');
      
      const form = new FormData();
      form.append('data', buffer, {
        filename: fileName || 'document',
        contentType: mimeType,
      });

      form.append('userId', userId);
      form.append('fileName', fileName || '');
      form.append('fileType', mimeType);
      form.append('fileSize', fileSize?.toString() || '0');
      form.append('lastModified', lastModified || '');
      form.append('timestamp', new Date().toISOString());
      form.append('event', "document_upload");

      const response = await axios.post(n8nUrl, form, {
        headers: {
          ...form.getHeaders(),
          'X-EverythingDocument-Signature': webhookSecret,
        }
      });

      res.json({
        success: true,
        status: response.status,
        message: "Binary document dispatched to n8n successfully"
      });
    } catch (error: any) {
      let errorMessage = "Failed to forward document to n8n";
      let details = error.message;

      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = "Webhook Connection Refused";
        details = `The server could not reach the n8n webhook at: ${n8nUrl}. If you are using a local n8n instance (127.0.0.1), please use a tunnel (like ngrok) or a cloud-hosted n8n instance as this server cannot reach your local machine's ports directly.`;
      }

      console.error("n8n Dispatch Error:", details);
      res.status(500).json({
        success: false,
        error: errorMessage,
        details: details
      });
    }
  });

  // n8n Chat/Instruction Route
  app.post("/api/chat", async (req, res) => {
    const { base64Data, mimeType, fileName, fileSize, lastModified, instructions } = req.body;

    const chatUrl = process.env.CHAT_WEBHOOK_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET || 'everything-document-proxy';
    const userId = "mimie5015@gmail.com";

    if (!chatUrl || chatUrl.includes('your-n8n-instance.com')) {
      return res.status(400).json({ 
        error: "Chat Webhook URL is not configured.",
        details: "Please set CHAT_WEBHOOK_URL in the application settings with a valid n8n or automation endpoint."
      });
    }

    try {
      console.log(`Forwarding chat instructions to n8n from ${userId}: ${fileName || 'unnamed'}`);
      
      const form = new FormData();
      
      // If there's a file, attach it as binary
      if (base64Data) {
        const buffer = Buffer.from(base64Data, 'base64');
        form.append('data', buffer, {
          filename: fileName || 'document',
          contentType: mimeType,
        });
      }

      form.append('userId', userId);
      form.append('instructions', instructions || '');
      form.append('fileName', fileName || '');
      form.append('fileType', mimeType || '');
      form.append('fileSize', fileSize?.toString() || '0');
      form.append('lastModified', lastModified || '');
      form.append('timestamp', new Date().toISOString());
      form.append('event', "document_chat");

      const response = await axios.post(chatUrl, form, {
        headers: {
          ...form.getHeaders(),
          'X-EverythingDocument-Signature': webhookSecret,
        }
      });

      res.json({
        success: true,
        status: response.status,
        data: response.data,
        message: "Instructions dispatched to chat webhook successfully"
      });
    } catch (error: any) {
      let errorMessage = "Failed to forward instructions to chat webhook";
      let details = error.message;

      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = "Chat Webhook Connection Refused";
        details = `The server could not reach the chat webhook at: ${chatUrl}. Check your endpoint configuration and ensure it is publicly accessible.`;
      }

      console.error("Chat Dispatch Error:", details);
      res.status(500).json({
        success: false,
        error: errorMessage,
        details: details
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
