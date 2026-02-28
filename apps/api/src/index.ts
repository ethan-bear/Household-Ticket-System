import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';

// Routes
import authRouter from './routes/auth';
import ticketsRouter from './routes/tickets';
import photosRouter from './routes/photos';
import recurringRouter from './routes/recurring';
import scoresRouter from './routes/scores';
import reportsRouter from './routes/reports';
import chatRouter from './routes/chat';
import { startRecurringCron } from './jobs/recurringCron';
import { startTokenCleanupCron } from './jobs/tokenCleanupCron';

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', authRouter);
app.use('/api/tickets', ticketsRouter);
app.use('/api/photos', photosRouter);
app.use('/api/recurring', recurringRouter);
app.use('/api/scores', scoresRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/chat', chatRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Error handler ────────────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

// Start cron jobs
startRecurringCron();
startTokenCleanupCron();

app.listen(env.PORT, () => {
  console.log(`🚀 API server running on port ${env.PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
});

export default app;
