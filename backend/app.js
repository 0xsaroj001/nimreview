import './config/env.js';
import express from 'express';
import { fileURLToPath } from 'node:url';
import api from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';

// Adds middleware, the /api routes and static files to an Express app.
export function mountApp(app) {
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'x-content-type-options': 'nosniff', 'referrer-policy': 'same-origin', 'x-frame-options': 'SAMEORIGIN' });
    next();
  });
  app.use(express.json({ limit: '1.5mb' }));

  app.use('/api', api);
  app.use('/api', notFound);

  // Local runs serve the browser app from public/. On Vercel the CDN serves public/ and only /api reaches here.
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url)), { extensions: ['html'] }));

  app.use(errorHandler);
  return app;
}

export const createApp = () => mountApp(express());
