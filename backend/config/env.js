// Loads .env for local runs. On Vercel the variables come from the project settings and no file exists.
try {
  process.loadEnvFile(new URL('../../.env', import.meta.url));
} catch {}

const required = ['MONGODB_URI', 'JWT_SECRET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) console.error(`Missing environment variables: ${missing.join(', ')}`);

export const env = {
  mongoUri: process.env.MONGODB_URI,
  mongoDb: process.env.MONGODB_DB || 'nimreview',
  jwtSecret: process.env.JWT_SECRET,
  port: Number(process.env.PORT) || 5173,
};
