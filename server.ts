import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import cookieParser from "cookie-parser";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || "",
  process.env.VITE_SUPABASE_ANON_KEY || ""
);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));
  app.use(cookieParser());

  // Authentication Middleware using Supabase API verification
  const authenticateToken = async (req: any, res: any, next: any) => {
    // Check for token in cookies or Authorization header
    const token = req.cookies.supabase_token || req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: "Access denied. Please log in through Supabase." });
    }

    try {
      // Use Supabase SDK to verify the token via their API
      // This removes the need for SUPABASE_JWT_SECRET on our server
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        throw new Error(authError?.message || "Invalid user session");
      }

      req.user = {
        id: user.id,
        email: user.email
      };
      next();
    } catch (err: any) {
      console.error("Supabase Auth Error:", err.message);
      res.status(401).json({ 
        error: "Invalid or expired session",
        details: err.message
      });
    }
  };

  // Auth helper for the client to verify cookie status
  app.get("/api/auth/me", authenticateToken, (req: any, res) => {
    res.json({ user: req.user });
  });

  // System Config Status (Check if variables are set without revealing values)
  app.get("/api/system/status", (req, res) => {
    const isSet = (val: string | undefined) => !!val && !val.includes('your-') && !val.includes('placeholder') && val.length > 5;
    
    const status = {
      supabaseUrl: isSet(process.env.VITE_SUPABASE_URL),
      supabaseKey: isSet(process.env.VITE_SUPABASE_ANON_KEY),
      n8nUrl: isSet(process.env.N8N_WEBHOOK_URL),
      chatUrl: isSet(process.env.CHAT_WEBHOOK_URL),
      // Raw existence checks
      env: {
        VITE_SUPABASE_URL: !!process.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
        N8N_WEBHOOK_URL: !!process.env.N8N_WEBHOOK_URL,
        CHAT_WEBHOOK_URL: !!process.env.CHAT_WEBHOOK_URL,
      }
    };
    res.json(status);
  });

  // n8n Dispatch Route (Direct Upload) - Protected
  app.post("/api/dispatch", authenticateToken, async (req: any, res) => {
    const { base64Data, mimeType, fileName, fileSize, lastModified } = req.body;
    const user = req.user;

    if (!base64Data || !mimeType) {
      return res.status(400).json({ error: "Missing required file data" });
    }

    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET || 'everything-document-proxy';
    
    // Use the verified user from the token
    const userEmail = user.email || 'no-email@supabase';
    const userId = user.id;

    if (!n8nUrl || n8nUrl.includes('your-n8n-instance.com')) {
      return res.status(400).json({ 
        error: "n8n Webhook URL is not configured.",
        details: "Please set N8N_WEBHOOK_URL in the application settings."
      });
    }

    try {
      console.log(`Forwarding document to n8n from ${userEmail}`);
      
      const buffer = Buffer.from(base64Data, 'base64');
      
      const form = new FormData();
      form.append('data', buffer, {
        filename: fileName || 'document',
        contentType: mimeType,
      });

      form.append('userEmail', userEmail);
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

  // n8n Chat/Instruction Route - Protected
  app.post("/api/chat", authenticateToken, async (req: any, res) => {
    const { base64Data, mimeType, fileName, fileSize, lastModified, instructions } = req.body;
    const user = req.user;

    const chatUrl = process.env.CHAT_WEBHOOK_URL;
    const webhookSecret = process.env.WEBHOOK_SECRET || 'everything-document-proxy';
    
    const userEmail = user.email || 'no-email@supabase';
    const userId = user.id;

    if (!chatUrl || chatUrl.includes('your-n8n-instance.com')) {
      return res.status(400).json({ 
        error: "Chat Webhook URL is not configured.",
        details: "Please set CHAT_WEBHOOK_URL in settings."
      });
    }

    try {
      console.log(`Forwarding chat instructions to n8n from ${userEmail}`);
      
      const form = new FormData();
      
      // If there's a file, attach it as binary
      if (base64Data) {
        const buffer = Buffer.from(base64Data, 'base64');
        form.append('data', buffer, {
          filename: fileName || 'document',
          contentType: mimeType,
        });
      }
      
      form.append('userEmail', userEmail);
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
