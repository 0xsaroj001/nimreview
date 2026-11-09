import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const TOKEN_TTL = '7d';

// Live tokens carry the user id; demo tokens carry no id and never touch the database. Every token gets its own
// random id (jti) so signing out can revoke exactly that token.
export const signToken = (payload, expiresIn = TOKEN_TTL) => jwt.sign(payload, env.jwtSecret, { expiresIn, jwtid: randomUUID() });
export const readToken = (token) => jwt.verify(token, env.jwtSecret);
