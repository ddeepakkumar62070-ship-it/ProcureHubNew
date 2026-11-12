const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { checkDatabaseHealth, closeDatabase, initializeDatabase } = require('./config/db');
const { getJwtSecret } = require('./utils/jwt');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const requestRoutes = require('./routes/requestRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const adminRoutes = require('./routes/adminRoutes');
const businessRoutes = require('./routes/businessRoutes');
const financeRoutes = require('./routes/financeRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const returnRoutes = require('./routes/returnRoutes');
const complaintRoutes = require('./routes/complaintRoutes');
const refundRoutes = require('./routes/refundRoutes');
const { getAllowedOrigins } = require('./config/cors');

dotenv.config();

const app = express();
const requestedPort = Number(process.env.PORT) || 5000;
const allowedOrigins = getAllowedOrigins();

function configureProxyTrust(application, environment = process.env) {
  const behindRender = environment.RENDER === 'true';
  application.set(
    'trust proxy',
    environment.NODE_ENV === 'production' || behindRender ? 1 : false,
  );
}

configureProxyTrust(app);

app.use((req, res, next) => {
  const origin = req.get('Origin');
  if (!origin || allowedOrigins.includes(origin)) return next();
  return res.status(403).json({ message: 'Origin not allowed.' });
});
app.use(cors({ origin: allowedOrigins, credentials: false }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'ProcureHub API', timestamp: new Date().toISOString() });
});

app.get('/api/health/db', async (req, res) => {
  try {
    const database = await checkDatabaseHealth();
    return res.json({ status: 'ok', database });
  } catch (error) {
    console.error(`Database health check failed: ${error.message}`);
    return res.status(503).json({ status: 'error', database: { connected: false } });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/invoices', financeRoutes);
app.use('/api/returns', returnRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', requestRoutes);
app.use('/api/reviews', reviewRoutes);

app.use((err, req, res, next) => {
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'A record with the same unique value already exists.' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    return res.status(400).json({ message: 'The request conflicts with a database relationship or value constraint.' });
  }
  console.error(`Request failed: ${err.code || err.name || 'Error'} ${err.message}`);
  return res.status(500).json({ message: 'Something went wrong on the server.' });
});

function listenOnPort(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log(`ProcureHub backend running on http://localhost:${port}`);
      resolve(server);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        resolve(null);
        return;
      }
      reject(error);
    });
  });
}

async function startServer() {
  try {
    await initializeDatabase();
    getJwtSecret();
  } catch (error) {
    console.error(`ProcureHub startup failed: ${error.message}`);
    await closeDatabase();
    process.exitCode = 1;
    return;
  }

  let port = requestedPort;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const server = await listenOnPort(port);
    if (server) {
      return;
    }
    port += 1;
  }

  console.error(`Unable to start ProcureHub backend on ports ${requestedPort} through ${requestedPort + 9}.`);
  process.exit(1);
}

if (require.main === module) startServer();

module.exports = { app, configureProxyTrust, startServer };
