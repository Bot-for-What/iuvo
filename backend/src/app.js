const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const unitsRoutes = require('./routes/units.routes');
const usersRoutes = require('./routes/users.routes');
const ticketsRoutes = require('./routes/tickets.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const systemRoutes = require('./routes/system.routes');
const securityRoutes = require('./routes/security.routes');

const staffDepartmentsRoutes = require('./routes/staff-departments');

const app = express();

const allowedOrigins = (
  process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin is not allowed by CORS.'));
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-internal-cron-key'],
}));

app.use(express.json());

// Brute-force protection: Rate limit login attempts
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // minutes
  limit: 5, // attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many login attempts. Please try again after 10 minutes.'
  },
  // Skip rate limiting for successful requests (only count failures)
  skipSuccessfulRequests: true,
});

// Apply rate limiter to login endpoint only
app.use('/auth/login', loginLimiter);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/units', unitsRoutes);
app.use('/users', usersRoutes);
app.use('/tickets', ticketsRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/system', systemRoutes);
app.use('/security', securityRoutes);

app.use('/staff-departments', staffDepartmentsRoutes);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use((error, req, res, next) => {
  if (error?.message === 'Origin is not allowed by CORS.') {
    res.status(403).json({ message: 'Origin is not allowed.' });
    return;
  }

  console.error(error);
  res.status(500).json({ message: 'Internal server error.' });
});

module.exports = app;