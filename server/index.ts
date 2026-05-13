import 'dotenv/config';
import { app } from './app.js';

const PORT = Number(process.env.API_PORT ?? 3001);

app.listen(PORT, () => {
  console.log(`[api] Express server listening on http://localhost:${PORT}`);
});
