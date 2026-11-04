"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const tasks_1 = __importDefault(require("./routes/tasks"));
const house_1 = __importDefault(require("./routes/house"));
const leaderboard_1 = __importDefault(require("./routes/leaderboard"));
const analytics_1 = __importDefault(require("./routes/analytics"));
const nudge_1 = __importDefault(require("./routes/nudge"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const weeklyReset_1 = require("./cron/weeklyReset");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'roomie-do-backend' });
});
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/tasks', tasks_1.default);
app.use('/api/house', house_1.default);
app.use('/api/leaderboard', leaderboard_1.default);
app.use('/api/analytics', analytics_1.default);
app.use('/api/nudge', nudge_1.default);
app.use('/api/notifications', notifications_1.default);
// Start cron jobs
(0, weeklyReset_1.startWeeklyCron)();
app.listen(PORT, () => {
    console.log(`🚀 RoomieDo backend running on port ${PORT}`);
});
exports.default = app;
