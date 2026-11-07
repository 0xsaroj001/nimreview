import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const scryptAsync = promisify(scrypt);
const TOKEN_TTL = '7d';

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const [salt, hex] = String(stored).split(':');
  if (!salt || !hex) return false;
  const hash = await scryptAsync(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return expected.length === hash.length && timingSafeEqual(expected, hash);
}

// Live tokens carry the user id; demo tokens carry no id and never touch the database.
export const signToken = (payload) => jwt.sign(payload, env.jwtSecret, { expiresIn: TOKEN_TTL });
export const readToken = (token) => jwt.verify(token, env.jwtSecret);
