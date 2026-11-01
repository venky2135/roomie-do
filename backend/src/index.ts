import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import taskRoutes from './routes/tasks';
import houseRoutes from './routes/house';
import leaderboardRoutes from './routes/leaderboard';
import analyticsRoutes from './routes/analytics';
import nudgeRoutes from './routes/nudge';
import { startWeeklyCron } from './cron/weeklyReset';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'roomie-do-backend' });
});

// Routes
app.use('/api/tasks', taskRoutes);
app.use('/api/house', houseRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/nudge', nudgeRoutes);

// Start cron jobs
startWeeklyCron();

app.listen(PORT, () => {
  console.log(`🚀 RoomieDo backend running on port ${PORT}`);
});

export default app;

