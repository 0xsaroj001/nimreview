import { Router } from 'express';
import mongoose from 'mongoose';
import { dbMiddleware } from '../config/db.js';
import { asyncHandler as h } from '../middleware/error.js';
import { requireSession, requireUser, requireRole, requireWallet } from '../middleware/auth.js';
import * as auth from '../controllers/auth.controller.js';
import * as wallet from '../controllers/wallet.controller.js';
import * as venues from '../controllers/venue.controller.js';
import * as bills from '../controllers/bill.controller.js';
import * as reviews from '../controllers/review.controller.js';
import { bootstrap } from '../controllers/bootstrap.controller.js';

const api = Router();
const customer = [requireUser, requireRole('customer')];
const venue = [requireUser, requireRole('venue')];

// demo sign-in works without the database
api.post('/auth/demo', h(auth.demo));

api.use(dbMiddleware);
api.get('/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'not connected' }));

api.post('/auth/signup', h(auth.signup));
api.post('/auth/login', h(auth.login));
api.get('/auth/me', requireSession, h(auth.me));

api.get('/bootstrap', requireUser, h(bootstrap));
api.put('/me/wallet', requireUser, h(wallet.connectWallet));
api.post('/wallet/cashout', ...customer, requireWallet, h(wallet.cashOut));

api.get('/venues', requireUser, h(venues.list));
api.get('/venues/:id', requireUser, h(venues.getOne));
api.post('/venues', ...venue, requireWallet, h(venues.createMine));
api.put('/venues/mine', ...venue, h(venues.updateMine));

api.get('/bills', ...venue, h(bills.listMine));
api.post('/bills', ...venue, h(bills.issue));

api.post('/reviews/check-proof', ...customer, h(reviews.checkProof));
api.post('/reviews', ...customer, requireWallet, h(reviews.create));
api.post('/reviews/:id/helpful', ...customer, h(reviews.toggleHelpful));
api.post('/reviews/:id/flag', requireUser, h(reviews.flag));
api.post('/reviews/:id/reply', ...venue, h(reviews.reply));

export default api;
