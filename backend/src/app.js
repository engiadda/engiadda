const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { corsOrigins } = require('./config/env');
const healthRoutes = require('./routes/health.routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const allowedOrigins = new Set(corsOrigins);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Non-browser clients may omit Origin; browser origins must be explicitly allowed.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
}));
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/', (req, res) => res.json({ name: 'EngiAdda API', version: '1.0.0' }));
app.get('/api/live', (req, res) => res.json({ status: 'ok', service: 'engiadda-api' }));
app.use('/api/health', healthRoutes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
