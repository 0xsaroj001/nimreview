// Entry point. Vercel imports the default export; `npm start` runs the same app locally.
import express from 'express';
import { mountApp } from './backend/app.js';
import { env } from './backend/config/env.js';

const app = mountApp(express());

if (!process.env.VERCEL) app.listen(env.port, () => console.log(`NimReview on http://localhost:${env.port}`));

export default app;
