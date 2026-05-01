import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from './src/lib/firebase.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // API Route to fetch Evolution config status
  app.get('/api/evolution/config', (req, res) => {
    res.json({
      hasUrl: !!process.env.EVOLUTION_API_URL,
      hasApiKey: !!process.env.EVOLUTION_GLOBAL_API_KEY,
    });
  });

  // API Route to create an instance
  app.post('/api/evolution/instance', async (req, res) => {
    try {
      const { instanceName, prompt } = req.body;
      const url = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_GLOBAL_API_KEY;
      
      if (!url || !apiKey) {
        return res.status(400).json({ error: 'Evolution API credentials missing' });
      }

      const response = await fetch(`${url}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': apiKey,
        },
        body: JSON.stringify({
          instanceName,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          rejectCall: true,
          msgCall: "No momento não posso atender chamadas. Por favor, envie uma mensagem de texto ou áudio.",
          alwaysOnline: true,
          webhook: {
            enabled: true,
            url: `${process.env.PUBLIC_URL || 'http://localhost:' + PORT}/api/evolution/webhook`,
            byEvents: false,
            base64: true,
            events: [
              "MESSAGES_UPSERT",
            ]
          }
        }),
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error creating instance:', error);
      res.status(500).json({ error: 'Failed to create instance' });
    }
  });

  // API Route to get connection status/QR
  app.get('/api/evolution/instance/:id/connection', async (req, res) => {
    try {
      const { id } = req.params;
      const url = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_GLOBAL_API_KEY;
      
      if (!url || !apiKey) {
        return res.status(400).json({ error: 'Evolution API credentials missing' });
      }

      const response = await fetch(`${url}/instance/connect/${id}`, {
        method: 'GET',
        headers: {
          'apikey': apiKey,
        },
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error getting connection:', error);
      res.status(500).json({ error: 'Failed to connect instance' });
    }
  });

  // API Route to delete an instance
  app.delete('/api/evolution/instance/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const url = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_GLOBAL_API_KEY;
      
      if (!url || !apiKey) {
        return res.status(400).json({ error: 'Evolution API credentials missing' });
      }

      // Logout and Delete from Evolution
      await fetch(`${url}/instance/logout/${id}`, {
        method: 'DELETE',
        headers: { 'apikey': apiKey },
      }).catch(console.error);

      const response = await fetch(`${url}/instance/delete/${id}`, {
        method: 'DELETE',
        headers: { 'apikey': apiKey },
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error deleting instance:', error);
      res.status(500).json({ error: 'Failed to delete instance' });
    }
  });

  // Send Message Route
  app.post('/api/evolution/message/sendText', async (req, res) => {
    try {
      const { instanceName, number, text } = req.body;
      const url = process.env.EVOLUTION_API_URL;
      const apiKey = process.env.EVOLUTION_GLOBAL_API_KEY;
      
      if (!url || !apiKey) {
        return res.status(400).json({ error: 'Evolution API credentials missing' });
      }

      const response = await fetch(`${url}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
        body: JSON.stringify({ number, text }),
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error('Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  });

  // Webhook Receiver
  app.post('/api/evolution/webhook', async (req, res) => {
    try {
      const payload = req.body;
      
      // Simple validation using Evolution Global API Key which is sent in webhook body
      if (payload.apikey !== process.env.EVOLUTION_GLOBAL_API_KEY) {
         return res.status(401).json({ error: 'Unauthorized webhook' });
      }

      if (payload.event === 'messages.upsert') {
        const messageData = payload.data;
        const jid = messageData.key.remoteJid;
        const isFromMe = messageData.key.fromMe;
        const msgType = messageData.messageType;
        const content = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || '';
        
        let audioBase64 = null;
        if (messageData.message?.audioMessage && payload.data.base64) {
           audioBase64 = payload.data.base64; // Evolution API includes base64 in data.base64 when base64:true is set in webhook
        }

        // Find the clinicId for this instance
        const instancesSnap = await getDocs(query(collection(db, 'whatsapp_instances'), where('instanceName', '==', payload.instance)));
        let clinicId = 'unknown';
        if (!instancesSnap.empty) {
          clinicId = instancesSnap.docs[0].data().clinicId;
        }

        await addDoc(collection(db, 'whatsapp_messages'), {
          instanceName: payload.instance,
          clinicId: clinicId,
          remoteJid: jid,
          fromMe: isFromMe,
          messageType: msgType,
          content: content,
          audioBase64: audioBase64,
          messageTimestamp: messageData.messageTimestamp || Math.floor(Date.now() / 1000),
          createdAt: new Date().toISOString()
        });
      }

      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal webhook error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
