import express, { type Express } from 'express';
import { authRouter } from './routes/auth.js';
import { clinicsRouter } from './routes/clinics.js';
import { patientsRouter } from './routes/patients.js';
import { professionalsRouter } from './routes/professionals.js';
import { appointmentsRouter } from './routes/appointments.js';
import { whatsappRouter } from './routes/whatsapp.js';
import { evolutionRouter } from './routes/evolution.js';
import { camelizeResponses } from './middleware/camelize.js';

export function createApp(): Express {
  const app = express();

  app.use(express.json({ limit: '5mb' }));
  app.disable('x-powered-by');

  // Supabase devolve snake_case; o frontend lê camelCase. Esse middleware
  // normaliza globalmente todas as responses.
  app.use(camelizeResponses);

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true, ts: Date.now() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/clinics', clinicsRouter);
  app.use('/api/patients', patientsRouter);
  app.use('/api/professionals', professionalsRouter);
  app.use('/api/appointments', appointmentsRouter);
  app.use('/api/whatsapp', whatsappRouter);
  app.use('/api/evolution', evolutionRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint não encontrado.' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[express] uncaught error', err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return app;
}

export const app = createApp();
