// AddaApp backend — single-file build of the Express 5 + Mongoose 9 API.
// API contract: ../docs/backend/API.md   Deployment: ../docs/backend/README.md
// Commands: node server.js [db:init | create-super-admin --email E --name N | check-secrets | dev:db]

import fs$1 from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import 'dotenv/config';
import { z, ZodError } from 'zod';
import pino from 'pino';
import express, { Router } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { pinoHttp } from 'pino-http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const bool = (def) => z.string().optional().transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes'].includes(v.toLowerCase())));
const list = z.string().optional().transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3015),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  MONGODB_DB_NAME: z.string().default('addaapp'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  OTP_HASH_SECRET: z.string().min(16).optional(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS_MOBILE: z.coerce.number().default(30),
  REFRESH_TOKEN_DAYS_PANEL: z.coerce.number().default(7),
  CORS_ORIGINS: list,
  PUBLIC_API_BASE_URL: z.string().default('http://localhost:3015'),
  PANEL_BASE_URL: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.string().optional(),
  LOG_LEVEL: z.string().optional(),

  OTP_PROVIDER: z.enum(['none', 'test', 'msg91', 'twilio']).default('none'),
  OTP_TEST_MODE: bool(false),
  OTP_TEST_CODE: z.string().regex(/^\d{6}$/).default('246810'),
  OTP_PROVIDER_API_KEY: z.string().optional(),
  MSG91_TEMPLATE_ID: z.string().optional(),
  MSG91_SENDER_ID: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().default(60),

  PAYMENT_PROVIDER: z.enum(['none', 'razorpay']).default('none'),
  RAZORPAY_KEY_ID: z.string().optional(),
  PAYMENT_SECRET_KEY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['local']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('uploads'),
  STORAGE_SECRET: z.string().optional(),
  MAX_UPLOAD_MB: z.coerce.number().default(8),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  EXPO_ACCESS_TOKEN: z.string().optional(),
  PUSH_NOTIFICATION_CONFIG: z.string().optional(),
  JOBS_ENABLED: bool(true),
  // Interim resident sign-in with phone + password while no SMS provider is configured.
  // Phone numbers are NOT verified in this mode; society admins' membership approval is the identity check.
  RESIDENT_PASSWORD_LOGIN: bool(false),
  // Sign-in attempts allowed per IP per 15 minutes (accounts also lock after 5 wrong passwords).
  LOGIN_RATE_LIMIT: z.coerce.number().int().min(5).max(10000).default(20),
  // Public form submissions (society applications, document uploads) allowed per IP per hour.
  PUBLIC_FORM_RATE_LIMIT: z.coerce.number().int().min(5).max(10000).default(60),
});

const raw = { ...process.env };
// Accept the legacy variable name supplied with the original project brief.
if (!raw.MONGODB_URI && raw.Mongo_URI) raw.MONGODB_URI = raw.Mongo_URI;

const parsed = schema.safeParse(raw);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Never print values: only the variable names that failed validation.
  console.error(`Invalid backend environment configuration:\n${issues}`);
  process.exit(1);
}

const env = parsed.data;
env.isProd = env.NODE_ENV === 'production';
env.isTest = env.NODE_ENV === 'test';
env.otpHashSecret = env.OTP_HASH_SECRET || env.JWT_REFRESH_SECRET;

if (env.isProd && env.OTP_PROVIDER === 'test') {
  console.error('OTP_PROVIDER=test is forbidden in production.');
  process.exit(1);
}

env.paymentsConfigured = env.PAYMENT_PROVIDER === 'razorpay' && !!env.RAZORPAY_KEY_ID && !!env.PAYMENT_SECRET_KEY;
env.otpTestEnabled = !env.isProd && env.OTP_PROVIDER === 'test' && env.OTP_TEST_MODE;

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-razorpay-signature"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.otp',
  '*.code',
  '*.refreshToken',
  '*.accessToken',
  '*.token',
  '*.accessKey',
  '*.secret',
  '*.MONGODB_URI',
];

const logger = pino({
  level: env.LOG_LEVEL || (env.isTest ? 'silent' : env.isProd ? 'info' : 'debug'),
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'addaapp-backend' },
});

/** Strip credentials from a connection string before it is ever logged. */
const maskUri = (uri = '') => uri.replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:****@');

mongoose.set('strictQuery', true);

async function connectDatabase(uri = env.MONGODB_URI, dbName = env.MONGODB_DB_NAME) {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err: { message: err.message } }, 'MongoDB connection error'));
  try {
    await mongoose.connect(uri, {
      dbName,
      autoIndex: !env.isProd,
      serverSelectionTimeoutMS: 15000,
      maxPoolSize: 20,
    });
    logger.info({ host: maskUri(uri).split('@').pop()?.split('/')[0], dbName }, 'MongoDB connected');
    return mongoose.connection;
  } catch (err) {
    // Report the reason without leaking credentials.
    logger.fatal({ reason: err.message?.replace(uri, maskUri(uri)) }, 'MongoDB connection failed — check MONGODB_URI, network access and Atlas IP allowlist');
    throw err;
  }
}

const isDatabaseReady = () => mongoose.connection.readyState === 1;

async function disconnectDatabase() {
  await mongoose.disconnect();
}

const { Schema: Schema$6, model: model$6 } = mongoose;
const ObjectId$6 = Schema$6.Types.ObjectId;

const userSchema = new Schema$6(
  {
    name: { type: String, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, match: /^[6-9]\d{9}$/ },
    phoneVerifiedAt: Date,
    email: { type: String, trim: true, lowercase: true, maxlength: 200 },
    passwordHash: { type: String, select: false },
    // Platform role only. Society-level roles live in SocietyStaff / SocietyMembership.
    platformRole: { type: String, enum: ['user', 'super_admin'], default: 'user' },
    status: { type: String, enum: ['active', 'pending_setup', 'disabled'], default: 'active' },
    disabledReason: String,
    city: { type: String, trim: true, maxlength: 80 },
    avatar: { type: ObjectId$6, ref: 'UploadedMedia' },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: Date,
    lastLoginAt: Date,
    passwordSetupTokenHash: { type: String, select: false },
    passwordSetupExpiresAt: { type: Date, select: false },
    passwordChangedAt: Date,
    settings: {
      pushEnabled: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ platformRole: 1, status: 1 });
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.passwordSetupTokenHash;
    delete ret.passwordSetupExpiresAt;
    delete ret.failedLoginCount;
    delete ret.lockedUntil;
    delete ret.__v;
    return ret;
  },
});
const User = model$6('User', userSchema);

const sessionSchema = new Schema$6(
  {
    user: { type: ObjectId$6, ref: 'User', required: true, index: true },
    client: { type: String, enum: ['mobile', 'panel'], required: true },
    refreshTokenHash: { type: String, required: true },
    previousTokenHash: String,
    deviceName: { type: String, maxlength: 120 },
    ip: String,
    userAgent: { type: String, maxlength: 300 },
    expiresAt: { type: Date, required: true },
    lastUsedAt: Date,
    revokedAt: Date,
    revokedReason: String,
  },
  { timestamps: true },
);
sessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
sessionSchema.index({ previousTokenHash: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });
const UserSession = model$6('UserSession', sessionSchema);

const otpSchema = new Schema$6(
  {
    phone: { type: String, required: true, index: true },
    codeHash: { type: String, required: true, select: false },
    provider: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 5 },
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
    ip: String,
    resendAvailableAt: Date,
  },
  { timestamps: true },
);
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 });
otpSchema.index({ phone: 1, createdAt: -1 });
const OTPChallenge = model$6('OTPChallenge', otpSchema);

const pushTokenSchema = new Schema$6(
  {
    user: { type: ObjectId$6, ref: 'User', required: true, index: true },
    token: { type: String, required: true, unique: true },
    platform: { type: String, enum: ['android', 'ios', 'web'], default: 'android' },
    session: { type: ObjectId$6, ref: 'UserSession' },
    lastSeenAt: Date,
  },
  { timestamps: true },
);
const PushToken = model$6('PushToken', pushTokenSchema);

const { Schema: Schema$5, model: model$5 } = mongoose;
const ObjectId$5 = Schema$5.Types.ObjectId;

const addressFields = {
  addressLine: { type: String, trim: true, maxlength: 300 },
  area: { type: String, trim: true, maxlength: 120 },
  city: { type: String, trim: true, maxlength: 80 },
  state: { type: String, trim: true, maxlength: 80 },
  pincode: { type: String, trim: true, match: /^\d{6}$/ },
};

const registrationSchema = new Schema$5(
  {
    referenceCode: { type: String, required: true, unique: true },
    accessKeyHash: { type: String, required: true, select: false },
    status: { type: String, enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected'], default: 'submitted', index: true },
    societyName: { type: String, required: true, trim: true, maxlength: 160 },
    ...addressFields,
    phone: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    totalUnits: { type: Number, min: 0, max: 100000 },
    representative: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      designation: { type: String, trim: true, maxlength: 80 },
      phone: { type: String, required: true },
      email: { type: String, required: true, lowercase: true, trim: true },
    },
    documents: [{ type: ObjectId$5, ref: 'UploadedMedia' }],
    submittedAt: Date,
    reviewedBy: { type: ObjectId$5, ref: 'User' },
    reviewedAt: Date,
    decisionReason: { type: String, maxlength: 1000 },
    society: { type: ObjectId$5, ref: 'Society' },
  },
  { timestamps: true },
);
const SocietyRegistration = model$5('SocietyRegistration', registrationSchema);

const societySchema = new Schema$5(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    code: { type: String, required: true, unique: true },
    ...addressFields,
    phone: String,
    email: { type: String, lowercase: true, trim: true },
    description: { type: String, maxlength: 2000 },
    status: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    suspendedReason: String,
    registration: { type: ObjectId$5, ref: 'SocietyRegistration' },
    billing: {
      defaultAmountPaise: { type: Number, min: 0, default: 0 },
      dueDayOfMonth: { type: Number, min: 1, max: 28, default: 10 },
      lateFeePaise: { type: Number, min: 0, default: 0 },
      autoGenerate: { type: Boolean, default: false },
      generateOnDay: { type: Number, min: 1, max: 28, default: 1 },
      invoicePrefix: { type: String, default: 'INV', maxlength: 10 },
    },
    payments: {
      // Online collection stays disabled until the platform has verified a settlement route for this society.
      onlineEnabled: { type: Boolean, default: false },
      settlementMode: { type: String, enum: ['none', 'razorpay_route', 'society_merchant'], default: 'none' },
      linkedAccountId: { type: String, trim: true },
      verifiedAt: Date,
      verifiedBy: { type: ObjectId$5, ref: 'User' },
    },
    openingBalancePaise: { type: Number, default: 0 },
    openingBalanceDate: Date,
    settings: {
      listingsRequireApproval: { type: Boolean, default: true },
      bookingsRequireApproval: { type: Boolean, default: false },
    },
  },
  { timestamps: true },
);
societySchema.index({ name: 'text', city: 'text', area: 'text' });
societySchema.index({ city: 1, status: 1 });
const Society = model$5('Society', societySchema);

const staffSchema = new Schema$5(
  {
    society: { type: ObjectId$5, ref: 'Society', required: true },
    user: { type: ObjectId$5, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'treasurer', 'secretary', 'manager', 'committee'], required: true },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    title: { type: String, maxlength: 80 },
    addedBy: { type: ObjectId$5, ref: 'User' },
  },
  { timestamps: true },
);
staffSchema.index({ society: 1, user: 1 }, { unique: true });
staffSchema.index({ user: 1, status: 1 });
const SocietyStaff = model$5('SocietyStaff', staffSchema);

const buildingSchema = new Schema$5(
  {
    society: { type: ObjectId$5, ref: 'Society', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    floors: { type: Number, min: 0, max: 200, default: 0 },
    description: { type: String, maxlength: 300 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
buildingSchema.index({ society: 1, name: 1 }, { unique: true });
const Building = model$5('Building', buildingSchema);

const flatSchema = new Schema$5(
  {
    society: { type: ObjectId$5, ref: 'Society', required: true },
    building: { type: ObjectId$5, ref: 'Building', required: true },
    number: { type: String, required: true, trim: true, uppercase: true, maxlength: 20 },
    floor: { type: Number, min: -5, max: 200 },
    areaSqft: { type: Number, min: 0 },
    category: { type: String, trim: true, maxlength: 40 },
    maintenanceAmountPaise: { type: Number, min: 0 },
    occupancy: { type: String, enum: ['vacant', 'owner_occupied', 'rented'], default: 'vacant' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
flatSchema.index({ society: 1, building: 1, number: 1 }, { unique: true });
flatSchema.index({ society: 1, number: 1 });
const Flat = model$5('Flat', flatSchema);

const membershipSchema = new Schema$5(
  {
    society: { type: ObjectId$5, ref: 'Society', required: true },
    user: { type: ObjectId$5, ref: 'User', required: true },
    building: { type: ObjectId$5, ref: 'Building', required: true },
    flat: { type: ObjectId$5, ref: 'Flat', required: true },
    residentType: { type: String, enum: ['owner', 'tenant', 'family'], required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended', 'cancelled'], default: 'pending' },
    note: { type: String, maxlength: 500 },
    decisionReason: { type: String, maxlength: 500 },
    decidedBy: { type: ObjectId$5, ref: 'User' },
    decidedAt: Date,
    // A pending/approved membership is "live"; at most one live membership per user per flat.
    live: { type: Boolean, default: true },
  },
  { timestamps: true },
);
membershipSchema.index({ user: 1, flat: 1 }, { unique: true, partialFilterExpression: { live: true } });
membershipSchema.index({ society: 1, status: 1, createdAt: -1 });
membershipSchema.index({ user: 1, status: 1 });
const SocietyMembership = model$5('SocietyMembership', membershipSchema);

/** PropertyOwnership / Tenancy record — the history of who held which unit. */
const occupancySchema = new Schema$5(
  {
    society: { type: ObjectId$5, ref: 'Society', required: true },
    flat: { type: ObjectId$5, ref: 'Flat', required: true },
    user: { type: ObjectId$5, ref: 'User', required: true },
    membership: { type: ObjectId$5, ref: 'SocietyMembership' },
    kind: { type: String, enum: ['owner', 'tenant', 'family'], required: true },
    startDate: { type: Date, default: Date.now },
    endDate: Date,
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
occupancySchema.index({ society: 1, flat: 1, active: 1 });
const PropertyOccupancy = model$5('PropertyOccupancy', occupancySchema);

const { Schema: Schema$4, model: model$4 } = mongoose;
const ObjectId$4 = Schema$4.Types.ObjectId;

const COMPLAINT_STATUSES = ['pending', 'assigned', 'in_progress', 'resolved', 'closed', 'rejected'];
const COMPLAINT_TRANSITIONS = {
  pending: ['assigned', 'in_progress', 'rejected'],
  assigned: ['in_progress', 'resolved', 'rejected'],
  in_progress: ['resolved', 'assigned'],
  resolved: ['closed', 'in_progress'],
  closed: [],
  rejected: [],
};

const timelineEntry = new Schema$4(
  {
    status: String,
    note: { type: String, maxlength: 2000 },
    by: { type: ObjectId$4, ref: 'User' },
    byRole: { type: String, enum: ['resident', 'staff', 'system'] },
    at: { type: Date, default: Date.now },
  },
  { _id: true },
);

const complaintSchema = new Schema$4(
  {
    society: { type: ObjectId$4, ref: 'Society', required: true },
    ticketNumber: { type: String, required: true },
    raisedBy: { type: ObjectId$4, ref: 'User', required: true },
    membership: { type: ObjectId$4, ref: 'SocietyMembership', required: true },
    flat: { type: ObjectId$4, ref: 'Flat' },
    category: { type: ObjectId$4, ref: 'ServiceCategory', required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, required: true, trim: true, maxlength: 4000 },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },
    media: [{ type: ObjectId$4, ref: 'UploadedMedia' }],
    status: { type: String, enum: COMPLAINT_STATUSES, default: 'pending' },
    currentAssignment: { type: ObjectId$4, ref: 'ComplaintAssignment' },
    timeline: [timelineEntry],
    resolvedAt: Date,
    closedAt: Date,
  },
  { timestamps: true },
);
complaintSchema.index({ society: 1, ticketNumber: 1 }, { unique: true });
complaintSchema.index({ society: 1, status: 1, createdAt: -1 });
complaintSchema.index({ raisedBy: 1, createdAt: -1 });
const Complaint = model$4('Complaint', complaintSchema);

const assignmentSchema = new Schema$4(
  {
    society: { type: ObjectId$4, ref: 'Society', required: true },
    complaint: { type: ObjectId$4, ref: 'Complaint', required: true, index: true },
    assigneeType: { type: String, enum: ['staff', 'vendor'], required: true },
    assigneeName: { type: String, required: true, maxlength: 120 },
    assigneePhone: String,
    staffUser: { type: ObjectId$4, ref: 'User' },
    note: { type: String, maxlength: 1000 },
    assignedBy: { type: ObjectId$4, ref: 'User', required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
const ComplaintAssignment = model$4('ComplaintAssignment', assignmentSchema);

const announcementSchema = new Schema$4(
  {
    scope: { type: String, enum: ['society', 'platform'], required: true },
    society: { type: ObjectId$4, ref: 'Society' },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, maxlength: 8000 },
    category: { type: String, enum: ['general', 'maintenance', 'meeting', 'event', 'finance', 'security', 'emergency'], default: 'general' },
    important: { type: Boolean, default: false },
    attachments: [{ type: ObjectId$4, ref: 'UploadedMedia' }],
    status: { type: String, enum: ['published', 'archived'], default: 'published' },
    eventDate: Date,
    createdBy: { type: ObjectId$4, ref: 'User', required: true },
  },
  { timestamps: true },
);
announcementSchema.index({ society: 1, status: 1, createdAt: -1 });
announcementSchema.index({ scope: 1, status: 1, createdAt: -1 });
const Announcement = model$4('Announcement', announcementSchema);

const postSchema = new Schema$4(
  {
    society: { type: ObjectId$4, ref: 'Society', required: true },
    author: { type: ObjectId$4, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    media: [{ type: ObjectId$4, ref: 'UploadedMedia' }],
    official: { type: Boolean, default: false },
    likes: [{ type: ObjectId$4, ref: 'User' }],
    likeCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },
    status: { type: String, enum: ['published', 'hidden', 'removed'], default: 'published' },
    moderatedBy: { type: ObjectId$4, ref: 'User' },
    moderationNote: String,
  },
  { timestamps: true },
);
postSchema.index({ society: 1, status: 1, createdAt: -1 });
const CommunityPost = model$4('CommunityPost', postSchema);

const commentSchema = new Schema$4(
  {
    society: { type: ObjectId$4, ref: 'Society', required: true },
    post: { type: ObjectId$4, ref: 'CommunityPost', required: true },
    author: { type: ObjectId$4, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['published', 'hidden', 'removed'], default: 'published' },
  },
  { timestamps: true },
);
commentSchema.index({ post: 1, createdAt: 1 });
const Comment = model$4('Comment', commentSchema);

const pollSchema = new Schema$4(
  {
    society: { type: ObjectId$4, ref: 'Society', required: true },
    question: { type: String, required: true, trim: true, maxlength: 300 },
    options: [
      {
        label: { type: String, required: true, trim: true, maxlength: 120 },
        votes: { type: Number, default: 0 },
      },
    ],
    closesAt: Date,
    status: { type: String, enum: ['open', 'closed', 'removed'], default: 'open' },
    totalVotes: { type: Number, default: 0 },
    createdBy: { type: ObjectId$4, ref: 'User', required: true },
  },
  { timestamps: true },
);
pollSchema.index({ society: 1, status: 1, createdAt: -1 });
const Poll = model$4('Poll', pollSchema);

const pollVoteSchema = new Schema$4(
  {
    poll: { type: ObjectId$4, ref: 'Poll', required: true },
    society: { type: ObjectId$4, ref: 'Society', required: true },
    user: { type: ObjectId$4, ref: 'User', required: true },
    option: { type: ObjectId$4, required: true },
  },
  { timestamps: true },
);
pollVoteSchema.index({ poll: 1, user: 1 }, { unique: true });
const PollVote = model$4('PollVote', pollVoteSchema);

const contentReportSchema = new Schema$4(
  {
    society: { type: ObjectId$4, ref: 'Society' },
    targetType: { type: String, enum: ['post', 'comment', 'property', 'marketplace', 'service'], required: true },
    targetId: { type: ObjectId$4, required: true },
    reporter: { type: ObjectId$4, ref: 'User', required: true },
    reason: { type: String, required: true, maxlength: 500 },
    status: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open' },
    resolvedBy: { type: ObjectId$4, ref: 'User' },
    resolvedAt: Date,
  },
  { timestamps: true },
);
contentReportSchema.index({ targetType: 1, targetId: 1, reporter: 1 }, { unique: true });
contentReportSchema.index({ society: 1, status: 1 });
const ContentReport = model$4('ContentReport', contentReportSchema);

const { Schema: Schema$3, model: model$3 } = mongoose;
const ObjectId$3 = Schema$3.Types.ObjectId;

const moderation$1 = {
  moderationStatus: { type: String, enum: ['pending', 'approved', 'rejected', 'removed'], default: 'pending' },
  moderationNote: { type: String, maxlength: 500 },
  moderatedBy: { type: ObjectId$3, ref: 'User' },
  moderatedAt: Date,
  reportCount: { type: Number, default: 0 },
};

const propertySchema = new Schema$3(
  {
    owner: { type: ObjectId$3, ref: 'User', required: true },
    society: { type: ObjectId$3, ref: 'Society' },
    listingType: { type: String, enum: ['sale', 'rent'], required: true },
    propertyType: { type: String, enum: ['apartment', 'house', 'plot', 'commercial', 'room'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 5000 },
    pricePaise: { type: Number, required: true, min: 0 },
    areaSqft: { type: Number, min: 0 },
    bedrooms: { type: Number, min: 0, max: 50 },
    bathrooms: { type: Number, min: 0, max: 50 },
    furnishing: { type: String, enum: ['unfurnished', 'semi_furnished', 'furnished'] },
    amenities: [{ type: String, maxlength: 60 }],
    locality: { type: String, trim: true, maxlength: 120 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    address: { type: String, trim: true, maxlength: 300 },
    photos: [{ type: ObjectId$3, ref: 'UploadedMedia' }],
    contactName: { type: String, trim: true, maxlength: 120 },
    contactPhone: { type: String, required: true, match: /^[6-9]\d{9}$/ },
    whatsappAvailable: { type: Boolean, default: true },
    availability: { type: String, enum: ['available', 'sold', 'rented', 'inactive'], default: 'available' },
    ...moderation$1,
  },
  { timestamps: true },
);
propertySchema.index({ moderationStatus: 1, availability: 1, city: 1, listingType: 1, pricePaise: 1 });
propertySchema.index({ owner: 1, createdAt: -1 });
propertySchema.index({ society: 1, moderationStatus: 1 });
propertySchema.index({ title: 'text', locality: 'text', city: 'text', description: 'text' });
const PropertyListing = model$3('PropertyListing', propertySchema);

const marketplaceSchema = new Schema$3(
  {
    seller: { type: ObjectId$3, ref: 'User', required: true },
    society: { type: ObjectId$3, ref: 'Society' },
    visibility: { type: String, enum: ['public', 'society'], default: 'public' },
    category: { type: ObjectId$3, ref: 'ServiceCategory', required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 3000 },
    pricePaise: { type: Number, required: true, min: 0 },
    negotiable: { type: Boolean, default: false },
    condition: { type: String, enum: ['new', 'like_new', 'good', 'fair'], default: 'good' },
    locality: { type: String, trim: true, maxlength: 120 },
    city: { type: String, trim: true, maxlength: 80 },
    photos: [{ type: ObjectId$3, ref: 'UploadedMedia' }],
    contactName: { type: String, trim: true, maxlength: 120 },
    contactPhone: { type: String, required: true, match: /^[6-9]\d{9}$/ },
    whatsappAvailable: { type: Boolean, default: true },
    status: { type: String, enum: ['active', 'sold', 'inactive'], default: 'active' },
    ...moderation$1,
  },
  { timestamps: true },
);
marketplaceSchema.index({ moderationStatus: 1, status: 1, category: 1, createdAt: -1 });
marketplaceSchema.index({ seller: 1, createdAt: -1 });
marketplaceSchema.index({ society: 1, moderationStatus: 1 });
marketplaceSchema.index({ title: 'text', description: 'text', locality: 'text' });
const MarketplaceListing = model$3('MarketplaceListing', marketplaceSchema);

/** A service offered by a resident or a local provider (plumber, tutor, cook …). Reviewed like other listings. */
const OFFER_PRICE_TYPES = ['fixed', 'starting_from', 'per_hour', 'per_visit', 'on_quote'];
const serviceOfferSchema = new Schema$3(
  {
    provider: { type: ObjectId$3, ref: 'User', required: true },
    // Set only when the provider has an approved membership: drives moderation (society admin) and society-only visibility.
    society: { type: ObjectId$3, ref: 'Society' },
    category: { type: ObjectId$3, ref: 'ServiceCategory', required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 3000 },
    priceType: { type: String, enum: OFFER_PRICE_TYPES, required: true },
    pricePaise: { type: Number, min: 0, validate: { validator: (v) => v === undefined || v === null || Number.isInteger(v), message: 'Price must be whole paise' } },
    experienceYears: { type: Number, min: 0, max: 60 },
    serviceArea: { type: String, trim: true, maxlength: 200 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    availabilityNote: { type: String, trim: true, maxlength: 120 },
    photos: [{ type: ObjectId$3, ref: 'UploadedMedia' }],
    contactName: { type: String, trim: true, maxlength: 120 },
    contactPhone: { type: String, required: true, match: /^[6-9]\d{9}$/ },
    whatsappAvailable: { type: Boolean, default: true },
    visibility: { type: String, enum: ['public', 'society'], default: 'public' },
    status: { type: String, enum: ['active', 'paused'], default: 'active' },
    ...moderation$1,
  },
  { timestamps: true },
);
serviceOfferSchema.index({ moderationStatus: 1, status: 1, category: 1, createdAt: -1 });
serviceOfferSchema.index({ provider: 1, createdAt: -1 });
serviceOfferSchema.index({ society: 1, moderationStatus: 1 });
const ServiceOffer = model$3('ServiceOffer', serviceOfferSchema);

const { Schema: Schema$2, model: model$2 } = mongoose;
const ObjectId$2 = Schema$2.Types.ObjectId;

/** Admin-managed categories for complaints, service requests and marketplace items. society=null means platform-wide. */
const categorySchema = new Schema$2(
  {
    kind: { type: String, enum: ['complaint', 'service', 'marketplace'], required: true },
    society: { type: ObjectId$2, ref: 'Society', default: null },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    icon: { type: String, trim: true, maxlength: 60 },
    description: { type: String, maxlength: 300 },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);
categorySchema.index({ kind: 1, society: 1, name: 1 }, { unique: true });
const ServiceCategory = model$2('ServiceCategory', categorySchema);

const SERVICE_REQUEST_TRANSITIONS = {
  requested: ['accepted', 'rejected', 'cancelled'],
  accepted: ['scheduled', 'completed', 'cancelled'],
  scheduled: ['completed', 'cancelled'],
  completed: [],
  rejected: [],
  cancelled: [],
};

const serviceRequestSchema = new Schema$2(
  {
    society: { type: ObjectId$2, ref: 'Society', required: true },
    user: { type: ObjectId$2, ref: 'User', required: true },
    membership: { type: ObjectId$2, ref: 'SocietyMembership', required: true },
    flat: { type: ObjectId$2, ref: 'Flat' },
    category: { type: ObjectId$2, ref: 'ServiceCategory', required: true },
    description: { type: String, required: true, maxlength: 2000 },
    preferredDate: String,
    preferredTime: String,
    status: { type: String, enum: Object.keys(SERVICE_REQUEST_TRANSITIONS), default: 'requested' },
    scheduledFor: Date,
    assigneeName: String,
    timeline: [{ status: String, note: String, by: { type: ObjectId$2, ref: 'User' }, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true },
);
serviceRequestSchema.index({ society: 1, status: 1, createdAt: -1 });
serviceRequestSchema.index({ user: 1, createdAt: -1 });
const ServiceRequest = model$2('ServiceRequest', serviceRequestSchema);

const facilitySchema = new Schema$2(
  {
    society: { type: ObjectId$2, ref: 'Society', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, maxlength: 1000 },
    icon: { type: String, maxlength: 60 },
    feePaise: { type: Number, min: 0, default: 0 },
    capacity: { type: Number, min: 0 },
    openTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '06:00' },
    closeTime: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/, default: '22:00' },
    slotMinutes: { type: Number, enum: [30, 60, 90, 120, 180, 240], default: 60 },
    maxAdvanceDays: { type: Number, min: 1, max: 365, default: 30 },
    requiresApproval: { type: Boolean, default: false },
    rules: { type: String, maxlength: 2000 },
    active: { type: Boolean, default: true },
    // Incremented inside booking transactions so concurrent bookings of one facility conflict and serialize.
    bookingVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);
facilitySchema.index({ society: 1, name: 1 }, { unique: true });
const Facility = model$2('Facility', facilitySchema);

const bookingSchema = new Schema$2(
  {
    society: { type: ObjectId$2, ref: 'Society', required: true },
    facility: { type: ObjectId$2, ref: 'Facility', required: true },
    user: { type: ObjectId$2, ref: 'User', required: true },
    membership: { type: ObjectId$2, ref: 'SocietyMembership', required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    date: { type: String, required: true },
    feePaise: { type: Number, default: 0 },
    purpose: { type: String, maxlength: 300 },
    status: { type: String, enum: ['pending', 'confirmed', 'rejected', 'cancelled'], required: true },
    decisionReason: String,
    decidedBy: { type: ObjectId$2, ref: 'User' },
    cancelledAt: Date,
  },
  { timestamps: true },
);
bookingSchema.index({ facility: 1, start: 1, end: 1, status: 1 });
bookingSchema.index({ society: 1, date: 1 });
bookingSchema.index({ user: 1, start: -1 });
const FacilityBooking = model$2('FacilityBooking', bookingSchema);

const { Schema: Schema$1, model: model$1 } = mongoose;
const ObjectId$1 = Schema$1.Types.ObjectId;
const paise$1 = { type: Number, required: true, validate: { validator: Number.isInteger, message: 'Amounts must be integer paise' } };

/** Blocks in-place edits/deletes: financial history is corrected only through new adjustment entries. */
function immutablePlugin(schema, label) {
  const deny = function deny() {
    throw new Error(`${label} records are immutable; create an adjustment/reversal instead`);
  };
  for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
    schema.pre(op, deny);
  }
  schema.pre('save', function guard() {
    if (!this.isNew) throw new Error(`${label} records are immutable`);
  });
}

const counterSchema = new Schema$1({ _id: String, seq: { type: Number, default: 0 } });
const Counter = model$1('Counter', counterSchema);

/** Per-flat override lives on Flat.maintenanceAmountPaise; this records charge heads applied on every invoice. */
const chargeSchema = new Schema$1(
  {
    society: { type: ObjectId$1, ref: 'Society', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    calculation: { type: String, enum: ['fixed', 'per_sqft'], default: 'fixed' },
    amountPaise: { ...paise$1, min: 0 },
    // Optional restriction to a flat category (e.g. "2BHK"); empty applies to all flats.
    flatCategory: { type: String, trim: true, maxlength: 40 },
    active: { type: Boolean, default: true },
    createdBy: { type: ObjectId$1, ref: 'User' },
  },
  { timestamps: true },
);
const MaintenanceCharge = model$1('MaintenanceCharge', chargeSchema);

const invoiceSchema = new Schema$1(
  {
    society: { type: ObjectId$1, ref: 'Society', required: true },
    flat: { type: ObjectId$1, ref: 'Flat', required: true },
    building: { type: ObjectId$1, ref: 'Building', required: true },
    period: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    invoiceNumber: { type: String, required: true },
    lines: [{ label: { type: String, required: true }, amountPaise: { ...paise$1, min: 0 }, kind: { type: String, enum: ['charge', 'late_fee', 'adjustment'], default: 'charge' } }],
    totalPaise: { ...paise$1, min: 0 },
    paidPaise: { type: Number, default: 0, min: 0 },
    arrearsAtIssuePaise: { type: Number, default: 0 },
    status: { type: String, enum: ['unpaid', 'partially_paid', 'paid', 'cancelled'], default: 'unpaid' },
    dueDate: { type: Date, required: true },
    issuedAt: { type: Date, default: Date.now },
    paidAt: Date,
    lateFeeAppliedAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    createdBy: { type: ObjectId$1, ref: 'User' },
    // Only one active (non-cancelled) invoice may exist per flat and period.
    active: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);
invoiceSchema.virtual('balancePaise').get(function balance() {
  return this.status === 'cancelled' ? 0 : Math.max(0, (this.totalPaise || 0) - (this.paidPaise || 0));
});
invoiceSchema.virtual('overdue').get(function overdue() {
  return ['unpaid', 'partially_paid'].includes(this.status) && this.dueDate < new Date();
});
invoiceSchema.index({ society: 1, flat: 1, period: 1 }, { unique: true, partialFilterExpression: { active: true } });
invoiceSchema.index({ society: 1, invoiceNumber: 1 }, { unique: true });
invoiceSchema.index({ society: 1, period: 1, status: 1 });
invoiceSchema.index({ flat: 1, status: 1 });
const MaintenanceInvoice = model$1('MaintenanceInvoice', invoiceSchema);

const PAYMENT_TRANSITIONS = {
  created: ['authorized', 'captured', 'failed'],
  authorized: ['captured', 'failed'],
  captured: ['refunded', 'partially_refunded', 'reversed'],
  partially_refunded: ['refunded'],
  failed: [],
  refunded: [],
  reversed: [],
};

const paymentSchema = new Schema$1(
  {
    society: { type: ObjectId$1, ref: 'Society', required: true },
    invoice: { type: ObjectId$1, ref: 'MaintenanceInvoice', required: true },
    flat: { type: ObjectId$1, ref: 'Flat', required: true },
    payer: { type: ObjectId$1, ref: 'User' },
    amountPaise: { ...paise$1, min: 1 },
    refundedPaise: { type: Number, default: 0 },
    // How much of this payment reduced the invoice balance vs. was received in excess (held for refund/adjustment).
    appliedPaise: { type: Number, default: 0 },
    unappliedPaise: { type: Number, default: 0 },
    channel: { type: String, enum: ['online', 'offline'], required: true },
    method: { type: String, enum: ['gateway', 'cash', 'bank_transfer', 'cheque', 'upi_direct'], required: true },
    provider: { type: String, enum: ['razorpay', 'manual'], required: true },
    providerOrderId: String,
    providerPaymentId: String,
    providerMethod: String,
    status: { type: String, enum: Object.keys(PAYMENT_TRANSITIONS), default: 'created' },
    statusHistory: [{ status: String, at: { type: Date, default: Date.now }, source: String, note: String }],
    referenceNumber: { type: String, maxlength: 100 },
    paidOn: Date,
    note: { type: String, maxlength: 500 },
    recordedBy: { type: ObjectId$1, ref: 'User' },
    receipt: { type: ObjectId$1, ref: 'Receipt' },
    failureReason: String,
  },
  { timestamps: true },
);
paymentSchema.index({ providerOrderId: 1 }, { unique: true, partialFilterExpression: { providerOrderId: { $type: 'string' } } });
paymentSchema.index({ providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } });
paymentSchema.index({ society: 1, createdAt: -1 });
paymentSchema.index({ invoice: 1, status: 1 });
paymentSchema.index({ payer: 1, createdAt: -1 });
const Payment = model$1('Payment', paymentSchema);

const receiptSchema = new Schema$1(
  {
    society: { type: ObjectId$1, ref: 'Society', required: true },
    receiptNumber: { type: String, required: true },
    payment: { type: ObjectId$1, ref: 'Payment', required: true, unique: true },
    invoice: { type: ObjectId$1, ref: 'MaintenanceInvoice', required: true },
    flat: { type: ObjectId$1, ref: 'Flat', required: true },
    issuedTo: { type: ObjectId$1, ref: 'User' },
    issuedToName: String,
    amountPaise: { ...paise$1, min: 1 },
    method: String,
    issuedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);
receiptSchema.index({ society: 1, receiptNumber: 1 }, { unique: true });
const Receipt = model$1('Receipt', receiptSchema);

const expenseSchema = new Schema$1(
  {
    society: { type: ObjectId$1, ref: 'Society', required: true },
    category: { type: String, required: true, trim: true, maxlength: 60 },
    vendor: { type: String, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    amountPaise: { ...paise$1, min: 1 },
    paidOn: { type: Date, required: true },
    account: { type: String, enum: ['bank', 'cash'], default: 'bank' },
    referenceNumber: { type: String, maxlength: 100 },
    attachments: [{ type: ObjectId$1, ref: 'UploadedMedia' }],
    status: { type: String, enum: ['recorded', 'voided'], default: 'recorded' },
    voidReason: String,
    voidedBy: { type: ObjectId$1, ref: 'User' },
    voidedAt: Date,
    recordedBy: { type: ObjectId$1, ref: 'User', required: true },
  },
  { timestamps: true },
);
expenseSchema.index({ society: 1, paidOn: -1 });
expenseSchema.index({ society: 1, category: 1 });
const Expense = model$1('Expense', expenseSchema);

const ledgerSchema = new Schema$1(
  {
    society: { type: ObjectId$1, ref: 'Society', required: true },
    date: { type: Date, required: true },
    direction: { type: String, enum: ['credit', 'debit'], required: true },
    amountPaise: { ...paise$1, min: 1 },
    account: { type: String, enum: ['bank', 'cash', 'gateway'], required: true },
    category: { type: String, required: true, maxlength: 60 },
    entryType: { type: String, enum: ['opening', 'maintenance_collection', 'other_income', 'expense', 'adjustment', 'reversal', 'refund'], required: true },
    sourceType: { type: String, enum: ['payment', 'expense', 'adjustment', 'society'], required: true },
    sourceId: { type: ObjectId$1 },
    reverses: { type: ObjectId$1, ref: 'FinancialLedgerEntry' },
    memo: { type: String, maxlength: 500 },
    createdBy: { type: ObjectId$1, ref: 'User' },
    // Idempotency key guarantees one ledger effect per business event (e.g. "payment:<id>:capture").
    eventKey: { type: String, required: true },
  },
  { timestamps: true },
);
ledgerSchema.index({ society: 1, eventKey: 1 }, { unique: true });
ledgerSchema.index({ society: 1, date: -1 });
ledgerSchema.index({ society: 1, entryType: 1, date: -1 });
immutablePlugin(ledgerSchema, 'Ledger');
const FinancialLedgerEntry = model$1('FinancialLedgerEntry', ledgerSchema);

const webhookEventSchema = new Schema$1(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    event: String,
    payloadHash: String,
    processedAt: Date,
    outcome: String,
  },
  { timestamps: true },
);
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
const PaymentWebhookEvent = model$1('PaymentWebhookEvent', webhookEventSchema);

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const notificationSchema = new Schema(
  {
    user: { type: ObjectId, ref: 'User', required: true },
    society: { type: ObjectId, ref: 'Society' },
    type: {
      type: String,
      enum: ['membership', 'announcement', 'complaint', 'bill', 'payment', 'reminder', 'booking', 'service', 'listing', 'community', 'system'],
      required: true,
    },
    title: { type: String, required: true, maxlength: 160 },
    body: { type: String, maxlength: 1000 },
    data: { route: String, id: String },
    readAt: Date,
    pushStatus: { type: String, enum: ['skipped', 'sent', 'failed', 'no_tokens'], default: 'skipped' },
  },
  { timestamps: true },
);
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
const Notification = model('Notification', notificationSchema);

const auditSchema = new Schema(
  {
    actor: { type: ObjectId, ref: 'User' },
    actorRole: String,
    society: { type: ObjectId, ref: 'Society' },
    action: { type: String, required: true },
    targetType: String,
    targetId: String,
    summary: { type: String, maxlength: 500 },
    changes: Schema.Types.Mixed,
    ip: String,
    hash: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ society: 1, createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });
auditSchema.index({ actor: 1, createdAt: -1 });
immutablePlugin(auditSchema, 'Audit log');
const AuditLog = model('AuditLog', auditSchema);

const mediaSchema = new Schema(
  {
    owner: { type: ObjectId, ref: 'User' },
    society: { type: ObjectId, ref: 'Society' },
    purpose: { type: String, enum: ['complaint', 'post', 'property', 'marketplace', 'service', 'registration', 'expense', 'announcement', 'avatar'], required: true },
    visibility: { type: String, enum: ['public', 'society', 'private'], required: true },
    storageKey: { type: String, required: true, unique: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: { type: String, maxlength: 200 },
    attachedTo: { type: String },
  },
  { timestamps: true },
);
const UploadedMedia = model('UploadedMedia', mediaSchema);

/** Distributed job lock: inserting a unique key claims a job run exactly once across restarts and instances. */
const jobLockSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    status: { type: String, enum: ['running', 'done', 'failed'], default: 'running' },
    detail: String,
    finishedAt: Date,
  },
  { timestamps: true },
);
const JobLock = model('JobLock', jobLockSchema);

const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: Schema.Types.Mixed,
    updatedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true },
);
const PlatformSetting = model('PlatformSetting', settingSchema);

const models = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  Announcement,
  AuditLog,
  Building,
  COMPLAINT_STATUSES,
  COMPLAINT_TRANSITIONS,
  Comment,
  CommunityPost,
  Complaint,
  ComplaintAssignment,
  ContentReport,
  Counter,
  Expense,
  Facility,
  FacilityBooking,
  FinancialLedgerEntry,
  Flat,
  JobLock,
  MaintenanceCharge,
  MaintenanceInvoice,
  MarketplaceListing,
  Notification,
  OTPChallenge,
  PAYMENT_TRANSITIONS,
  Payment,
  PaymentWebhookEvent,
  PlatformSetting,
  Poll,
  PollVote,
  PropertyListing,
  PropertyOccupancy,
  PushToken,
  Receipt,
  SERVICE_REQUEST_TRANSITIONS,
  ServiceCategory,
  ServiceRequest,
  Society,
  SocietyMembership,
  SocietyRegistration,
  SocietyStaff,
  UploadedMedia,
  User,
  UserSession,
  immutablePlugin
}, Symbol.toStringTag, { value: 'Module' }));

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
const unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') => new AppError(401, code, message);
const forbidden = (message = 'You do not have permission to perform this action', code = 'FORBIDDEN') => new AppError(403, code, message);
const notFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);
const conflict = (message, code = 'CONFLICT') => new AppError(409, code, message);
const unavailable = (message, code = 'SERVICE_UNAVAILABLE') => new AppError(503, code, message);
const tooMany = (message, retryAfterSeconds) => new AppError(429, 'TOO_MANY_REQUESTS', message, retryAfterSeconds ? { retryAfterSeconds } : undefined);

/**
 * SMS OTP provider adapters. Each adapter sends a server-generated code; verification always happens
 * server-side against the stored hash. Providers never receive or return the hash.
 */
const providers = {
  // Development/test only. Delivers nothing — the code is OTP_TEST_CODE. Refused in production (see env.js).
  test: {
    name: 'test',
    available: () => env.otpTestEnabled,
    generate: () => env.OTP_TEST_CODE,
    async send() {
      return { delivered: false, testMode: true };
    },
  },
  msg91: {
    name: 'msg91',
    available: () => !!env.OTP_PROVIDER_API_KEY && !!env.MSG91_TEMPLATE_ID,
    async send(phone, code) {
      const res = await fetch('https://control.msg91.com/api/v5/flow', {
        method: 'POST',
        headers: { authkey: env.OTP_PROVIDER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: env.MSG91_TEMPLATE_ID, short_url: '0', recipients: [{ mobiles: `91${phone}`, otp: code }] }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw unavailable('SMS provider rejected the request. Please try again shortly.', 'OTP_DELIVERY_FAILED');
      return { delivered: true };
    },
  },
  twilio: {
    name: 'twilio',
    available: () => !!env.OTP_PROVIDER_API_KEY && !!env.TWILIO_ACCOUNT_SID && !!env.TWILIO_FROM_NUMBER,
    async send(phone, code) {
      const body = new URLSearchParams({ To: `+91${phone}`, From: env.TWILIO_FROM_NUMBER, Body: `${code} is your AddaApp verification code. It expires in ${Math.round(env.OTP_TTL_SECONDS / 60)} minutes. Do not share it.` });
      const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.OTP_PROVIDER_API_KEY}`).toString('base64');
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw unavailable('SMS provider rejected the request. Please try again shortly.', 'OTP_DELIVERY_FAILED');
      return { delivered: true };
    },
  },
};

function getOtpProvider() {
  const provider = providers[env.OTP_PROVIDER];
  if (!provider || !provider.available()) return null;
  return provider;
}

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const hmac = (secret, value) => crypto.createHmac('sha256', secret).update(Buffer.isBuffer(value) ? value : String(value)).digest('hex');
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};
const randomCode = (length = 6) => String(crypto.randomInt(0, 10 ** length)).padStart(length, '0');
const shortCode = (length = 6) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[crypto.randomInt(0, alphabet.length)];
  return out;
};

const isObjectId = (v) => mongoose.isValidObjectId(v) && String(new mongoose.Types.ObjectId(String(v))) === String(v);
const oid$1 = (v, label = 'id') => {
  if (!isObjectId(v)) throw badRequest(`Invalid ${label}`);
  return new mongoose.Types.ObjectId(String(v));
};
const orNotFound = (doc, what) => {
  if (!doc) throw notFound(what);
  return doc;
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pagination with an allowlist of sortable fields. */
function paginate(query = {}, { sortable = ['createdAt'], defaultSort = '-createdAt', maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || 20));
  let sortKey = String(query.sort || defaultSort);
  const field = sortKey.replace(/^-/, '');
  if (!sortable.includes(field)) sortKey = defaultSort;
  const sort = { [sortKey.replace(/^-/, '')]: sortKey.startsWith('-') ? -1 : 1, _id: -1 };
  return { page, limit, skip: (page - 1) * limit, sort };
}

async function pagedFind(Model, filter, query, opts = {}) {
  const { page, limit, skip, sort } = paginate(query, opts);
  let q = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (opts.populate) for (const p of [].concat(opts.populate)) q = q.populate(p);
  if (opts.select) q = q.select(opts.select);
  const [items, total] = await Promise.all([q.lean({ virtuals: true }), Model.countDocuments(filter)]);
  return { items, page, limit, total, pages: Math.ceil(total / limit) };
}

/** Money is stored as integer paise. */
const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const formatINR = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plainINR = (paise) => `Rs. ${(Number(paise || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const IST_OFFSET = '+05:30';
const istDate = (dateStr, time = '00:00') => new Date(`${dateStr}T${time}:00${IST_OFFSET}`);
/** YYYY-MM-DD in IST for a Date. */
const istDay = (d = new Date()) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
const currentPeriod = (d = new Date()) => istDay(d).slice(0, 7);
const periodLabel = (period) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const normalizePhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

const BCRYPT_ROUNDS = 12;
const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS);
const verifyPassword = (password, hash) => (hash ? bcrypt.compare(password, hash) : Promise.resolve(false));

const otpHash = (phone, code, challengeId) => hmac(env.otpHashSecret, `${phone}:${challengeId}:${code}`);

function otpStatus$1() {
  const provider = getOtpProvider();
  return { available: !!provider, provider: provider?.name ?? null, testMode: provider?.name === 'test' };
}

async function requestOtp$1(phone, ip) {
  const provider = getOtpProvider();
  if (!provider) throw unavailable('SMS sign-in is not configured on this server yet. Please contact your administrator.', 'OTP_UNAVAILABLE');

  const latest = await OTPChallenge.findOne({ phone }).sort({ createdAt: -1 });
  if (latest?.resendAvailableAt && latest.resendAvailableAt > new Date()) {
    const wait = Math.ceil((latest.resendAvailableAt - Date.now()) / 1000);
    throw tooMany(`Please wait ${wait}s before requesting another code.`, wait);
  }
  const hourAgo = new Date(Date.now() - 3600_000);
  const recent = await OTPChallenge.countDocuments({ phone, createdAt: { $gte: hourAgo } });
  if (recent >= 6) throw tooMany('Too many verification codes requested. Try again in an hour.', 3600);

  // Invalidate earlier unconsumed challenges for this phone.
  await OTPChallenge.updateMany({ phone, consumedAt: null }, { consumedAt: new Date() });

  const code = provider.generate ? provider.generate() : randomCode(6);
  const challenge = new OTPChallenge({
    phone,
    provider: provider.name,
    codeHash: 'pending',
    maxAttempts: env.OTP_MAX_ATTEMPTS,
    expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000),
    resendAvailableAt: new Date(Date.now() + env.OTP_RESEND_COOLDOWN_SECONDS * 1000),
    ip,
  });
  challenge.codeHash = otpHash(phone, code, challenge._id);
  await challenge.save();
  try {
    await provider.send(phone, code);
  } catch (err) {
    await OTPChallenge.deleteOne({ _id: challenge._id });
    throw err;
  }
  return {
    challengeId: challenge._id,
    expiresInSeconds: env.OTP_TTL_SECONDS,
    resendInSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    // Only signals that this is a non-production test environment; the code itself is never returned.
    testMode: provider.name === 'test',
  };
}

async function verifyOtp$1(phone, challengeId, code) {
  const challenge = await OTPChallenge.findOne({ _id: challengeId, phone }).select('+codeHash');
  if (!challenge || challenge.consumedAt) throw new AppError(400, 'OTP_INVALID', 'This code is no longer valid. Request a new one.');
  if (challenge.expiresAt < new Date()) throw new AppError(400, 'OTP_EXPIRED', 'This code has expired. Request a new one.');
  if (challenge.attempts >= challenge.maxAttempts) throw new AppError(429, 'OTP_LOCKED', 'Too many incorrect attempts. Request a new code.');

  const ok = safeEqual(challenge.codeHash, otpHash(phone, code, challenge._id));
  if (!ok) {
    challenge.attempts += 1;
    if (challenge.attempts >= challenge.maxAttempts) challenge.consumedAt = new Date();
    await challenge.save();
    const left = Math.max(0, challenge.maxAttempts - challenge.attempts);
    throw new AppError(400, 'OTP_INCORRECT', left ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many incorrect attempts. Request a new code.');
  }
  // Atomic consume prevents a code being used twice under concurrency.
  const consumed = await OTPChallenge.findOneAndUpdate({ _id: challenge._id, consumedAt: null }, { consumedAt: new Date() });
  if (!consumed) throw new AppError(400, 'OTP_INVALID', 'This code is no longer valid. Request a new one.');

  let user = await User.findOne({ phone });
  let isNew = false;
  if (!user) {
    user = await User.create({ phone, phoneVerifiedAt: new Date() });
    isNew = true;
  } else if (!user.phoneVerifiedAt) {
    user.phoneVerifiedAt = new Date();
    await user.save();
  }
  if (user.status === 'disabled') throw unauthorized('This account has been disabled. Contact support.', 'ACCOUNT_DISABLED');
  return { user, isNew };
}

function signAccessToken(user, session) {
  return jwt.sign({ sub: String(user._id), sid: String(session._id), typ: 'access' }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'addaapp',
    audience: session.client,
  });
}

async function createSession(user, client, { ip, userAgent, deviceName } = {}) {
  const refreshToken = randomToken(48);
  const days = client === 'mobile' ? env.REFRESH_TOKEN_DAYS_MOBILE : env.REFRESH_TOKEN_DAYS_PANEL;
  const session = await UserSession.create({
    user: user._id,
    client,
    refreshTokenHash: sha256(refreshToken),
    expiresAt: new Date(Date.now() + days * 86400_000),
    ip,
    userAgent: userAgent?.slice(0, 300),
    deviceName,
    lastUsedAt: new Date(),
  });
  user.lastLoginAt = new Date();
  await user.save();
  return { accessToken: signAccessToken(user, session), refreshToken, sessionId: session._id, expiresAt: session.expiresAt };
}

/** Rotate a refresh token. Presenting an already-rotated token revokes the session (token theft signal). */
async function rotateRefreshToken(refreshToken) {
  const hash = sha256(refreshToken);
  const session = await UserSession.findOne({ refreshTokenHash: hash });
  if (!session) {
    const reused = await UserSession.findOne({ previousTokenHash: hash, revokedAt: null });
    if (reused) {
      reused.revokedAt = new Date();
      reused.revokedReason = 'refresh_token_reuse';
      await reused.save();
    }
    throw unauthorized('Session expired. Please sign in again.', 'SESSION_INVALID');
  }
  if (session.revokedAt || session.expiresAt < new Date()) throw unauthorized('Session expired. Please sign in again.', 'SESSION_INVALID');
  const user = await User.findById(session.user);
  if (!user || user.status === 'disabled') throw unauthorized('This account has been disabled.', 'ACCOUNT_DISABLED');

  const next = randomToken(48);
  const updated = await UserSession.findOneAndUpdate(
    { _id: session._id, refreshTokenHash: hash, revokedAt: null },
    { refreshTokenHash: sha256(next), previousTokenHash: hash, lastUsedAt: new Date() },
    { returnDocument: 'after' },
  );
  if (!updated) throw unauthorized('Session expired. Please sign in again.', 'SESSION_INVALID');
  return { accessToken: signAccessToken(user, updated), refreshToken: next, sessionId: updated._id, expiresAt: updated.expiresAt, user };
}

async function revokeSession(sessionId, reason = 'logout') {
  await UserSession.updateOne({ _id: sessionId, revokedAt: null }, { revokedAt: new Date(), revokedReason: reason });
}

async function revokeAllSessions(userId, reason) {
  await UserSession.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date(), revokedReason: reason });
}

const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);
const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;

async function adminPasswordLogin(email, password) {
  return passwordLogin({ email: email.toLowerCase() }, password, 'Incorrect email or password.');
}

function assertResidentPasswordLogin() {
  if (!env.RESIDENT_PASSWORD_LOGIN) throw unavailable('Password sign-in is turned off on this server.', 'PASSWORD_LOGIN_DISABLED');
}

/** Interim resident registration (phone + password). Never takes over an existing account. */
async function registerResidentWithPassword(phone, name, password) {
  assertResidentPasswordLogin();
  validatePasswordStrength(password);
  if (await User.exists({ phone })) throw conflict('An account with this mobile number already exists. Sign in instead.', 'ACCOUNT_EXISTS');
  return User.create({ phone, name, passwordHash: await hashPassword(password) });
}

async function residentPasswordLogin(phone, password) {
  assertResidentPasswordLogin();
  return passwordLogin({ phone }, password, 'Incorrect mobile number or password.');
}

/** Shared password check with timing equalisation and lockout after repeated failures. */
async function passwordLogin(filter, password, failMessage) {
  const user = await User.findOne(filter).select('+passwordHash');
  const generic = unauthorized(failMessage, 'INVALID_CREDENTIALS');
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // equalize timing so unknown emails are not detectable
    throw generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again after ${user.lockedUntil.toISOString()}.`);
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    user.failedLoginCount = (user.failedLoginCount || 0) + 1;
    if (user.failedLoginCount >= LOCK_THRESHOLD) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60000);
      user.failedLoginCount = 0;
    }
    await user.save();
    throw generic;
  }
  if (user.status === 'disabled') throw unauthorized('This account has been disabled.', 'ACCOUNT_DISABLED');
  if (user.status === 'pending_setup') throw unauthorized('Finish setting up your password using the activation link.', 'SETUP_REQUIRED');
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  await user.save();
  return user;
}

/** Issue a single-use password setup/reset token. Returns the raw token exactly once. */
async function issuePasswordSetupToken(user, hours = 72) {
  const token = randomToken(32);
  await User.updateOne({ _id: user._id }, { passwordSetupTokenHash: sha256(token), passwordSetupExpiresAt: new Date(Date.now() + hours * 3600_000) });
  return token;
}

function validatePasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 10) throw badRequest('Password must be at least 10 characters.');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) throw badRequest('Password must contain letters and numbers.');
}

async function completePasswordSetup$1(token, password) {
  validatePasswordStrength(password);
  const user = await User.findOne({ passwordSetupTokenHash: sha256(token) }).select('+passwordSetupExpiresAt +passwordSetupTokenHash');
  if (!user || !user.passwordSetupExpiresAt || user.passwordSetupExpiresAt < new Date()) {
    throw new AppError(400, 'TOKEN_INVALID', 'This link is invalid or has expired. Ask your administrator for a new one.');
  }
  user.passwordHash = await hashPassword(password);
  user.passwordSetupTokenHash = undefined;
  user.passwordSetupExpiresAt = undefined;
  if (user.status === 'pending_setup') user.status = 'active';
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  await user.save();
  await revokeAllSessions(user._id, 'password_changed');
  return user;
}

const auditHash = (entry) =>
  sha256(JSON.stringify([String(entry.actor || ''), entry.action, String(entry.society || ''), entry.targetType || '', String(entry.targetId || ''), entry.summary || '', JSON.stringify(entry.changes ?? null), new Date(entry.createdAt).toISOString()]));

/**
 * Record a privileged action. Called with the request (for actor/ip) and the action details.
 * Failure to audit a privileged change is surfaced, never swallowed.
 */
async function audit(req, { action, society, targetType, targetId, summary, changes }, session) {
  const createdAt = new Date();
  const entry = {
    actor: req?.user?._id,
    actorRole: req?.actorRole || req?.user?.platformRole,
    society: society ?? req?.societyId,
    action,
    targetType,
    targetId: targetId ? String(targetId) : undefined,
    summary,
    changes,
    ip: req?.ip,
    createdAt,
  };
  entry.hash = auditHash(entry);
  try {
    const [doc] = await AuditLog.create([entry], { session });
    return doc;
  } catch (err) {
    logger.error({ action, err: err.message }, 'Audit log write failed');
    throw err;
  }
}

/** Atomic per-scope sequence numbers (receipts, invoices, complaint tickets). */
async function nextSequence(key, session) {
  const doc = await Counter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', session });
  return doc.seq;
}

let transport = null;
const mailConfigured = () => !!(env.SMTP_HOST && env.MAIL_FROM);

function getTransport() {
  if (!mailConfigured()) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: (env.SMTP_PORT || 587) === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

/** Returns true only if the SMTP server accepted the message. Never pretends delivery happened. */
async function sendMail({ to, subject, text }) {
  const t = getTransport();
  if (!t || env.isTest) return false;
  try {
    await t.sendMail({ from: env.MAIL_FROM, to, subject, text });
    return true;
  } catch (err) {
    logger.warn({ err: err.message }, 'Email delivery failed');
    return false;
  }
}

const setupLink = (token) => `${env.PANEL_BASE_URL.replace(/\/$/, '')}/set-password?token=${encodeURIComponent(token)}`;

const ROOT = path.resolve(env.STORAGE_LOCAL_DIR);
const SIGNING_SECRET = env.STORAGE_SECRET || env.JWT_ACCESS_SECRET;

/** Allowed types are verified by magic bytes, not by the client-supplied MIME type. */
const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString() === '%PDF-' },
];

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
}).single('file');

const PURPOSE_VISIBILITY = {
  property: 'public',
  marketplace: 'public',
  service: 'public',
  post: 'society',
  announcement: 'society',
  complaint: 'private',
  expense: 'private',
  registration: 'private',
  avatar: 'public',
};

async function storeUpload(file, { owner, society, purpose }) {
  if (!file?.buffer?.length) throw badRequest('No file uploaded (field name must be "file")');
  const sig = SIGNATURES.find((s) => s.test(file.buffer));
  if (!sig) throw badRequest('Unsupported file type. Upload JPG, PNG, WEBP or PDF.');
  if (sig.mime === 'application/pdf' && ['property', 'marketplace', 'service', 'post', 'avatar'].includes(purpose)) throw badRequest('Only images are allowed here');
  const storageKey = `${new Date().toISOString().slice(0, 7)}/${randomToken(18)}.${sig.ext}`;
  const full = path.join(ROOT, storageKey);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, file.buffer, { flag: 'wx' });
  return UploadedMedia.create({
    owner,
    society,
    purpose,
    visibility: PURPOSE_VISIBILITY[purpose] || 'private',
    storageKey,
    mimeType: sig.mime,
    size: file.size,
    originalName: path.basename(file.originalname || 'upload').slice(0, 200),
  });
}

const resolveStoragePath = (storageKey) => {
  const full = path.resolve(ROOT, storageKey);
  if (!full.startsWith(ROOT + path.sep)) throw badRequest('Invalid storage key');
  return full;
};

/**
 * Media URLs. Public media are served directly; non-public media get a short-lived HMAC-signed URL that is
 * only ever issued by endpoints that have already authorized access to the parent record.
 */
function mediaUrl(media, ttlSeconds = 6 * 3600) {
  if (!media?._id) return null;
  const base = `${env.PUBLIC_API_BASE_URL.replace(/\/$/, '')}/media/${media._id}`;
  if (media.visibility === 'public') return base;
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${base}?exp=${exp}&sig=${hmac(SIGNING_SECRET, `${media._id}:${exp}`)}`;
}

function verifyMediaSignature(id, exp, sig) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, hmac(SIGNING_SECRET, `${id}:${exp}`));
}

const presentMedia = (list = []) =>
  list.filter((m) => m && m._id).map((m) => ({ _id: m._id, url: mediaUrl(m), mimeType: m.mimeType, originalName: m.originalName, size: m.size }));

/** Ensure media ids referenced by a record were uploaded by the caller for the right purpose. */
async function claimMedia(ids = [], { owner, purpose, max = 6 }) {
  if (!ids?.length) return [];
  if (ids.length > max) throw badRequest(`At most ${max} attachments are allowed`);
  const media = await UploadedMedia.find({ _id: { $in: ids }, owner, purpose }).select('_id').lean();
  if (media.length !== new Set(ids.map(String)).size) throw badRequest('One or more attachments are invalid');
  return media.map((m) => m._id);
}

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

async function profilePayload(user) {
  const [memberships, staff] = await Promise.all([
    SocietyMembership.find({ user: user._id, status: { $in: ['pending', 'approved', 'rejected', 'suspended'] } })
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('society', 'name code city area status')
      .populate('building', 'name')
      .populate('flat', 'number floor')
      .lean(),
    SocietyStaff.find({ user: user._id, status: 'active' }).populate('society', 'name code city status').lean(),
  ]);
  const u = user.toJSON ? user.toJSON() : user;
  return {
    user: { _id: u._id, name: u.name, phone: u.phone, email: u.email, city: u.city, platformRole: u.platformRole, status: u.status, settings: u.settings, createdAt: u.createdAt },
    needsProfile: !u.name,
    memberships: memberships.map((m) => ({ _id: m._id, status: m.status, residentType: m.residentType, decisionReason: m.decisionReason, society: m.society, building: m.building, flat: m.flat, createdAt: m.createdAt, decidedAt: m.decidedAt })),
    staffRoles: staff.map((s) => ({ _id: s._id, role: s.role, title: s.title, society: s.society })),
  };
}

const otpStatus = (_req, res) => res.json(otpStatus$1());

async function requestOtp(req, res) {
  res.json(await requestOtp$1(req.valid.body.phone, req.ip));
}

async function verifyOtp(req, res) {
  const { phone, challengeId, code, deviceName } = req.valid.body;
  const { user, isNew } = await verifyOtp$1(phone, challengeId, code);
  const tokens = await createSession(user, 'mobile', { ...meta(req), deviceName });
  res.json({ ...tokens, isNewUser: isNew, ...(await profilePayload(user)) });
}

async function refresh$1(req, res) {
  const { user, ...tokens } = await rotateRefreshToken(req.valid.body.refreshToken);
  res.json(tokens);
}

async function logout(req, res) {
  await revokeSession(req.session._id, 'logout');
  await PushToken.deleteMany({ session: req.session._id });
  res.json({ ok: true });
}

async function logoutAll(req, res) {
  await revokeAllSessions(req.user._id, 'logout_all');
  res.json({ ok: true });
}

/** Interim resident sign-up / sign-in without SMS (enabled by RESIDENT_PASSWORD_LOGIN). */
async function residentRegister(req, res) {
  const { phone, name, password, deviceName } = req.valid.body;
  const user = await registerResidentWithPassword(phone, name, password);
  const tokens = await createSession(user, 'mobile', { ...meta(req), deviceName });
  res.status(201).json({ ...tokens, isNewUser: true, ...(await profilePayload(user)) });
}

async function residentLogin(req, res) {
  const { phone, password, deviceName } = req.valid.body;
  const user = await residentPasswordLogin(phone, password);
  const tokens = await createSession(user, 'mobile', { ...meta(req), deviceName });
  res.json({ ...tokens, isNewUser: false, ...(await profilePayload(user)) });
}

/** Panel sign-in (email + password): society staff use SocialPanel, the platform owner uses Master Admin. */
async function adminLogin$1(req, res) {
  const user = await adminPasswordLogin(req.valid.body.email, req.valid.body.password);
  const isStaff = await SocietyStaff.exists({ user: user._id, status: 'active' });
  if (user.platformRole !== 'super_admin' && !isStaff) throw forbidden('This account has no management access.', 'NO_PANEL_ACCESS');
  const tokens = await createSession(user, 'panel', meta(req));
  req.user = user;
  await audit(req, { action: 'auth.panel_login', targetType: 'User', targetId: user._id });
  res.json({ ...tokens, ...(await profilePayload(user)) });
}

/** Any signed-in user changes their own password (current password required). Other devices are signed out. */
async function changeOwnPassword(req, res) {
  const { currentPassword, newPassword } = req.valid.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new AppError(400, 'PASSWORD_INCORRECT', 'Your current password is not correct.');
  validatePasswordStrength(newPassword);
  if (await verifyPassword(newPassword, user.passwordHash)) throw badRequest('Choose a password different from your current one.');
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  await UserSession.updateMany({ user: user._id, revokedAt: null, _id: { $ne: req.session._id } }, { revokedAt: new Date(), revokedReason: 'password_changed' });
  await audit(req, { action: 'auth.password_changed', targetType: 'User', targetId: user._id });
  res.json({ ok: true });
}

async function completePasswordSetup(req, res) {
  const user = await completePasswordSetup$1(req.valid.body.token, req.valid.body.password);
  req.user = user;
  await audit(req, { action: 'auth.password_set', targetType: 'User', targetId: user._id });
  res.json({ ok: true, email: user.email });
}

/** Always responds identically so the endpoint cannot be used to discover accounts. */
async function requestPasswordReset(req, res) {
  const generic = { ok: true, emailDelivery: mailConfigured(), message: mailConfigured() ? 'If the account exists, a reset link has been emailed.' : 'Email delivery is not configured. Ask your platform administrator to issue a reset link.' };
  const user = await User.findOne({ email: req.valid.body.email, status: { $ne: 'disabled' } });
  if (user && mailConfigured()) {
    const token = await issuePasswordSetupToken(user, 1);
    await sendMail({ to: user.email, subject: 'Reset your AddaApp password', text: `Use this link within 1 hour to set a new password:\n\n${setupLink(token)}\n\nIf you did not request this, ignore this email.` });
  }
  res.json(generic);
}

async function me(req, res) {
  res.json(await profilePayload(req.user));
}

async function updateMe$1(req, res) {
  const body = req.valid.body;
  if (body.email && body.email !== req.user.email) {
    const taken = await User.exists({ email: body.email, _id: { $ne: req.user._id } });
    if (taken) throw conflict('This email is already used by another account');
  }
  if (body.name !== undefined) req.user.name = body.name;
  if (body.email !== undefined && req.user.platformRole === 'user' && !(await SocietyStaff.exists({ user: req.user._id }))) req.user.email = body.email;
  if (body.city !== undefined) req.user.city = body.city;
  if (body.settings) req.user.settings = { ...req.user.settings?.toObject?.(), ...body.settings };
  await req.user.save();
  res.json(await profilePayload(req.user));
}

async function registerPushToken(req, res) {
  const { token, platform } = req.valid.body;
  await PushToken.findOneAndUpdate({ token }, { user: req.user._id, platform, session: req.session._id, lastSeenAt: new Date() }, { upsert: true });
  res.json({ ok: true });
}

async function removePushToken(req, res) {
  await PushToken.deleteOne({ token: req.valid.body.token, user: req.user._id });
  res.json({ ok: true });
}

const API = 'https://api.razorpay.com/v1';

const authHeader = () => `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.PAYMENT_SECRET_KEY}`).toString('base64')}`;

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', json?.error?.description || 'Payment provider request failed');
  }
  return json;
}

const razorpay = {
  name: 'razorpay',
  publicKeyId: () => env.RAZORPAY_KEY_ID,

  /** transfers routes the amount to a society's Razorpay Route linked account when configured. */
  createOrder({ amountPaise, receipt, notes, linkedAccountId }) {
    const body = { amount: amountPaise, currency: 'INR', receipt, notes, payment_capture: 1 };
    if (linkedAccountId) body.transfers = [{ account: linkedAccountId, amount: amountPaise, currency: 'INR', on_hold: 0, notes }];
    return call('POST', '/orders', body);
  },
  fetchPayment: (paymentId) => call('GET', `/payments/${encodeURIComponent(paymentId)}`),
  refund: (paymentId, amountPaise, notes) => call('POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes }),

  verifyCheckoutSignature(orderId, paymentId, signature) {
    if (!env.PAYMENT_SECRET_KEY || !signature) return false;
    return safeEqual(hmac(env.PAYMENT_SECRET_KEY, `${orderId}|${paymentId}`), signature);
  },
  /** Must be computed over the exact raw request body bytes. */
  verifyWebhookSignature(rawBody, signature) {
    if (!env.PAYMENT_WEBHOOK_SECRET || !signature || !rawBody) return false;
    return safeEqual(hmac(env.PAYMENT_WEBHOOK_SECRET, rawBody), signature);
  },
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function sendExpoPush(tokens, { title, body, data }) {
  if (!tokens.length || env.isTest) return 'skipped';
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;
  const messages = tokens.map((t) => ({ to: t.token, title, body, data, sound: 'default', channelId: 'default' }));
  try {
    const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers, body: JSON.stringify(messages), signal: AbortSignal.timeout(10000) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn({ status: res.status }, 'Expo push request rejected');
      return 'failed';
    }
    const tickets = Array.isArray(json.data) ? json.data : [];
    const dead = tickets
      .map((ticket, i) => (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
      .filter(Boolean);
    if (dead.length) await PushToken.deleteMany({ token: { $in: dead } });
    return tickets.some((t) => t.status === 'ok') ? 'sent' : 'failed';
  } catch (err) {
    logger.warn({ err: err.message }, 'Expo push delivery failed');
    return 'failed';
  }
}

/**
 * Create in-app notifications for users and attempt push delivery. In-app records are the source of truth;
 * push is best-effort and its outcome is stored on the notification.
 */
async function notifyUsers(userIds, { society, type, title, body, route, id }) {
  const unique = [...new Set(userIds.map(String))];
  if (!unique.length) return [];
  const docs = await Notification.insertMany(unique.map((user) => ({ user, society, type, title, body, data: { route, id: id ? String(id) : undefined } })));
  // Push delivery runs after the response path; failures are logged and recorded, not thrown.
  setImmediate(async () => {
    try {
      const optedIn = await User.find({ _id: { $in: unique }, 'settings.pushEnabled': { $ne: false }, status: 'active' }).select('_id').lean();
      const tokens = await PushToken.find({ user: { $in: optedIn.map((u) => u._id) } }).lean();
      const status = tokens.length ? await sendExpoPush(tokens, { title, body, data: { route, id: id ? String(id) : undefined } }) : 'no_tokens';
      await Notification.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { pushStatus: status });
    } catch (err) {
      logger.warn({ err: err.message }, 'Push dispatch error');
    }
  });
  return docs;
}

async function notifySocietyResidents(societyId, payload) {
  const members = await SocietyMembership.find({ society: societyId, status: 'approved' }).select('user').lean();
  return notifyUsers(members.map((m) => m.user), { ...payload, society: societyId });
}

async function notifyFlatResidents(societyId, flatId, payload) {
  const members = await SocietyMembership.find({ society: societyId, flat: flatId, status: 'approved' }).select('user').lean();
  return notifyUsers(members.map((m) => m.user), { ...payload, society: societyId });
}

/**
 * Lines for one flat. Precedence: per-flat override > active charge heads > society default amount.
 * per_sqft charges store paise per square foot; the product is rounded to the nearest paisa once per line.
 */
function computeInvoiceLines(society, flat, charges) {
  if (Number.isInteger(flat.maintenanceAmountPaise) && flat.maintenanceAmountPaise > 0) {
    return [{ label: 'Monthly maintenance', amountPaise: flat.maintenanceAmountPaise, kind: 'charge' }];
  }
  const applicable = charges.filter((c) => c.active && (!c.flatCategory || c.flatCategory === flat.category));
  if (applicable.length) {
    return applicable
      .map((c) => ({
        label: c.name,
        amountPaise: c.calculation === 'per_sqft' ? Math.round(c.amountPaise * (flat.areaSqft || 0)) : c.amountPaise,
        kind: 'charge',
      }))
      .filter((l) => l.amountPaise > 0);
  }
  const def = society.billing?.defaultAmountPaise || 0;
  return def > 0 ? [{ label: 'Monthly maintenance', amountPaise: def, kind: 'charge' }] : [];
}

const sumLines = (lines) => lines.reduce((s, l) => s + l.amountPaise, 0);

function defaultDueDate(society, period) {
  const day = String(society.billing?.dueDayOfMonth || 10).padStart(2, '0');
  return istDate(`${period}-${day}`, '23:59');
}

/**
 * Generate one invoice per active flat for a billing period. Idempotent: the partial unique index
 * (society, flat, period, active) makes a second run (or a concurrent run) skip flats already billed.
 */
async function generateInvoices(societyId, period, { actorId, buildingId, dueDate } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw badRequest('Period must be YYYY-MM');
  const society = await Society.findById(societyId).lean();
  if (!society) throw notFound('Society');
  const flatFilter = { society: societyId, active: true };
  if (buildingId) flatFilter.building = buildingId;
  const [flats, charges, existing] = await Promise.all([
    Flat.find(flatFilter).lean(),
    MaintenanceCharge.find({ society: societyId, active: true }).lean(),
    MaintenanceInvoice.find({ society: societyId, period, active: true }).select('flat').lean(),
  ]);
  if (!flats.length) throw badRequest('Add buildings and flats before generating bills');
  const billed = new Set(existing.map((e) => String(e.flat)));
  const due = dueDate || defaultDueDate(society, period);
  const result = { period, created: 0, alreadyBilled: 0, zeroAmount: 0, invoices: [] };

  for (const flat of flats) {
    if (billed.has(String(flat._id))) {
      result.alreadyBilled += 1;
      continue;
    }
    const lines = computeInvoiceLines(society, flat, charges);
    const total = sumLines(lines);
    if (total <= 0) {
      result.zeroAmount += 1;
      continue;
    }
    const arrears = await MaintenanceInvoice.aggregate([
      { $match: { flat: flat._id, active: true, status: { $in: ['unpaid', 'partially_paid'] }, period: { $lt: period } } },
      { $group: { _id: null, due: { $sum: { $subtract: ['$totalPaise', '$paidPaise'] } } } },
    ]);
    const seq = await nextSequence(`invoice:${societyId}:${period}`);
    const invoiceNumber = `${society.billing?.invoicePrefix || 'INV'}/${period.replace('-', '')}/${String(seq).padStart(4, '0')}`;
    try {
      const invoice = await MaintenanceInvoice.create({
        society: societyId,
        flat: flat._id,
        building: flat.building,
        period,
        invoiceNumber,
        lines,
        totalPaise: total,
        arrearsAtIssuePaise: arrears[0]?.due || 0,
        dueDate: due,
        createdBy: actorId,
      });
      result.created += 1;
      result.invoices.push(invoice._id);
      notifyFlatResidents(societyId, flat._id, {
        type: 'bill',
        title: `${periodLabel(period)} maintenance bill`,
        body: `${formatINR(total)} is due by ${due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}.`,
        route: 'Invoice',
        id: invoice._id,
      }).catch((err) => logger.warn({ err: err.message }, 'Bill notification failed'));
    } catch (err) {
      if (err.code === 11000) result.alreadyBilled += 1;
      else throw err;
    }
  }
  return result;
}

/** Apply received money to an invoice inside a transaction. Returns { applied, unapplied, invoice }. */
async function applyToInvoice(invoiceId, amountPaise, session) {
  const invoice = await MaintenanceInvoice.findById(invoiceId).session(session);
  if (!invoice) throw notFound('Invoice');
  if (invoice.status === 'cancelled') throw conflict('This invoice was cancelled', 'INVOICE_CANCELLED');
  const balance = invoice.totalPaise - invoice.paidPaise;
  const applied = Math.min(balance, amountPaise);
  invoice.paidPaise += applied;
  invoice.status = invoice.paidPaise >= invoice.totalPaise ? 'paid' : invoice.paidPaise > 0 ? 'partially_paid' : 'unpaid';
  if (invoice.status === 'paid') invoice.paidAt = new Date();
  await invoice.save({ session });
  return { applied, unapplied: amountPaise - applied, invoice };
}

async function unapplyFromInvoice(invoiceId, amountPaise, session) {
  const invoice = await MaintenanceInvoice.findById(invoiceId).session(session);
  if (!invoice) throw notFound('Invoice');
  invoice.paidPaise = Math.max(0, invoice.paidPaise - amountPaise);
  if (invoice.status !== 'cancelled') invoice.status = invoice.paidPaise >= invoice.totalPaise ? 'paid' : invoice.paidPaise > 0 ? 'partially_paid' : 'unpaid';
  if (invoice.status !== 'paid') invoice.paidAt = undefined;
  await invoice.save({ session });
  return invoice;
}

async function cancelInvoice(invoiceId, societyId, reason) {
  const invoice = await MaintenanceInvoice.findOne({ _id: invoiceId, society: societyId });
  if (!invoice) throw notFound('Invoice');
  if (invoice.status === 'cancelled') return invoice;
  if (invoice.paidPaise > 0) throw conflict('Invoices with recorded payments cannot be cancelled. Reverse the payment first.', 'INVOICE_HAS_PAYMENTS');
  invoice.status = 'cancelled';
  invoice.active = false;
  invoice.cancelledAt = new Date();
  invoice.cancelReason = reason;
  await invoice.save();
  return invoice;
}

/** Adds the configured late fee once to overdue invoices. Safe to run repeatedly. */
async function applyLateFees(societyId, now = new Date()) {
  const society = await Society.findById(societyId).lean();
  const fee = society?.billing?.lateFeePaise || 0;
  if (!fee) return 0;
  const overdue = await MaintenanceInvoice.find({ society: societyId, active: true, status: { $in: ['unpaid', 'partially_paid'] }, dueDate: { $lt: now }, lateFeeAppliedAt: null });
  let count = 0;
  for (const inv of overdue) {
    const res = await MaintenanceInvoice.updateOne(
      { _id: inv._id, lateFeeAppliedAt: null },
      { $push: { lines: { label: 'Late payment fee', amountPaise: fee, kind: 'late_fee' } }, $inc: { totalPaise: fee }, $set: { lateFeeAppliedAt: now } },
    );
    if (res.modifiedCount) {
      count += 1;
      // paid invoices never reach here; a partially paid one stays partially paid.
    }
  }
  return count;
}

async function flatOutstanding(flatId) {
  const rows = await MaintenanceInvoice.aggregate([
    { $match: { flat: new mongoose.Types.ObjectId(String(flatId)), active: true, status: { $in: ['unpaid', 'partially_paid'] } } },
    { $group: { _id: null, due: { $sum: { $subtract: ['$totalPaise', '$paidPaise'] } }, count: { $sum: 1 }, overdue: { $sum: { $cond: [{ $lt: ['$dueDate', new Date()] }, 1, 0] } } } },
  ]);
  return { outstandingPaise: rows[0]?.due || 0, openInvoices: rows[0]?.count || 0, overdueInvoices: rows[0]?.overdue || 0 };
}

/**
 * Post a ledger entry exactly once per business event. A repeated eventKey returns the original entry
 * instead of double-counting (webhook retries, job restarts, client double-submits).
 */
async function postLedgerEntry(entry, session) {
  if (!Number.isInteger(entry.amountPaise) || entry.amountPaise <= 0) throw badRequest('Ledger amount must be a positive integer (paise)');
  const existing = await FinancialLedgerEntry.findOne({ society: entry.society, eventKey: entry.eventKey }).session(session || null);
  if (existing) return existing;
  const [doc] = await FinancialLedgerEntry.create([{ date: new Date(), ...entry }], { session });
  return doc;
}

/** Reversal = equal and opposite entry referencing the original. History is never edited. */
async function reverseLedgerEntry(entryId, { memo, createdBy, eventKey }, session) {
  const original = await FinancialLedgerEntry.findById(entryId).session(session || null);
  if (!original) throw notFound('Ledger entry');
  if (original.entryType === 'reversal') throw badRequest('A reversal cannot itself be reversed; post an adjustment instead');
  const already = await FinancialLedgerEntry.findOne({ reverses: original._id }).session(session || null);
  if (already) return already;
  return postLedgerEntry(
    {
      society: original.society,
      direction: original.direction === 'credit' ? 'debit' : 'credit',
      amountPaise: original.amountPaise,
      account: original.account,
      category: original.category,
      entryType: 'reversal',
      sourceType: original.sourceType,
      sourceId: original.sourceId,
      reverses: original._id,
      memo: memo || `Reversal of ${original.eventKey}`,
      createdBy,
      eventKey: eventKey || `reversal:${original._id}`,
    },
    session,
  );
}

/** Credits minus debits, split by account, for an optional date window. Pure integer arithmetic in paise. */
async function ledgerTotals(societyId, { from, to } = {}) {
  const match = { society: new mongoose.Types.ObjectId(String(societyId)) };
  if (from || to) match.date = { ...(from && { $gte: from }), ...(to && { $lt: to }) };
  const rows = await FinancialLedgerEntry.aggregate([
    { $match: match },
    { $group: { _id: { account: '$account', direction: '$direction', entryType: '$entryType' }, total: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
  ]);
  const out = { creditsPaise: 0, debitsPaise: 0, netPaise: 0, byAccount: {}, byType: {} };
  for (const r of rows) {
    const sign = r._id.direction === 'credit' ? 1 : -1;
    if (sign > 0) out.creditsPaise += r.total;
    else out.debitsPaise += r.total;
    out.byAccount[r._id.account] = (out.byAccount[r._id.account] || 0) + sign * r.total;
    out.byType[r._id.entryType] = (out.byType[r._id.entryType] || 0) + sign * r.total;
  }
  out.netPaise = out.creditsPaise - out.debitsPaise;
  return out;
}

async function balanceBefore(societyId, date) {
  const totals = await ledgerTotals(societyId, { to: date });
  return totals.netPaise;
}

let provider = razorpay;
let providerConfigured = () => env.paymentsConfigured;
/** Test seam: swap the gateway adapter (never used by application code). */
function __setPaymentProvider(mock, configured = true) {
  provider = mock || razorpay;
  providerConfigured = () => (mock ? configured : env.paymentsConfigured);
}

const canTransition = (from, to) => from === to || (PAYMENT_TRANSITIONS[from] || []).includes(to);

function financialYear(d = new Date()) {
  const ist = new Date(d.getTime() + 330 * 60000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

function paymentAvailability(society) {
  if (!providerConfigured()) return { available: false, reason: 'Online payments are not configured on this server yet.' };
  if (!society?.payments?.onlineEnabled) return { available: false, reason: 'Your society has not enabled online collection yet. Pay through the society office.' };
  return { available: true, provider: provider.name };
}

const transaction = (fn) => mongoose.connection.transaction(fn);

async function issueReceipt(payment, session) {
  if (payment.receipt) return Receipt.findById(payment.receipt).session(session);
  const fy = financialYear(payment.paidOn || new Date());
  const seq = await nextSequence(`receipt:${payment.society}:${fy}`, session);
  const payer = payment.payer ? await User.findById(payment.payer).select('name').session(session).lean() : null;
  // Office-recorded payments have no payer user: name the flat's approved residents instead.
  let issuedToName = payer?.name;
  if (!issuedToName) {
    const residents = await SocietyMembership.find({ flat: payment.flat, status: 'approved' }).populate('user', 'name').session(session).lean();
    issuedToName = residents.map((m) => m.user?.name).filter(Boolean).join(', ') || undefined;
  }
  const [receipt] = await Receipt.create(
    [
      {
        society: payment.society,
        receiptNumber: `RCPT/${fy}/${String(seq).padStart(6, '0')}`,
        payment: payment._id,
        invoice: payment.invoice,
        flat: payment.flat,
        issuedTo: payment.payer,
        issuedToName,
        amountPaise: payment.amountPaise,
        method: payment.channel === 'online' ? payment.providerMethod || 'online' : payment.method,
        issuedAt: payment.paidOn || new Date(),
      },
    ],
    { session },
  );
  payment.receipt = receipt._id;
  return receipt;
}

/** Resident starts an online payment. Amount is always the server-computed invoice balance. */
async function initiateOnlinePayment({ user, membership, invoiceId }) {
  const invoice = await MaintenanceInvoice.findOne({ _id: invoiceId, society: membership.society._id || membership.society, flat: membership.flat });
  if (!invoice) throw notFound('Invoice');
  if (invoice.status === 'cancelled') throw conflict('This invoice was cancelled', 'INVOICE_CANCELLED');
  const balance = invoice.totalPaise - invoice.paidPaise;
  if (balance <= 0) throw conflict('This invoice is already paid', 'INVOICE_PAID');
  const society = await Society.findById(invoice.society).lean();
  const availability = paymentAvailability(society);
  if (!availability.available) throw unavailable(availability.reason, 'PAYMENTS_UNAVAILABLE');

  // Reuse a recent open order for the same user/invoice/amount to avoid duplicate orders on retries.
  const recent = await Payment.findOne({ invoice: invoice._id, payer: user._id, status: 'created', amountPaise: balance, createdAt: { $gt: new Date(Date.now() - 20 * 60000) } });
  let payment = recent;
  if (!payment) {
    const order = await provider.createOrder({
      amountPaise: balance,
      receipt: invoice.invoiceNumber.slice(0, 40),
      notes: { invoiceId: String(invoice._id), societyId: String(invoice.society), flatId: String(invoice.flat) },
      linkedAccountId: society.payments?.settlementMode === 'razorpay_route' ? society.payments.linkedAccountId : undefined,
    });
    if (order.amount !== balance) throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Gateway order amount mismatch');
    payment = await Payment.create({
      society: invoice.society,
      invoice: invoice._id,
      flat: invoice.flat,
      payer: user._id,
      amountPaise: balance,
      channel: 'online',
      method: 'gateway',
      provider: provider.name,
      providerOrderId: order.id,
      status: 'created',
      statusHistory: [{ status: 'created', source: 'initiate' }],
    });
  }
  return {
    paymentId: payment._id,
    provider: provider.name,
    keyId: provider.publicKeyId(),
    orderId: payment.providerOrderId,
    amountPaise: payment.amountPaise,
    currency: 'INR',
    invoiceNumber: invoice.invoiceNumber,
    societyName: society.name,
    prefill: { name: user.name || '', contact: user.phone ? `+91${user.phone}` : '' },
  };
}

/**
 * Transition a gateway payment to captured: applies to the invoice, issues a receipt and posts the
 * ledger credit in ONE transaction. Repeated calls (client callback + webhook + retries) are no-ops.
 */
async function markCaptured(paymentId, { providerPaymentId, providerMethod, source, amountPaise }) {
  let captured = false;
  const result = await transaction(async (session) => {
    const payment = await Payment.findById(paymentId).session(session);
    if (!payment) throw notFound('Payment');
    if (['captured', 'refunded', 'partially_refunded', 'reversed'].includes(payment.status)) return payment;
    if (!canTransition(payment.status, 'captured')) throw conflict(`Payment cannot move from ${payment.status} to captured`);
    if (amountPaise !== undefined && amountPaise !== payment.amountPaise) {
      throw new AppError(409, 'AMOUNT_MISMATCH', 'Captured amount does not match the order amount');
    }
    const { applied, unapplied } = await applyToInvoice(payment.invoice, payment.amountPaise, session);
    payment.status = 'captured';
    payment.providerPaymentId = providerPaymentId || payment.providerPaymentId;
    payment.providerMethod = providerMethod || payment.providerMethod;
    payment.paidOn = new Date();
    payment.appliedPaise = applied;
    payment.unappliedPaise = unapplied;
    payment.statusHistory.push({ status: 'captured', source, note: unapplied ? `Excess ${unapplied} paise held for refund/adjustment` : undefined });
    await issueReceipt(payment, session);
    await payment.save({ session });
    await postLedgerEntry(
      {
        society: payment.society,
        direction: 'credit',
        amountPaise: payment.amountPaise,
        account: 'gateway',
        category: 'Maintenance collection',
        entryType: 'maintenance_collection',
        sourceType: 'payment',
        sourceId: payment._id,
        memo: `Online payment ${payment.providerPaymentId || ''}`.trim(),
        eventKey: `payment:${payment._id}:capture`,
      },
      session,
    );
    captured = true;
    return payment;
  });
  if (captured) {
    notifyFlatResidents(result.society, result.flat, {
      type: 'payment',
      title: 'Payment received',
      body: `${formatINR(result.amountPaise)} received. Your receipt is ready.`,
      route: 'Receipt',
      id: result.receipt,
    }).catch(() => {});
  }
  return result;
}

async function markFailed(paymentId, { reason, source }) {
  const payment = await Payment.findById(paymentId);
  if (!payment || !canTransition(payment.status, 'failed') || payment.status === 'failed') return payment;
  const res = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ['created', 'authorized'] } },
    { status: 'failed', failureReason: reason?.slice(0, 300), $push: { statusHistory: { status: 'failed', source, note: reason?.slice(0, 300) } } },
    { returnDocument: 'after' },
  );
  return res || payment;
}

/**
 * Checkout callback from the app. The signature proves the IDs came from the gateway, but the Paid state is
 * only set after the server independently fetches the payment from the provider and checks status + amount.
 */
async function confirmCheckout({ user, orderId, providerPaymentId, signature }) {
  const payment = await Payment.findOne({ providerOrderId: orderId });
  if (!payment) throw notFound('Payment');
  if (String(payment.payer) !== String(user._id)) throw forbidden('This payment belongs to another user');
  if (!provider.verifyCheckoutSignature(orderId, providerPaymentId, signature)) throw badRequest('Payment signature verification failed');
  const remote = await provider.fetchPayment(providerPaymentId);
  if (remote.order_id !== orderId) throw badRequest('Payment does not belong to this order');
  if (remote.status === 'captured') {
    return markCaptured(payment._id, { providerPaymentId, providerMethod: remote.method, source: 'checkout_verified', amountPaise: remote.amount });
  }
  if (remote.status === 'failed') return markFailed(payment._id, { reason: remote.error_description, source: 'checkout_verified' });
  if (remote.status === 'authorized' && payment.status === 'created') {
    payment.status = 'authorized';
    payment.providerPaymentId = providerPaymentId;
    payment.statusHistory.push({ status: 'authorized', source: 'checkout_verified' });
    await payment.save();
  }
  return payment;
}

/** Signed, idempotent webhook processing. Returns a short outcome string for logging/tests. */
async function handleWebhook(rawBody, signature, eventIdHeader) {
  if (!provider.verifyWebhookSignature(rawBody, signature)) throw badRequest('Invalid webhook signature');
  const payload = JSON.parse(rawBody.toString('utf8'));
  const eventId = eventIdHeader || sha256(rawBody);
  try {
    await PaymentWebhookEvent.create({ provider: provider.name, eventId, event: payload.event, payloadHash: sha256(rawBody) });
  } catch (err) {
    if (err.code === 11000) return 'duplicate';
    throw err;
  }
  let outcome = 'ignored';
  const entity = payload.payload?.payment?.entity;
  try {
    if ((payload.event === 'payment.captured' || payload.event === 'order.paid') && entity) {
      const payment = await Payment.findOne({ providerOrderId: entity.order_id });
      if (payment) {
        await markCaptured(payment._id, { providerPaymentId: entity.id, providerMethod: entity.method, source: 'webhook', amountPaise: entity.amount });
        outcome = 'captured';
      } else outcome = 'unknown_order';
    } else if (payload.event === 'payment.failed' && entity) {
      const payment = await Payment.findOne({ providerOrderId: entity.order_id });
      if (payment) {
        await markFailed(payment._id, { reason: entity.error_description, source: 'webhook' });
        outcome = 'failed';
      } else outcome = 'unknown_order';
    } else if (payload.event === 'refund.processed') {
      const refund = payload.payload?.refund?.entity;
      if (refund) outcome = await applyRefund(refund.payment_id, refund.amount, refund.id);
    }
    await PaymentWebhookEvent.updateOne({ provider: provider.name, eventId }, { processedAt: new Date(), outcome });
  } catch (err) {
    // Allow the provider to retry: remove the dedupe record when processing failed.
    await PaymentWebhookEvent.deleteOne({ provider: provider.name, eventId });
    throw err;
  }
  return outcome;
}

async function applyRefund(providerPaymentId, amountPaise, refundId) {
  return transaction(async (session) => {
    const payment = await Payment.findOne({ providerPaymentId }).session(session);
    if (!payment) return 'unknown_payment';
    const newRefunded = Math.min(payment.amountPaise, payment.refundedPaise + amountPaise);
    const delta = newRefunded - payment.refundedPaise;
    if (delta <= 0) return 'refund_noop';
    const target = newRefunded >= payment.amountPaise ? 'refunded' : 'partially_refunded';
    if (!canTransition(payment.status, target)) return 'refund_invalid_state';
    // Refunds first consume any unapplied excess, then reduce what was applied to the invoice.
    const fromExcess = Math.min(payment.unappliedPaise, delta);
    const fromApplied = delta - fromExcess;
    if (fromApplied > 0) await unapplyFromInvoice(payment.invoice, fromApplied, session);
    payment.unappliedPaise -= fromExcess;
    payment.appliedPaise -= fromApplied;
    payment.refundedPaise = newRefunded;
    payment.status = target;
    payment.statusHistory.push({ status: target, source: 'webhook', note: `Refund ${refundId}` });
    await payment.save({ session });
    await postLedgerEntry(
      { society: payment.society, direction: 'debit', amountPaise: delta, account: 'gateway', category: 'Maintenance refund', entryType: 'refund', sourceType: 'payment', sourceId: payment._id, memo: `Refund ${refundId}`, eventKey: `refund:${refundId}` },
      session,
    );
    return target;
  });
}

/** Society staff record cash/bank/cheque collections. Cannot exceed the outstanding balance. */
async function recordOfflinePayment(req, invoiceId, { amountPaise, method, paidOn, referenceNumber, note, idempotencyKey }) {
  const result = await transaction(async (session) => {
    const invoice = await MaintenanceInvoice.findOne({ _id: invoiceId, society: req.societyId }).session(session);
    if (!invoice) throw notFound('Invoice');
    if (invoice.status === 'cancelled') throw conflict('This invoice was cancelled', 'INVOICE_CANCELLED');
    const balance = invoice.totalPaise - invoice.paidPaise;
    if (amountPaise > balance) throw badRequest(`Amount exceeds the outstanding balance of ${formatINR(balance)}`);
    if (idempotencyKey) {
      const dup = await Payment.findOne({ society: req.societyId, referenceNumber: `idem:${idempotencyKey}` }).session(session);
      if (dup) return dup;
    }
    const [payment] = await Payment.create(
      [
        {
          society: req.societyId,
          invoice: invoice._id,
          flat: invoice.flat,
          amountPaise,
          channel: 'offline',
          method,
          provider: 'manual',
          status: 'captured',
          statusHistory: [{ status: 'captured', source: 'manual_entry' }],
          referenceNumber: idempotencyKey ? `idem:${idempotencyKey}` : referenceNumber,
          note: [referenceNumber && idempotencyKey ? `Ref: ${referenceNumber}` : null, note].filter(Boolean).join(' · ') || undefined,
          paidOn: paidOn || new Date(),
          recordedBy: req.user._id,
        },
      ],
      { session },
    );
    const { applied } = await applyToInvoice(invoice._id, amountPaise, session);
    payment.appliedPaise = applied;
    await issueReceipt(payment, session);
    await payment.save({ session });
    await postLedgerEntry(
      {
        society: req.societyId,
        date: payment.paidOn,
        direction: 'credit',
        amountPaise,
        account: method === 'cash' ? 'cash' : 'bank',
        category: 'Maintenance collection',
        entryType: 'maintenance_collection',
        sourceType: 'payment',
        sourceId: payment._id,
        memo: `Offline ${method} payment for ${invoice.invoiceNumber}`,
        createdBy: req.user._id,
        eventKey: `payment:${payment._id}:capture`,
      },
      session,
    );
    await audit(req, { action: 'payment.offline_recorded', targetType: 'Payment', targetId: payment._id, summary: `${formatINR(amountPaise)} ${method} for ${invoice.invoiceNumber}` }, session);
    return payment;
  });
  notifyFlatResidents(result.society, result.flat, { type: 'payment', title: 'Payment recorded', body: `${formatINR(result.amountPaise)} recorded by your society office.`, route: 'Receipt', id: result.receipt }).catch(() => {});
  return result;
}

/** Reverse an offline payment (e.g. bounced cheque). Online payments must be refunded through the gateway. */
async function reverseOfflinePayment(req, paymentId, reason) {
  return transaction(async (session) => {
    const payment = await Payment.findOne({ _id: paymentId, society: req.societyId }).session(session);
    if (!payment) throw notFound('Payment');
    if (payment.channel !== 'offline') throw badRequest('Online payments are reversed through a gateway refund');
    if (payment.status === 'reversed') return payment;
    if (!canTransition(payment.status, 'reversed')) throw conflict(`Cannot reverse a ${payment.status} payment`);
    await unapplyFromInvoice(payment.invoice, payment.appliedPaise, session);
    payment.status = 'reversed';
    payment.statusHistory.push({ status: 'reversed', source: 'manual_entry', note: reason });
    await payment.save({ session });
    await postLedgerEntry(
      {
        society: payment.society,
        direction: 'debit',
        amountPaise: payment.amountPaise,
        account: payment.method === 'cash' ? 'cash' : 'bank',
        category: 'Maintenance collection',
        entryType: 'reversal',
        sourceType: 'payment',
        sourceId: payment._id,
        memo: `Reversal: ${reason}`,
        createdBy: req.user._id,
        eventKey: `payment:${payment._id}:reverse`,
      },
      session,
    );
    await audit(req, { action: 'payment.reversed', targetType: 'Payment', targetId: payment._id, summary: reason }, session);
    return payment;
  });
}

async function requestGatewayRefund(req, paymentId, amountPaise, reason) {
  const payment = await Payment.findOne({ _id: paymentId, society: req.societyId });
  if (!payment) throw notFound('Payment');
  if (payment.channel !== 'online' || !payment.providerPaymentId) throw badRequest('Only captured online payments can be refunded');
  if (!['captured', 'partially_refunded'].includes(payment.status)) throw conflict(`Cannot refund a ${payment.status} payment`);
  if (!providerConfigured()) throw unavailable('Payment gateway is not configured', 'PAYMENTS_UNAVAILABLE');
  const max = payment.amountPaise - payment.refundedPaise;
  const amount = Math.min(amountPaise || max, max);
  const refund = await provider.refund(payment.providerPaymentId, amount, { reason: reason?.slice(0, 200) });
  payment.statusHistory.push({ status: payment.status, source: 'refund_requested', note: `Refund ${refund.id} requested: ${reason}` });
  await payment.save();
  await audit(req, { action: 'payment.refund_requested', targetType: 'Payment', targetId: payment._id, summary: `${formatINR(amount)} — ${reason}` });
  // Ledger and invoice changes happen when the provider confirms via the refund.processed webhook.
  if (refund.status === 'processed') await applyRefund(payment.providerPaymentId, refund.amount, refund.id);
  notifyUsers([payment.payer].filter(Boolean), { society: payment.society, type: 'payment', title: 'Refund initiated', body: `${formatINR(amount)} refund initiated.`, route: 'Payments' }).catch(() => {});
  return payment;
}

logger.debug({ configured: env.paymentsConfigured }, 'Payment gateway configuration loaded');

/** Non-secret runtime capabilities the clients use to show accurate availability states. */
async function config(_req, res) {
  res.json({
    apiVersion: 'v1',
    environment: env.NODE_ENV,
    otp: otpStatus$1(),
    passwordLogin: { available: env.RESIDENT_PASSWORD_LOGIN },
    payments: { gatewayConfigured: paymentAvailability({ payments: { onlineEnabled: true } }).available, provider: env.paymentsConfigured ? 'razorpay' : null },
    uploads: { maxMb: env.MAX_UPLOAD_MB, types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  });
}

async function categories(req, res) {
  const kind = ['complaint', 'service', 'marketplace'].includes(req.query.kind) ? req.query.kind : null;
  if (!kind) throw badRequest('kind must be complaint, service or marketplace');
  const items = await ServiceCategory.find({ kind, society: null, active: true }).sort({ sortOrder: 1, name: 1 }).select('name icon description kind').lean();
  res.json({ items });
}

// ---------- society registration ----------
const presentRegistration = (r) => ({
  referenceCode: r.referenceCode,
  status: r.status,
  societyName: r.societyName,
  city: r.city,
  submittedAt: r.submittedAt,
  reviewedAt: r.reviewedAt,
  decisionReason: r.status === 'rejected' ? r.decisionReason : undefined,
  updatedAt: r.updatedAt,
});

async function attachRegistrationDocs(ids = []) {
  if (!ids.length) return [];
  const docs = await UploadedMedia.find({ _id: { $in: ids }, purpose: 'registration', attachedTo: null }).select('_id').lean();
  if (docs.length !== new Set(ids.map(String)).size) throw badRequest('One or more documents are invalid or already used');
  return docs.map((d) => d._id);
}

async function submitRegistration(req, res) {
  const { submit, documents, ...data } = req.valid.body;
  const accessKey = randomToken(12);
  const referenceCode = `SR-${new Date().getFullYear()}-${shortCode(6)}`;
  const docIds = await attachRegistrationDocs(documents);
  const reg = await SocietyRegistration.create({ ...data, documents: docIds, referenceCode, accessKeyHash: sha256(accessKey), status: submit ? 'submitted' : 'draft', submittedAt: submit ? new Date() : undefined });
  if (docIds.length) await UploadedMedia.updateMany({ _id: { $in: docIds } }, { attachedTo: `registration:${reg._id}` });
  // The access key is shown once; only its hash is stored.
  res.status(201).json({ ...presentRegistration(reg), accessKey, message: 'Save your reference code and access key to check status later.' });
}

async function findRegistration(referenceCode, accessKey) {
  const reg = await SocietyRegistration.findOne({ referenceCode }).select('+accessKeyHash');
  if (!reg || !safeEqual(reg.accessKeyHash, sha256(accessKey))) throw new AppError(404, 'NOT_FOUND', 'No registration matches that reference code and access key');
  return reg;
}

/** For an approved application: the society code, sign-in email and whether the admin account still needs a password. */
async function approvalDetails(reg) {
  if (reg.status !== 'approved' || !reg.society) return {};
  const [society, user] = await Promise.all([
    Society.findById(reg.society).select('name code status').lean(),
    User.findOne({ email: reg.representative?.email }).select('status').lean(),
  ]);
  return {
    society: society ? { name: society.name, code: society.code, status: society.status } : undefined,
    adminEmail: reg.representative?.email,
    activation: user?.status === 'pending_setup' ? 'required' : 'done',
  };
}

async function registrationStatus$1(req, res) {
  const reg = await findRegistration(req.valid.body.referenceCode, req.valid.body.accessKey);
  res.json({ ...presentRegistration(reg), ...(await approvalDetails(reg)) });
}

/**
 * The registrant activates the approved society's admin account by proving they hold the reference code
 * AND the one-time access key, then choosing a password. Works without email delivery.
 */
async function activateRegistration(req, res) {
  const { referenceCode, accessKey, password } = req.valid.body;
  const reg = await findRegistration(referenceCode, accessKey);
  if (reg.status !== 'approved' || !reg.society) throw badRequest('This application has not been approved yet.');
  validatePasswordStrength(password);
  const user = await User.findOne({ email: reg.representative?.email });
  if (!user || !(await SocietyStaff.exists({ society: reg.society, user: user._id, role: 'admin' }))) throw notFound('Admin account');
  if (user.status !== 'pending_setup') throw conflict('This account is already active. Sign in with your email and password.', 'ALREADY_ACTIVATED');
  user.passwordHash = await hashPassword(password);
  user.passwordSetupTokenHash = undefined;
  user.passwordSetupExpiresAt = undefined;
  user.status = 'active';
  user.failedLoginCount = 0;
  await user.save();
  req.user = user;
  await audit(req, { action: 'auth.registration_activated', society: reg.society, targetType: 'User', targetId: user._id, summary: reg.referenceCode });
  res.json({ ok: true, email: user.email, ...(await approvalDetails(reg)) });
}

async function updateRegistration(req, res) {
  const { referenceCode, accessKey, submit, documents, ...data } = req.valid.body;
  const reg = await findRegistration(referenceCode, accessKey);
  if (!['draft', 'rejected'].includes(reg.status)) throw badRequest('Only drafts or rejected applications can be edited');
  Object.assign(reg, data);
  if (documents?.length) {
    const ids = await attachRegistrationDocs(documents);
    reg.documents.push(...ids);
    await UploadedMedia.updateMany({ _id: { $in: ids } }, { attachedTo: `registration:${reg._id}` });
  }
  if (submit) {
    reg.status = 'submitted';
    reg.submittedAt = new Date();
    reg.decisionReason = undefined;
  }
  await reg.save();
  res.json(presentRegistration(reg));
}

async function uploadRegistrationDocument(req, res) {
  const media = await storeUpload(req.file, { owner: undefined, purpose: 'registration' });
  res.status(201).json({ _id: media._id, mimeType: media.mimeType, size: media.size, originalName: media.originalName });
}

// ---------- society discovery for residents ----------
async function searchSocieties(req, res) {
  const { q, city, page = 1 } = req.valid.query;
  const filter = { status: 'active' };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { area: rx }, { city: rx }, { code: q.toUpperCase() }];
  }
  if (city) filter.city = new RegExp(`^${escapeRegex(city)}$`, 'i');
  const items = await Society.find(filter).select('name code area city state pincode').sort({ name: 1 }).skip((page - 1) * 20).limit(20).lean();
  res.json({ items, page });
}

async function societyBuildings(req, res) {
  const society = await Society.findOne({ _id: req.params.id, status: 'active' }).select('name code area city').lean();
  if (!society) throw notFound('Society');
  const buildings = await Building.find({ society: society._id, active: true }).select('name floors').sort({ name: 1 }).lean();
  res.json({ society, buildings });
}

// ---------- media ----------
/**
 * Serves stored files. Public media is open; other media requires a valid signed URL (issued only by
 * endpoints that already authorized the parent record).
 */
async function serveMedia(req, res) {
  if (!isObjectId(req.params.id)) throw notFound('File');
  const media = await UploadedMedia.findById(req.params.id).lean();
  if (!media) throw notFound('File');
  if (media.visibility !== 'public' && !verifyMediaSignature(String(media._id), req.query.exp, req.query.sig)) {
    throw new AppError(403, 'FORBIDDEN', 'This link has expired or is invalid');
  }
  const full = resolveStoragePath(media.storageKey);
  if (!fs$1.existsSync(full)) throw notFound('File');
  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', media.visibility === 'public' ? 'public, max-age=86400' : 'private, max-age=3600');
  if (media.mimeType === 'application/pdf') res.setHeader('Content-Disposition', `inline; filename="${(media.originalName || 'document.pdf').replace(/[^\w.-]/g, '_')}"`);
  fs$1.createReadStream(full).pipe(res);
}

const UPLOAD_PURPOSES = ['complaint', 'post', 'property', 'marketplace', 'service', 'expense', 'announcement', 'avatar'];
async function uploadMedia(req, res) {
  const purpose = req.body?.purpose;
  if (!UPLOAD_PURPOSES.includes(purpose)) throw badRequest(`purpose must be one of ${UPLOAD_PURPOSES.join(', ')}`);
  // Society-scoped uploads are tagged with the caller's verified society (resident or staff), never a client value.
  let society;
  if (['complaint', 'post'].includes(purpose)) {
    const m = await SocietyMembership.findOne({ user: req.user._id, status: 'approved' }).select('society').lean();
    if (!m) throw new AppError(403, 'MEMBERSHIP_REQUIRED', 'Join a society to attach files here');
    society = m.society;
  } else if (['expense', 'announcement'].includes(purpose)) {
    const s = await SocietyStaff.findOne({ user: req.user._id, status: 'active' }).select('society').lean();
    if (!s) throw new AppError(403, 'FORBIDDEN', 'Only society staff can upload these files');
    society = s.society;
  }
  const media = await storeUpload(req.file, { owner: req.user._id, society, purpose });
  res.status(201).json({ _id: media._id, url: mediaUrl(media), mimeType: media.mimeType, size: media.size, originalName: media.originalName });
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHMM = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
const ACTIVE = ['pending', 'confirmed'];

function facilitySlots(facility, date) {
  const open = toMinutes(facility.openTime);
  const close = toMinutes(facility.closeTime);
  const slots = [];
  for (let t = open; t + facility.slotMinutes <= close; t += facility.slotMinutes) {
    slots.push({ startTime: toHHMM(t), endTime: toHHMM(t + facility.slotMinutes), start: istDate(date, toHHMM(t)), end: istDate(date, toHHMM(t + facility.slotMinutes)) });
  }
  return slots;
}

async function availability(facility, date) {
  const dayStart = istDate(date, '00:00');
  const dayEnd = new Date(dayStart.getTime() + 86400_000);
  const bookings = await FacilityBooking.find({ facility: facility._id, status: { $in: ACTIVE }, start: { $lt: dayEnd }, end: { $gt: dayStart } }).select('start end status').lean();
  const now = new Date();
  return facilitySlots(facility, date).map((s) => {
    const clash = bookings.find((b) => b.start < s.end && b.end > s.start);
    return { startTime: s.startTime, endTime: s.endTime, available: !clash && s.start > now, status: clash ? clash.status : s.start <= now ? 'past' : 'free' };
  });
}

/**
 * Overlap-safe booking. Inside a transaction we bump facility.bookingVersion first: concurrent transactions
 * touching the same facility hit a write conflict, so the overlap check + insert are effectively serialized.
 */
async function createBooking({ societyId, membership, user, facilityId, date, startTime, endTime, purpose }) {
  const facility = await Facility.findOne({ _id: facilityId, society: societyId, active: true });
  if (!facility) throw notFound('Facility');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('Date must be YYYY-MM-DD');
  const slots = facilitySlots(facility, date);
  const first = slots.find((s) => s.startTime === startTime);
  const last = slots.find((s) => s.endTime === (endTime || first?.endTime));
  if (!first || !last || last.end <= first.start) throw badRequest('Choose a valid time slot within opening hours');
  if (first.start <= new Date()) throw badRequest('This slot has already started');
  const maxDate = new Date(Date.now() + facility.maxAdvanceDays * 86400_000);
  if (first.start > maxDate) throw badRequest(`Bookings open ${facility.maxAdvanceDays} days in advance`);
  const hours = (last.end - first.start) / 3600_000;
  const slotCount = Math.round((last.end - first.start) / (facility.slotMinutes * 60000));

  return mongoose.connection.transaction(async (session) => {
    await Facility.updateOne({ _id: facility._id }, { $inc: { bookingVersion: 1 } }, { session });
    const clash = await FacilityBooking.findOne({ facility: facility._id, status: { $in: ACTIVE }, start: { $lt: last.end }, end: { $gt: first.start } }).session(session);
    if (clash) throw conflict('This slot is no longer available. Pick another time.', 'SLOT_TAKEN');
    const [booking] = await FacilityBooking.create(
      [
        {
          society: societyId,
          facility: facility._id,
          user: user._id,
          membership: membership._id,
          start: first.start,
          end: last.end,
          date,
          feePaise: facility.feePaise * slotCount,
          purpose,
          status: facility.requiresApproval ? 'pending' : 'confirmed',
        },
      ],
      { session },
    );
    booking._hours = hours;
    return booking;
  });
}

const todayIST = () => istDay();

const AUDIT_DISCLAIMER =
  'This is a system-generated, audit-supporting statement prepared from records entered in AddaApp. It is not a certified or statutory audit report. Formal audits must be performed by a qualified professional.';

const oid = (v) => new mongoose.Types.ObjectId(String(v));

function range({ from, to }) {
  if (!from || !to) throw badRequest('from and to dates (YYYY-MM-DD) are required');
  const start = istDate(from);
  const end = new Date(istDate(to).getTime() + 86400_000);
  if (end <= start) throw badRequest('to must be on or after from');
  return { start, end };
}

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');

/** Each builder returns { title, subtitle, columns, rows, totals, summary, notes }. Money columns are paise. */
const builders = {
  async 'collection-monthly'(society, q) {
    if (!/^\d{4}-\d{2}$/.test(q.period || '')) throw badRequest('period (YYYY-MM) is required');
    const invoices = await MaintenanceInvoice.find({ society: society._id, period: q.period, active: true }).populate('flat', 'number').populate('building', 'name').sort({ invoiceNumber: 1 }).lean();
    const rows = invoices.map((i) => ({ invoice: i.invoiceNumber, unit: `${i.building?.name || ''} ${i.flat?.number || ''}`.trim(), billed: i.totalPaise, collected: i.paidPaise, due: i.totalPaise - i.paidPaise, status: i.status }));
    const totals = { billed: sum(rows, 'billed'), collected: sum(rows, 'collected'), due: sum(rows, 'due') };
    return {
      title: `Maintenance collection — ${periodLabel(q.period)}`,
      columns: [col('invoice', 'Invoice'), col('unit', 'Unit'), money('billed', 'Billed'), money('collected', 'Collected'), money('due', 'Outstanding'), col('status', 'Status')],
      rows,
      totals,
      summary: [['Invoices', rows.length], ['Collection rate', totals.billed ? `${((totals.collected / totals.billed) * 100).toFixed(1)}%` : '—']],
    };
  },

  async 'collection-yearly'(society, q) {
    const year = Number(q.year);
    if (!year || year < 2000 || year > 2100) throw badRequest('year is required');
    const agg = await MaintenanceInvoice.aggregate([
      { $match: { society: society._id, active: true, period: { $gte: `${year}-01`, $lte: `${year}-12` } } },
      { $group: { _id: '$period', billed: { $sum: '$totalPaise' }, collected: { $sum: '$paidPaise' }, invoices: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const rows = agg.map((r) => ({ period: periodLabel(r._id), invoices: r.invoices, billed: r.billed, collected: r.collected, due: r.billed - r.collected }));
    return {
      title: `Maintenance collection — ${year}`,
      columns: [col('period', 'Month'), col('invoices', 'Invoices'), money('billed', 'Billed'), money('collected', 'Collected'), money('due', 'Outstanding')],
      rows,
      totals: { billed: sum(rows, 'billed'), collected: sum(rows, 'collected'), due: sum(rows, 'due') },
    };
  },

  async 'dues'(society) {
    const agg = await MaintenanceInvoice.aggregate([
      { $match: { society: society._id, active: true, status: { $in: ['unpaid', 'partially_paid'] } } },
      { $group: { _id: '$flat', due: { $sum: { $subtract: ['$totalPaise', '$paidPaise'] } }, invoices: { $sum: 1 }, oldest: { $min: '$dueDate' } } },
      { $sort: { due: -1 } },
    ]);
    const flats = await Flat.find({ _id: { $in: agg.map((a) => a._id) } }).populate('building', 'name').lean();
    const byId = Object.fromEntries(flats.map((f) => [String(f._id), f]));
    const rows = agg.map((a) => ({ unit: `${byId[String(a._id)]?.building?.name || ''} ${byId[String(a._id)]?.number || ''}`.trim(), invoices: a.invoices, oldest: fmtDate(a.oldest), due: a.due }));
    return { title: 'Flat-wise pending dues', columns: [col('unit', 'Unit'), col('invoices', 'Open invoices'), col('oldest', 'Oldest due date'), money('due', 'Outstanding')], rows, totals: { due: sum(rows, 'due') } };
  },

  async 'resident-statement'(society, q) {
    if (!q.flatId) throw badRequest('flatId is required');
    const flat = await Flat.findOne({ _id: q.flatId, society: society._id }).populate('building', 'name').lean();
    if (!flat) throw badRequest('Unknown flat');
    const [invoices, payments, members] = await Promise.all([
      MaintenanceInvoice.find({ society: society._id, flat: flat._id, active: true }).lean(),
      Payment.find({ society: society._id, flat: flat._id, status: { $in: ['captured', 'partially_refunded', 'refunded', 'reversed'] } }).populate('receipt', 'receiptNumber').lean(),
      SocietyMembership.find({ society: society._id, flat: flat._id, status: 'approved' }).populate('user', 'name phone').lean(),
    ]);
    const events = [
      ...invoices.map((i) => ({ date: i.issuedAt, ref: i.invoiceNumber, particulars: `Bill ${periodLabel(i.period)}`, debit: i.totalPaise, credit: 0 })),
      ...payments.map((p) => ({ date: p.paidOn || p.createdAt, ref: p.receipt?.receiptNumber || '', particulars: `Payment (${p.method})${p.status === 'reversed' ? ' — reversed' : ''}`, debit: 0, credit: p.status === 'reversed' ? 0 : p.amountPaise - p.refundedPaise })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));
    let running = 0;
    const rows = events.map((e) => {
      running += e.debit - e.credit;
      return { ...e, date: fmtDate(e.date), balance: running };
    });
    return {
      title: `Resident statement — ${flat.building?.name || ''} ${flat.number}`,
      subtitle: members.map((m) => `${m.user?.name || 'Resident'} (${m.residentType})`).join(', '),
      columns: [col('date', 'Date'), col('ref', 'Reference'), col('particulars', 'Particulars'), money('debit', 'Debit'), money('credit', 'Credit'), money('balance', 'Balance')],
      rows,
      totals: { debit: sum(rows, 'debit'), credit: sum(rows, 'credit') },
      summary: [['Closing balance due', plainINR(running)]],
    };
  },

  async 'income-expense'(society, q) {
    const { start, end } = range(q);
    const [opening, totals, byCategory] = await Promise.all([
      balanceBefore(society._id, start),
      ledgerTotals(society._id, { from: start, to: end }),
      FinancialLedgerEntry.aggregate([
        { $match: { society: society._id, date: { $gte: start, $lt: end } } },
        { $group: { _id: { category: '$category', direction: '$direction' }, total: { $sum: '$amountPaise' } } },
        { $sort: { '_id.direction': 1, total: -1 } },
      ]),
    ]);
    const rows = byCategory.map((r) => ({ category: r._id.category, type: r._id.direction === 'credit' ? 'Income' : 'Expense', income: r._id.direction === 'credit' ? r.total : 0, expense: r._id.direction === 'debit' ? r.total : 0 }));
    return {
      title: 'Income & expense summary',
      subtitle: `${q.from} to ${q.to}`,
      columns: [col('category', 'Category'), col('type', 'Type'), money('income', 'Income'), money('expense', 'Expense')],
      rows,
      totals: { income: totals.creditsPaise, expense: totals.debitsPaise },
      summary: [['Opening balance', plainINR(opening)], ['Total income', plainINR(totals.creditsPaise)], ['Total expense', plainINR(totals.debitsPaise)], ['Closing balance', plainINR(opening + totals.netPaise)]],
      data: { openingPaise: opening, closingPaise: opening + totals.netPaise, incomePaise: totals.creditsPaise, expensePaise: totals.debitsPaise, byAccount: totals.byAccount },
    };
  },

  async 'vendor-expenditure'(society, q) {
    const { start, end } = range(q);
    const agg = await Expense.aggregate([
      { $match: { society: society._id, status: 'recorded', paidOn: { $gte: start, $lt: end } } },
      { $group: { _id: { $ifNull: ['$vendor', '(No vendor)'] }, total: { $sum: '$amountPaise' }, count: { $sum: 1 }, categories: { $addToSet: '$category' } } },
      { $sort: { total: -1 } },
    ]);
    const rows = agg.map((a) => ({ vendor: a._id, categories: a.categories.join(', '), count: a.count, total: a.total }));
    return { title: 'Vendor expenditure', subtitle: `${q.from} to ${q.to}`, columns: [col('vendor', 'Vendor'), col('categories', 'Categories'), col('count', 'Payments'), money('total', 'Total paid')], rows, totals: { total: sum(rows, 'total') } };
  },

  async 'ledger'(society, q) {
    const { start, end } = range(q);
    const opening = await balanceBefore(society._id, start);
    const entries = await FinancialLedgerEntry.find({ society: society._id, date: { $gte: start, $lt: end } }).sort({ date: 1, _id: 1 }).limit(10000).lean();
    let running = opening;
    const rows = entries.map((e) => {
      running += e.direction === 'credit' ? e.amountPaise : -e.amountPaise;
      return { date: fmtDate(e.date), type: e.entryType.replace(/_/g, ' '), category: e.category, account: e.account, memo: e.memo || '', credit: e.direction === 'credit' ? e.amountPaise : 0, debit: e.direction === 'debit' ? e.amountPaise : 0, balance: running };
    });
    return {
      title: 'Transaction ledger',
      subtitle: `${q.from} to ${q.to}`,
      columns: [col('date', 'Date'), col('type', 'Type'), col('category', 'Category'), col('account', 'Account'), col('memo', 'Memo'), money('credit', 'Credit'), money('debit', 'Debit'), money('balance', 'Balance')],
      rows,
      totals: { credit: sum(rows, 'credit'), debit: sum(rows, 'debit') },
      summary: [['Opening balance', plainINR(opening)], ['Closing balance', plainINR(running)]],
    };
  },

  async 'audit-summary'(society, q) {
    const ie = await builders['income-expense'](society, q);
    const { start, end } = range(q);
    const [billing, gateway, offline, expenses, voided] = await Promise.all([
      MaintenanceInvoice.aggregate([{ $match: { society: society._id, active: true, issuedAt: { $gte: start, $lt: end } } }, { $group: { _id: null, billed: { $sum: '$totalPaise' }, collected: { $sum: '$paidPaise' }, n: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { society: society._id, channel: 'online', status: { $in: ['captured', 'partially_refunded', 'refunded'] }, paidOn: { $gte: start, $lt: end } } }, { $group: { _id: null, total: { $sum: '$amountPaise' }, refunded: { $sum: '$refundedPaise' }, n: { $sum: 1 } } }]),
      Payment.aggregate([{ $match: { society: society._id, channel: 'offline', status: 'captured', paidOn: { $gte: start, $lt: end } } }, { $group: { _id: '$method', total: { $sum: '$amountPaise' }, n: { $sum: 1 } } }]),
      Expense.aggregate([{ $match: { society: society._id, status: 'recorded', paidOn: { $gte: start, $lt: end } } }, { $group: { _id: '$category', total: { $sum: '$amountPaise' }, n: { $sum: 1 } } }, { $sort: { total: -1 } }]),
      Expense.countDocuments({ society: society._id, status: 'voided', voidedAt: { $gte: start, $lt: end } }),
    ]);
    const rows = [
      { section: 'Billing', item: `Invoices issued (${billing[0]?.n || 0})`, amount: billing[0]?.billed || 0 },
      { section: 'Billing', item: 'Collected against these invoices', amount: billing[0]?.collected || 0 },
      { section: 'Gateway', item: `Online payments captured (${gateway[0]?.n || 0})`, amount: gateway[0]?.total || 0 },
      { section: 'Gateway', item: 'Refunded to residents', amount: gateway[0]?.refunded || 0 },
      ...offline.map((o) => ({ section: 'Offline', item: `${o._id} (${o.n})`, amount: o.total })),
      ...expenses.map((e) => ({ section: 'Expenses', item: `${e._id} (${e.n})`, amount: e.total })),
    ];
    return {
      title: 'Audit-supporting financial statement',
      subtitle: `${q.from} to ${q.to}`,
      columns: [col('section', 'Section'), col('item', 'Item'), money('amount', 'Amount')],
      rows,
      summary: [...ie.summary, ['Voided expense records in period', voided]],
      notes: [AUDIT_DISCLAIMER],
    };
  },
};

function col(key, label) {
  return { key, label, type: 'text' };
}
function money(key, label) {
  return { key, label, type: 'money' };
}
function sum(rows, key) {
  return rows.reduce((s, r) => s + (r[key] || 0), 0);
}

const REPORT_TYPES = Object.keys(builders);

async function buildReport(society, type, query) {
  const builder = builders[type];
  if (!builder) throw badRequest(`Unknown report. Use one of: ${REPORT_TYPES.join(', ')}`);
  const report = await builder({ ...society, _id: oid(society._id) }, query);
  report.society = { name: society.name, address: [society.addressLine, society.area, society.city, society.pincode].filter(Boolean).join(', ') };
  report.generatedAt = new Date().toISOString();
  report.notes = report.notes || ['System-generated report. Not a certified or statutory audit.'];
  return report;
}

/** Single payment receipt as a PDF stream. */
function receiptToPdf({ receipt, society, invoice, flat, payment }) {
  const doc = new PDFDocument({ size: 'A5', margin: 36 });
  const w = doc.page.width - 72;
  doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f3963').text(society.name, { width: w });
  doc.fontSize(8).font('Helvetica').fillColor('#555').text([society.addressLine, society.area, society.city, society.pincode].filter(Boolean).join(', '), { width: w });
  doc.moveDown(0.8).fontSize(13).fillColor('#111').font('Helvetica-Bold').text('Payment Receipt');
  doc.moveDown(0.5).fontSize(9);
  const row = (k, v) => doc.font('Helvetica').fillColor('#555').text(k, { continued: true }).font('Helvetica-Bold').fillColor('#111').text(`  ${v ?? '—'}`);
  row('Receipt number:', receipt.receiptNumber);
  row('Date:', fmtDate(receipt.issuedAt));
  row('Received from:', receipt.issuedToName || 'Resident');
  row('Unit:', `${flat?.building?.name || ''} ${flat?.number || ''}`.trim());
  row('Against invoice:', `${invoice?.invoiceNumber} (${invoice ? periodLabel(invoice.period) : ''})`);
  row('Payment mode:', receipt.method);
  if (payment?.providerPaymentId) row('Transaction ID:', payment.providerPaymentId);
  if (payment?.status && payment.status !== 'captured') row('Status:', payment.status.replace(/_/g, ' '));
  doc.moveDown(0.8).fontSize(16).font('Helvetica-Bold').fillColor('#0f3963').text(plainINR(receipt.amountPaise));
  doc.moveDown(1).fontSize(7).font('Helvetica-Oblique').fillColor('#777').text('This is a computer-generated receipt issued by AddaApp on behalf of the society and does not require a signature.', { width: w });
  doc.end();
  return doc;
}

function reportToPdf(report) {
  const doc = new PDFDocument({ size: 'A4', layout: report.columns.length > 6 ? 'landscape' : 'portrait', margin: 36 });
  const width = doc.page.width - 72;
  doc.fontSize(15).font('Helvetica-Bold').text(report.society.name);
  doc.fontSize(8).font('Helvetica').fillColor('#555').text(report.society.address);
  doc.moveDown(0.6).fontSize(13).fillColor('#0f3963').font('Helvetica-Bold').text(report.title);
  if (report.subtitle) doc.fontSize(9).fillColor('#444').font('Helvetica').text(report.subtitle);
  doc.fontSize(7).fillColor('#777').text(`Generated ${new Date(report.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  doc.moveDown(0.6);

  if (report.summary?.length) {
    doc.fontSize(9).fillColor('#111');
    for (const [k, v] of report.summary) doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(String(v));
    doc.moveDown(0.6);
  }

  const colW = width / report.columns.length;
  const drawRow = (cells, bold, fill) => {
    const y = doc.y;
    const h = 16;
    if (y + h > doc.page.height - 50) {
      doc.addPage();
      return drawRow(cells, bold, fill);
    }
    if (fill) doc.rect(36, y, width, h).fill(fill);
    doc.fillColor('#111').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5);
    cells.forEach((c, i) => doc.text(String(c ?? ''), 36 + i * colW + 3, y + 4, { width: colW - 6, height: h - 4, ellipsis: true, align: report.columns[i].type === 'money' ? 'right' : 'left', lineBreak: false }));
    doc.x = 36;
    doc.y = y + h;
  };
  drawRow(report.columns.map((c) => c.label), true, '#e8eef6');
  if (!report.rows.length) drawRow(['No records for this selection', ...report.columns.slice(1).map(() => '')], false);
  report.rows.forEach((r, idx) => drawRow(report.columns.map((c) => (c.type === 'money' ? plainINR(r[c.key]) : r[c.key])), false, idx % 2 ? '#f7f9fc' : null));
  if (report.totals) drawRow(report.columns.map((c, i) => (i === 0 ? 'Total' : report.totals[c.key] !== undefined ? plainINR(report.totals[c.key]) : '')), true, '#e8eef6');

  doc.moveDown(1);
  doc.fontSize(7).fillColor('#666').font('Helvetica-Oblique');
  for (const n of report.notes) doc.text(n, 36, doc.y, { width });
  doc.end();
  return doc;
}

async function reportToXlsx(report) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AddaApp';
  const ws = wb.addWorksheet(report.title.slice(0, 31).replace(/[\\/*?:[\]]/g, ' '));
  ws.addRow([report.society.name]).font = { bold: true, size: 13 };
  ws.addRow([report.title]).font = { bold: true, size: 12 };
  if (report.subtitle) ws.addRow([report.subtitle]);
  for (const [k, v] of report.summary || []) ws.addRow([k, v]);
  ws.addRow([]);
  const header = ws.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF6' } }));
  for (const r of report.rows) ws.addRow(report.columns.map((c) => (c.type === 'money' ? (r[c.key] || 0) / 100 : r[c.key])));
  if (report.totals) {
    const t = ws.addRow(report.columns.map((c, i) => (i === 0 ? 'Total' : report.totals[c.key] !== undefined ? report.totals[c.key] / 100 : null)));
    t.font = { bold: true };
  }
  report.columns.forEach((c, i) => {
    const column = ws.getColumn(i + 1);
    column.width = c.type === 'money' ? 16 : 22;
    if (c.type === 'money') column.numFmt = '"₹"#,##0.00';
  });
  ws.addRow([]);
  for (const n of report.notes) ws.addRow([n]).font = { italic: true, size: 9 };
  return wb.xlsx.writeBuffer();
}

const STAFF_ALERT_ROLES = ['admin', 'secretary', 'manager'];
async function alertStaff(societyId, payload, roles = STAFF_ALERT_ROLES) {
  const staff = await SocietyStaff.find({ society: societyId, status: 'active', role: { $in: roles } }).select('user').lean();
  return notifyUsers(staff.map((s) => s.user), { ...payload, society: societyId }).catch(() => {});
}

async function categoriesFor(kind, societyId) {
  return ServiceCategory.find({ kind, active: true, $or: [{ society: null }, ...(societyId ? [{ society: societyId }] : [])] })
    .sort({ sortOrder: 1, name: 1 })
    .select('name icon description kind society')
    .lean();
}

// ======================= Membership =======================
async function requestMembership(req, res) {
  const { societyId, buildingId, flatNumber, residentType, name, note } = req.valid.body;
  const society = await Society.findOne({ _id: societyId, status: 'active' }).lean();
  if (!society) throw notFound('Society');
  const building = await Building.findOne({ _id: buildingId, society: society._id, active: true }).lean();
  if (!building) throw badRequest('Select a building from this society');
  const flat = await Flat.findOne({ society: society._id, building: building._id, number: flatNumber.trim().toUpperCase(), active: true }).lean();
  if (!flat) throw new AppError(400, 'FLAT_NOT_FOUND', `Flat ${flatNumber.toUpperCase()} is not registered in ${building.name}. Check the number or ask your society office to add it.`);
  if (!req.user.name && !name) throw badRequest('Please add your full name');
  if (name) {
    req.user.name = name;
    await req.user.save();
  }
  const existing = await SocietyMembership.findOne({ user: req.user._id, flat: flat._id, live: true }).lean();
  if (existing) throw conflict(existing.status === 'approved' ? 'You are already a member for this flat' : 'You already have a pending request for this flat', 'MEMBERSHIP_EXISTS');
  const membership = await SocietyMembership.create({ society: society._id, user: req.user._id, building: building._id, flat: flat._id, residentType, note });
  alertStaff(society._id, { type: 'membership', title: 'New resident request', body: `${req.user.name} requested to join ${building.name} ${flat.number}.`, route: 'memberships', id: membership._id }, ['admin', 'secretary']);
  res.status(201).json({ _id: membership._id, status: membership.status, society: { _id: society._id, name: society.name }, building: { _id: building._id, name: building.name }, flat: { _id: flat._id, number: flat.number } });
}

async function myMemberships(req, res) {
  const items = await SocietyMembership.find({ user: req.user._id }).sort({ updatedAt: -1 }).populate('society', 'name code city area status').populate('building', 'name').populate('flat', 'number floor').lean();
  res.json({ items });
}

async function cancelMembership(req, res) {
  const m = await SocietyMembership.findOne({ _id: req.valid.params.id, user: req.user._id });
  if (!m) throw notFound('Membership');
  if (!['pending', 'approved'].includes(m.status)) throw badRequest('This request is already closed');
  m.status = 'cancelled';
  m.live = false;
  await m.save();
  res.json({ _id: m._id, status: m.status });
}

// ======================= Home =======================
async function home(req, res) {
  const m = req.membership;
  const [society, flat, dues, nextInvoice, openComplaints, announcements, bookings, unread, openPolls] = await Promise.all([
    Society.findById(req.societyId).select('name code city area').lean(),
    Flat.findById(m.flat).populate('building', 'name').lean(),
    flatOutstanding(m.flat),
    MaintenanceInvoice.findOne({ flat: m.flat, active: true, status: { $in: ['unpaid', 'partially_paid'] } }).sort({ dueDate: 1 }).lean({ virtuals: true }),
    Complaint.countDocuments({ society: req.societyId, raisedBy: req.user._id, status: { $in: ['pending', 'assigned', 'in_progress'] } }),
    Announcement.find({ $or: [{ society: req.societyId }, { scope: 'platform' }], status: 'published' }).sort({ createdAt: -1 }).limit(3).select('title category important createdAt').lean(),
    FacilityBooking.find({ user: req.user._id, society: req.societyId, status: { $in: ['pending', 'confirmed'] }, end: { $gt: new Date() } }).sort({ start: 1 }).limit(3).populate('facility', 'name icon').lean(),
    Notification.countDocuments({ user: req.user._id, readAt: null }),
    Poll.countDocuments({ society: req.societyId, status: 'open' }),
  ]);
  const payments = await paymentAvailability(await Society.findById(req.societyId).select('payments').lean());
  res.json({
    society,
    membership: { _id: m._id, residentType: m.residentType, flat: { _id: flat?._id, number: flat?.number, building: flat?.building?.name } },
    dues: { ...dues, nextInvoice: nextInvoice ? { _id: nextInvoice._id, period: nextInvoice.period, invoiceNumber: nextInvoice.invoiceNumber, totalPaise: nextInvoice.totalPaise, balancePaise: nextInvoice.totalPaise - nextInvoice.paidPaise, dueDate: nextInvoice.dueDate, overdue: nextInvoice.dueDate < new Date() } : null },
    openComplaints,
    announcements,
    upcomingBookings: bookings.map((b) => ({ _id: b._id, facility: b.facility?.name, icon: b.facility?.icon, start: b.start, end: b.end, status: b.status })),
    unreadNotifications: unread,
    openPolls,
    paymentsAvailable: payments.available,
  });
}

// ======================= Complaints =======================
const presentComplaint = (c) => ({ ...c, media: presentMedia(c.media), category: c.category ? { _id: c.category._id, name: c.category.name, icon: c.category.icon } : null });

async function complaintCategories(req, res) {
  res.json({ items: await categoriesFor('complaint', req.societyId) });
}

async function createComplaint(req, res) {
  const { categoryId, title, description, priority, media } = req.valid.body;
  const category = await ServiceCategory.findOne({ _id: categoryId, kind: 'complaint', active: true, $or: [{ society: null }, { society: req.societyId }] }).lean();
  if (!category) throw badRequest('Choose a valid complaint category');
  const mediaIds = await claimMedia(media, { owner: req.user._id, purpose: 'complaint' });
  const seq = await nextSequence(`complaint:${req.societyId}`);
  const complaint = await Complaint.create({
    society: req.societyId,
    ticketNumber: `CMP-${String(seq).padStart(5, '0')}`,
    raisedBy: req.user._id,
    membership: req.membership._id,
    flat: req.membership.flat,
    category: category._id,
    title,
    description,
    priority,
    media: mediaIds,
    timeline: [{ status: 'pending', note: 'Complaint submitted', by: req.user._id, byRole: 'resident' }],
  });
  alertStaff(req.societyId, { type: 'complaint', title: `New complaint ${complaint.ticketNumber}`, body: `${category.name}: ${title}`, route: 'complaints', id: complaint._id });
  res.status(201).json(complaint);
}

async function myComplaints(req, res) {
  const filter = { society: req.societyId, raisedBy: req.user._id };
  if (req.valid.query.status) filter.status = req.valid.query.status;
  const page = await pagedFind(Complaint, filter, req.valid.query, { populate: [{ path: 'category', select: 'name icon' }], select: '-timeline' });
  res.json({ ...page, items: page.items.map((c) => ({ ...c, category: c.category ? { _id: c.category._id, name: c.category.name, icon: c.category.icon } : null, media: undefined })) });
}

async function ownComplaint(req) {
  const c = await Complaint.findOne({ _id: req.valid.params.id, society: req.societyId, raisedBy: req.user._id });
  if (!c) throw notFound('Complaint');
  return c;
}

async function getComplaint(req, res) {
  const c = await Complaint.findOne({ _id: req.valid.params.id, society: req.societyId, raisedBy: req.user._id })
    .populate('category', 'name icon')
    .populate('media')
    .populate('currentAssignment', 'assigneeName assigneeType createdAt')
    .populate('timeline.by', 'name')
    .lean();
  if (!c) throw notFound('Complaint');
  res.json(presentComplaint(c));
}

async function commentOnComplaint(req, res) {
  const c = await ownComplaint(req);
  if (['closed', 'rejected'].includes(c.status)) throw badRequest('This complaint is closed');
  c.timeline.push({ status: c.status, note: req.valid.body.note, by: req.user._id, byRole: 'resident' });
  await c.save();
  alertStaff(req.societyId, { type: 'complaint', title: `Update on ${c.ticketNumber}`, body: req.valid.body.note.slice(0, 120), route: 'complaints', id: c._id }, ['admin', 'manager']);
  res.json({ ok: true });
}

async function residentComplaintAction(req, res) {
  const c = await ownComplaint(req);
  const { action, note } = req.valid.body;
  if (c.status !== 'resolved') throw badRequest('Only resolved complaints can be closed or reopened');
  c.status = action === 'close' ? 'closed' : 'in_progress';
  if (action === 'close') c.closedAt = new Date();
  c.timeline.push({ status: c.status, note: note || (action === 'close' ? 'Closed by resident' : 'Reopened by resident'), by: req.user._id, byRole: 'resident' });
  await c.save();
  res.json({ _id: c._id, status: c.status });
}

// ======================= Announcements =======================
async function listAnnouncements(req, res) {
  const filter = { $or: [{ society: req.societyId }, { scope: 'platform' }], status: 'published' };
  if (req.valid.query.q) filter.title = new RegExp(escapeRegex(req.valid.query.q), 'i');
  res.json(await pagedFind(Announcement, filter, req.valid.query, { select: '-attachments', populate: { path: 'createdBy', select: 'name' } }));
}

async function getAnnouncement(req, res) {
  const a = await Announcement.findOne({ _id: req.valid.params.id, $or: [{ society: req.societyId }, { scope: 'platform' }], status: 'published' }).populate('attachments').populate('createdBy', 'name').lean();
  if (!a) throw notFound('Notice');
  res.json({ ...a, attachments: presentMedia(a.attachments) });
}

// ======================= Community =======================
function presentPost(p, userId) {
  return {
    _id: p._id,
    body: p.body,
    official: p.official,
    media: presentMedia(p.media),
    author: p.author ? { _id: p.author._id, name: p.author.name || 'Resident' } : null,
    likeCount: p.likeCount,
    commentCount: p.commentCount,
    likedByMe: (p.likes || []).some((id) => String(id) === String(userId)),
    mine: String(p.author?._id) === String(userId),
    createdAt: p.createdAt,
  };
}

async function feed(req, res) {
  const page = await pagedFind(CommunityPost, { society: req.societyId, status: 'published' }, req.valid.query, { populate: [{ path: 'author', select: 'name' }, { path: 'media' }] });
  res.json({ ...page, items: page.items.map((p) => presentPost(p, req.user._id)) });
}

async function createPost(req, res) {
  const media = await claimMedia(req.valid.body.media, { owner: req.user._id, purpose: 'post' });
  const post = await CommunityPost.create({ society: req.societyId, author: req.user._id, body: req.valid.body.body, media });
  await post.populate([{ path: 'author', select: 'name' }, { path: 'media' }]);
  res.status(201).json(presentPost(post.toObject(), req.user._id));
}

async function visiblePost(req) {
  const post = await CommunityPost.findOne({ _id: req.valid.params.id, society: req.societyId, status: 'published' });
  if (!post) throw notFound('Post');
  return post;
}

async function getPost(req, res) {
  const post = await CommunityPost.findOne({ _id: req.valid.params.id, society: req.societyId, status: 'published' }).populate('author', 'name').populate('media').lean();
  if (!post) throw notFound('Post');
  const comments = await Comment.find({ post: post._id, status: 'published' }).sort({ createdAt: 1 }).limit(200).populate('author', 'name').lean();
  res.json({ ...presentPost(post, req.user._id), comments: comments.map((c) => ({ _id: c._id, body: c.body, author: { _id: c.author?._id, name: c.author?.name || 'Resident' }, mine: String(c.author?._id) === String(req.user._id), createdAt: c.createdAt })) });
}

async function toggleLike(req, res) {
  const post = await visiblePost(req);
  const liked = post.likes.some((id) => String(id) === String(req.user._id));
  const updated = await CommunityPost.findOneAndUpdate(
    { _id: post._id, likes: liked ? req.user._id : { $ne: req.user._id } },
    liked ? { $pull: { likes: req.user._id }, $inc: { likeCount: -1 } } : { $addToSet: { likes: req.user._id }, $inc: { likeCount: 1 } },
    { returnDocument: 'after' },
  );
  const doc = updated || (await CommunityPost.findById(post._id));
  res.json({ likeCount: doc.likeCount, likedByMe: doc.likes.some((id) => String(id) === String(req.user._id)) });
}

async function addComment(req, res) {
  const post = await visiblePost(req);
  const comment = await Comment.create({ society: req.societyId, post: post._id, author: req.user._id, body: req.valid.body.body });
  await CommunityPost.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
  if (String(post.author) !== String(req.user._id)) {
    notifyUsers([post.author], { society: req.societyId, type: 'community', title: `${req.user.name || 'A neighbour'} commented on your post`, body: comment.body.slice(0, 120), route: 'PostDetail', id: post._id }).catch(() => {});
  }
  res.status(201).json({ _id: comment._id, body: comment.body, author: { _id: req.user._id, name: req.user.name }, mine: true, createdAt: comment.createdAt });
}

async function deleteOwnPost(req, res) {
  const post = await CommunityPost.findOne({ _id: req.valid.params.id, society: req.societyId, author: req.user._id });
  if (!post) throw notFound('Post');
  post.status = 'removed';
  post.moderationNote = 'Deleted by author';
  await post.save();
  res.json({ ok: true });
}

const reportPostOrComment = (targetType) => async (req, res) => {
  const Model = targetType === 'post' ? CommunityPost : Comment;
  const target = await Model.findOne({ _id: req.valid.params.id, society: req.societyId, status: 'published' });
  if (!target) throw notFound(targetType === 'post' ? 'Post' : 'Comment');
  try {
    await ContentReport.create({ society: req.societyId, targetType, targetId: target._id, reporter: req.user._id, reason: req.valid.body.reason });
  } catch (err) {
    if (err.code === 11000) throw conflict('You have already reported this');
    throw err;
  }
  if (targetType === 'post') await CommunityPost.updateOne({ _id: target._id }, { $inc: { reportCount: 1 } });
  alertStaff(req.societyId, { type: 'community', title: 'Content reported', body: req.valid.body.reason.slice(0, 120), route: 'moderation' }, ['admin', 'secretary']);
  res.status(201).json({ ok: true, message: 'Thanks — the society moderators will review it.' });
};

// ======================= Polls =======================
async function listPolls(req, res) {
  const polls = await Poll.find({ society: req.societyId, status: { $in: ['open', 'closed'] } }).sort({ createdAt: -1 }).limit(30).lean();
  const votes = await PollVote.find({ user: req.user._id, poll: { $in: polls.map((p) => p._id) } }).lean();
  const mine = Object.fromEntries(votes.map((v) => [String(v.poll), String(v.option)]));
  const now = new Date();
  res.json({
    items: polls.map((p) => {
      const open = p.status === 'open' && (!p.closesAt || p.closesAt > now);
      const voted = !!mine[String(p._id)];
      return {
        _id: p._id,
        question: p.question,
        closesAt: p.closesAt,
        open,
        myVote: mine[String(p._id)] || null,
        totalVotes: voted || !open ? p.totalVotes : undefined,
        // Results are revealed after voting or once the poll closes.
        options: p.options.map((o) => ({ _id: o._id, label: o.label, votes: voted || !open ? o.votes : undefined })),
        createdAt: p.createdAt,
      };
    }),
  });
}

async function votePoll(req, res) {
  const { optionId } = req.valid.body;
  await mongoose.connection.transaction(async (session) => {
    const poll = await Poll.findOne({ _id: req.valid.params.id, society: req.societyId }).session(session);
    if (!poll) throw notFound('Poll');
    if (poll.status !== 'open' || (poll.closesAt && poll.closesAt < new Date())) throw badRequest('This poll is closed');
    if (!poll.options.some((o) => String(o._id) === optionId)) throw badRequest('Invalid option');
    try {
      await PollVote.create([{ poll: poll._id, society: req.societyId, user: req.user._id, option: optionId }], { session });
    } catch (err) {
      if (err.code === 11000) throw conflict('You have already voted in this poll', 'ALREADY_VOTED');
      throw err;
    }
    await Poll.updateOne({ _id: poll._id, 'options._id': optionId }, { $inc: { 'options.$.votes': 1, totalVotes: 1 } }, { session });
  });
  const poll = await Poll.findById(req.valid.params.id).lean();
  res.json({ _id: poll._id, myVote: optionId, totalVotes: poll.totalVotes, options: poll.options });
}

// ======================= Services =======================
async function serviceCategories(req, res) {
  res.json({ items: await categoriesFor('service', req.societyId) });
}

async function createServiceRequest(req, res) {
  const { categoryId, description, preferredDate, preferredTime } = req.valid.body;
  const category = await ServiceCategory.findOne({ _id: categoryId, kind: 'service', active: true, $or: [{ society: null }, { society: req.societyId }] }).lean();
  if (!category) throw badRequest('Choose a valid service');
  const sr = await ServiceRequest.create({ society: req.societyId, user: req.user._id, membership: req.membership._id, flat: req.membership.flat, category: category._id, description, preferredDate, preferredTime, timeline: [{ status: 'requested', by: req.user._id }] });
  alertStaff(req.societyId, { type: 'service', title: `New ${category.name} request`, body: description.slice(0, 120), route: 'services', id: sr._id }, ['admin', 'manager']);
  res.status(201).json(sr);
}

async function myServiceRequests(req, res) {
  res.json(await pagedFind(ServiceRequest, { society: req.societyId, user: req.user._id }, req.valid.query, { populate: { path: 'category', select: 'name icon' } }));
}

async function cancelServiceRequest(req, res) {
  const sr = await ServiceRequest.findOne({ _id: req.valid.params.id, society: req.societyId, user: req.user._id });
  if (!sr) throw notFound('Service request');
  if (!['requested', 'accepted', 'scheduled'].includes(sr.status)) throw badRequest('This request can no longer be cancelled');
  sr.status = 'cancelled';
  sr.timeline.push({ status: 'cancelled', note: 'Cancelled by resident', by: req.user._id });
  await sr.save();
  res.json({ _id: sr._id, status: sr.status });
}

// ======================= Facilities =======================
async function listFacilities(req, res) {
  res.json({ items: await Facility.find({ society: req.societyId, active: true }).select('-bookingVersion').sort({ name: 1 }).lean() });
}

async function facilityAvailability(req, res) {
  const facility = await Facility.findOne({ _id: req.valid.params.id, society: req.societyId, active: true }).lean();
  if (!facility) throw notFound('Facility');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : istDay();
  res.json({ facility: { _id: facility._id, name: facility.name, feePaise: facility.feePaise, slotMinutes: facility.slotMinutes, requiresApproval: facility.requiresApproval, rules: facility.rules, maxAdvanceDays: facility.maxAdvanceDays }, date, slots: await availability(facility, date) });
}

async function bookFacility(req, res) {
  const booking = await createBooking({ societyId: req.societyId, membership: req.membership, user: req.user, ...req.valid.body });
  if (booking.status === 'pending') {
    alertStaff(req.societyId, { type: 'booking', title: 'Booking awaiting approval', body: `${req.user.name || 'A resident'} requested a booking on ${booking.date}.`, route: 'bookings', id: booking._id });
  }
  res.status(201).json(booking);
}

async function myBookings(req, res) {
  res.json(await pagedFind(FacilityBooking, { society: req.societyId, user: req.user._id }, { ...req.valid.query, sort: req.valid.query.sort || '-start' }, { sortable: ['start', 'createdAt'], populate: { path: 'facility', select: 'name icon' } }));
}

async function cancelBooking(req, res) {
  const b = await FacilityBooking.findOneAndUpdate(
    { _id: req.valid.params.id, society: req.societyId, user: req.user._id, status: { $in: ['pending', 'confirmed'] }, start: { $gt: new Date() } },
    { status: 'cancelled', cancelledAt: new Date() },
    { returnDocument: 'after' },
  );
  if (!b) throw badRequest('This booking cannot be cancelled');
  res.json({ _id: b._id, status: b.status });
}

// ======================= Invoices & payments =======================
async function myInvoices(req, res) {
  const filter = { society: req.societyId, flat: req.membership.flat, active: true };
  if (req.valid.query.status === 'open') filter.status = { $in: ['unpaid', 'partially_paid'] };
  else if (req.valid.query.status) filter.status = req.valid.query.status;
  const page = await pagedFind(MaintenanceInvoice, filter, { ...req.valid.query, sort: req.valid.query.sort || '-period' }, { sortable: ['period', 'dueDate', 'createdAt'], defaultSort: '-period' });
  const dues = await flatOutstanding(req.membership.flat);
  res.json({ ...page, items: page.items.map((i) => ({ ...i, balancePaise: i.totalPaise - i.paidPaise, overdue: ['unpaid', 'partially_paid'].includes(i.status) && new Date(i.dueDate) < new Date() })), dues });
}

async function getInvoice(req, res) {
  const inv = await MaintenanceInvoice.findOne({ _id: req.valid.params.id, society: req.societyId, flat: req.membership.flat }).populate('flat', 'number').populate('building', 'name').lean({ virtuals: true });
  if (!inv) throw notFound('Invoice');
  const payments = await Payment.find({ invoice: inv._id, status: { $in: ['captured', 'partially_refunded', 'refunded', 'reversed'] } }).select('amountPaise method channel status paidOn receipt providerPaymentId').lean();
  const society = await Society.findById(req.societyId).select('name payments').lean();
  res.json({ ...inv, balancePaise: inv.status === 'cancelled' ? 0 : inv.totalPaise - inv.paidPaise, overdue: ['unpaid', 'partially_paid'].includes(inv.status) && inv.dueDate < new Date(), payments, onlinePayment: paymentAvailability(society) });
}

async function startPayment(req, res) {
  res.status(201).json(await initiateOnlinePayment({ user: req.user, membership: req.membership, invoiceId: req.valid.params.id }));
}

async function confirmPayment(req, res) {
  const { orderId, paymentId, signature } = req.valid.body;
  const payment = await confirmCheckout({ user: req.user, orderId, providerPaymentId: paymentId, signature });
  res.json({ _id: payment._id, status: payment.status, receipt: payment.receipt, amountPaise: payment.amountPaise });
}

async function paymentStatus(req, res) {
  const p = await Payment.findOne({ _id: req.valid.params.id, society: req.societyId, flat: req.membership.flat }).select('status amountPaise receipt invoice failureReason paidOn').lean();
  if (!p) throw notFound('Payment');
  res.json(p);
}

async function myPayments(req, res) {
  const filter = { society: req.societyId, flat: req.membership.flat, status: { $in: ['captured', 'partially_refunded', 'refunded', 'reversed', 'failed'] } };
  res.json(await pagedFind(Payment, filter, req.valid.query, { select: 'amountPaise refundedPaise status channel method providerPaymentId paidOn createdAt receipt invoice', populate: [{ path: 'receipt', select: 'receiptNumber' }, { path: 'invoice', select: 'invoiceNumber period' }] }));
}

async function ownReceipt(req) {
  const r = await Receipt.findOne({ _id: req.valid.params.id, society: req.societyId, flat: req.membership.flat }).populate('invoice', 'invoiceNumber period').lean();
  if (!r) throw notFound('Receipt');
  return r;
}

async function getReceipt(req, res) {
  const r = await ownReceipt(req);
  const payment = await Payment.findById(r.payment).select('status providerPaymentId channel method refundedPaise').lean();
  const society = await Society.findById(req.societyId).select('name addressLine area city pincode').lean();
  const flat = await Flat.findById(r.flat).populate('building', 'name').select('number building').lean();
  res.json({ ...r, payment, society, flat: { number: flat?.number, building: flat?.building?.name } });
}

async function receiptPdf(req, res) {
  const r = await ownReceipt(req);
  const [society, flat, payment] = await Promise.all([Society.findById(req.societyId).lean(), Flat.findById(r.flat).populate('building', 'name').lean(), Payment.findById(r.payment).lean()]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${r.receiptNumber.replace(/[^\w-]/g, '_')}.pdf"`);
  receiptToPdf({ receipt: r, society, invoice: r.invoice, flat, payment }).pipe(res);
}

// ======================= Notifications =======================
async function listNotifications(req, res) {
  const page = await pagedFind(Notification, { user: req.user._id }, req.valid.query, { select: '-pushStatus' });
  res.json({ ...page, unread: await Notification.countDocuments({ user: req.user._id, readAt: null }) });
}

async function markNotificationRead(req, res) {
  await Notification.updateOne({ _id: req.valid.params.id, user: req.user._id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true });
}

async function markAllRead(req, res) {
  const r = await Notification.updateMany({ user: req.user._id, readAt: null }, { readAt: new Date() });
  res.json({ ok: true, updated: r.modifiedCount });
}

function readBearer(req) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/** Verifies the access token AND that its session is still live and the user is not disabled. */
async function authenticate(req, _res, next) {
  const token = readBearer(req);
  if (!token) throw unauthorized();
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'addaapp', clockTolerance: 30 });
  } catch (err) {
    throw unauthorized(err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token', err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID');
  }
  if (payload.typ !== 'access' || !isObjectId(payload.sid) || !isObjectId(payload.sub)) throw unauthorized('Invalid access token', 'TOKEN_INVALID');
  const [session, user] = await Promise.all([UserSession.findById(payload.sid).lean(), User.findById(payload.sub)]);
  if (!session || session.revokedAt || session.expiresAt < new Date() || String(session.user) !== payload.sub) {
    throw unauthorized('Session has ended. Please sign in again.', 'SESSION_INVALID');
  }
  if (!user || user.status === 'disabled') throw unauthorized('This account has been disabled.', 'ACCOUNT_DISABLED');
  req.user = user;
  req.session = session;
  req.client = session.client;
  next();
}

async function optionalAuth(req, res, next) {
  if (!readBearer(req)) return next();
  return authenticate(req, res, next);
}

function requireSuperAdmin(req, _res, next) {
  if (req.user?.platformRole !== 'super_admin' || req.client !== 'panel') throw forbidden('Super admin access required');
  req.actorRole = 'super_admin';
  next();
}

/**
 * Resolves the resident's society context from an APPROVED membership owned by the caller.
 * The X-Society-Id header only selects among the caller's own memberships; it never grants access.
 */
async function requireMembership(req, _res, next) {
  const requested = req.get('x-society-id');
  const filter = { user: req.user._id, status: 'approved' };
  if (requested) {
    if (!isObjectId(requested)) throw forbidden('Invalid society context', 'MEMBERSHIP_REQUIRED');
    filter.society = requested;
  }
  const memberships = await SocietyMembership.find(filter).sort({ decidedAt: -1 }).limit(2).populate('society', 'name status code city').lean();
  if (!memberships.length) {
    const pending = await SocietyMembership.exists({ user: req.user._id, status: 'pending' });
    throw forbidden(pending ? 'Your membership is awaiting approval by the society.' : 'Join a society to use this feature.', pending ? 'MEMBERSHIP_PENDING' : 'MEMBERSHIP_REQUIRED');
  }
  const membership = memberships[0];
  if (membership.society?.status !== 'active') throw forbidden('This society is currently suspended.', 'SOCIETY_SUSPENDED');
  req.membership = membership;
  req.societyId = membership.society._id;
  req.actorRole = 'resident';
  next();
}

const STAFF_PERMISSIONS = {
  admin: ['*'],
  secretary: ['society.read', 'members', 'members.read', 'community', 'complaints', 'facilities', 'services', 'announcements', 'listings', 'reports', 'finance.read', 'audit'],
  treasurer: ['society.read', 'finance', 'finance.read', 'reports', 'members.read', 'audit'],
  manager: ['society.read', 'complaints', 'facilities', 'services', 'community', 'members.read', 'listings'],
  committee: ['society.read', 'members.read', 'announcements', 'finance.read', 'reports'],
};

const hasPermission = (role, perm) => {
  const perms = STAFF_PERMISSIONS[role] || [];
  return perms.includes('*') || perms.includes(perm) || (perm.endsWith('.read') && perms.includes(perm.replace(/\.read$/, '')));
};

/** Society Admin / staff guard. Society context comes from the caller's own active staff assignment. */
function requireStaff(permission = 'society.read') {
  return async (req, _res, next) => {
    // Platform owner acting on a society: context was set (and authorised) by loadPlatformSociety.
    if (req.platformSociety === true && req.user?.platformRole === 'super_admin') return next();
    if (req.client !== 'panel') throw forbidden('Use the SocialPanel to access management features');
    const requested = req.get('x-society-id');
    const filter = { user: req.user._id, status: 'active' };
    if (requested) {
      if (!isObjectId(requested)) throw forbidden('Invalid society context');
      filter.society = requested;
    }
    const staff = await SocietyStaff.find(filter).limit(2).lean();
    if (!staff.length) throw forbidden('You are not a manager of this society');
    if (staff.length > 1 && !requested) throw forbidden('Select a society first (X-Society-Id)', 'SOCIETY_CONTEXT_REQUIRED');
    const assignment = staff[0];
    const society = await Society.findById(assignment.society).lean();
    if (!society) throw forbidden('Society not found');
    if (society.status !== 'active' && !permission.endsWith('.read') && permission !== 'society.read') {
      throw forbidden('This society is suspended. Contact the platform administrator.', 'SOCIETY_SUSPENDED');
    }
    if (!hasPermission(assignment.role, permission)) throw forbidden(`Your role (${assignment.role}) cannot perform this action`);
    req.staff = assignment;
    req.society = society;
    req.societyId = society._id;
    req.actorRole = `society_${assignment.role}`;
    next();
  };
}

/** Validate body/query/params with zod. Parsed values land on req.valid.{body,query,params}. */
const validate = (schemas) => (req, _res, next) => {
  req.valid = req.valid || {};
  for (const key of ['params', 'query', 'body']) {
    if (schemas[key]) req.valid[key] = schemas[key].parse(req[key] ?? {});
  }
  next();
};

const limiter = (windowMs, limit, message, keyGenerator) =>
  rateLimit({
    windowMs,
    limit: env.isTest ? 10_000 : limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator,
    handler: (_req, res) => res.status(429).json({ error: { code: 'TOO_MANY_REQUESTS', message } }),
  });

const globalLimiter = limiter(60_000, 300, 'Too many requests. Slow down and try again.');
const otpLimiter = limiter(15 * 60_000, 8, 'Too many verification requests. Try again later.');
const loginLimiter = limiter(15 * 60_000, env.LOGIN_RATE_LIMIT, 'Too many sign-in attempts. Try again later.');
// Token refresh is routine background traffic — keep it off the sign-in allowance.
const refreshLimiter = limiter(15 * 60_000, 600, 'Too many session refreshes. Try again later.');
const publicFormLimiter = limiter(60 * 60_000, env.PUBLIC_FORM_RATE_LIMIT, 'Too many submissions from this network. Try again later.');
/**
 * /uploads can be rejected before the file is read (expired token → 401, rate limit → 429, too large → 400).
 * If we answer and close while a phone is still sending a multi-MB photo, Android reports a broken connection
 * ("Network request failed") instead of our error, so the app can't refresh the session and retry. Read and
 * discard the rest of the body first (bounded in size and time), then send the response.
 */
const DRAIN_MAX_BYTES = 12 * 1024 * 1024;
function drainUnreadBody(req, res, next) {
  const end = res.end.bind(res);
  res.end = (...args) => {
    if (req.complete || req.readableEnded || req.destroyed) return end(...args);
    let done = false;
    let seen = 0;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      end(...args);
    };
    const timer = setTimeout(finish, 15_000);
    req.on('data', (chunk) => {
      seen += chunk.length;
      if (seen > DRAIN_MAX_BYTES) {
        finish();
        req.destroy();
      }
    });
    req.on('end', finish);
    req.on('error', finish);
    req.resume();
    return res;
  };
  next();
}

const uploadLimiter = limiter(60 * 60_000, 120, 'Upload limit reached. Try again later.', (req) => (req.user ? String(req.user._id) : ipKeyGenerator(req.ip)));

function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let status = 500;
  let body = { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' };

  if (err instanceof AppError) {
    status = err.status;
    body = { code: err.code, message: err.message, details: err.details };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      code: 'VALIDATION_ERROR',
      message: err.issues[0] ? `${err.issues[0].path.join('.') || 'input'}: ${err.issues[0].message}` : 'Invalid input',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    body = { code: 'VALIDATION_ERROR', message: Object.values(err.errors)[0]?.message || 'Invalid input' };
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    body = { code: 'BAD_REQUEST', message: `Invalid ${err.path}` };
  } else if (err?.code === 11000) {
    status = 409;
    body = { code: 'DUPLICATE', message: 'A record with these details already exists.', details: { fields: Object.keys(err.keyPattern || {}) } };
  } else if (err instanceof multer.MulterError) {
    status = 400;
    body = { code: 'UPLOAD_REJECTED', message: err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${env.MAX_UPLOAD_MB} MB)` : err.message };
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    body = { code: 'BAD_JSON', message: 'Malformed JSON body' };
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    body = { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' };
  }

  if (status >= 500 && !(err instanceof AppError)) logger.error({ err: { message: err.message, stack: err.stack }, path: req.path, method: req.method }, 'Unhandled error');
  else if (status >= 500) logger.warn({ code: body.code, path: req.path }, 'Service unavailable');
  else logger.debug({ code: body.code, path: req.path }, 'Request rejected');
  res.status(status).json({ error: body });
}

const objectId = z.string().refine(isObjectId, 'Invalid id');
/** Update (PATCH) schema: every field optional and WITHOUT create-time defaults, so an update only touches the fields the client sent. */const patchOf = (schema) => z.object(Object.fromEntries(Object.entries(schema.shape).map(([k, v]) => [k, (v instanceof z.ZodDefault ? v.removeDefault() : v).optional()])));
const idParam = z.object({ id: objectId });
const phone = z.string().transform((v, ctx) => {
  const n = normalizePhone(v);
  if (!n) ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)' });
  return n;
});
/** Organisation contact number: a mobile OR a landline with STD code (10 digits, e.g. 3322345678); +91 / leading 0 allowed. */
const contactPhone = z.string().transform((v, ctx) => {
  const digits = String(v || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  if (!/^[2-9]\d{9}$/.test(digits)) ctx.addIssue({ code: 'custom', message: 'Enter a 10-digit phone number: a mobile number, or a landline with its STD code (e.g. 033 2234 5678)' });
  return digits;
});
const text = (max, min = 1) => z.string().trim().min(min).max(max);
const optText = (max) => z.string().trim().max(max).optional().or(z.literal('').transform(() => undefined));
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(200);
const paise = z.number().int('Amount must be in whole paise').min(0).max(10_000_000_00);
const positivePaise = paise.refine((v) => v > 0, 'Amount must be greater than zero');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const mediaIds = z.array(objectId).max(6).optional().default([]);
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().max(40).optional(),
  q: z.string().trim().max(100).optional(),
  status: z.string().max(40).optional(),
});

// ---------- auth ----------
const otpRequest = z.object({ phone });
const otpVerify = z.object({ phone, challengeId: objectId, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'), deviceName: optText(120) });
const refresh = z.object({ refreshToken: z.string().min(20).max(200) });
const adminLogin = z.object({ email, password: z.string().min(1).max(200) });
const changePasswordBody = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(10).max(200) });
const residentRegisterBody = z.object({ phone, name: text(120, 2), password: z.string().min(10).max(200), deviceName: optText(120) });
const residentLoginBody = z.object({ phone, password: z.string().min(1).max(200), deviceName: optText(120) });
const passwordSetup = z.object({ token: z.string().min(20).max(200), password: z.string().min(10).max(200) });
const passwordResetRequest = z.object({ email });
const updateMe = z.object({ name: text(120, 2).optional(), email: email.optional(), city: optText(80), settings: z.object({ pushEnabled: z.boolean() }).partial().optional() }).strict();
const pushToken = z.object({ token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[.+\]$/, 'Invalid Expo push token'), platform: z.enum(['android', 'ios', 'web']).default('android') });

// ---------- public ----------
const registration = z.object({
  societyName: text(160, 3),
  addressLine: text(300, 5),
  area: optText(120),
  city: text(80, 2),
  state: text(80, 2),
  pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  phone: contactPhone,
  email,
  totalUnits: z.number().int().min(1).max(100000).optional(),
  representative: z.object({ name: text(120, 2), designation: optText(80), phone, email }),
  documents: mediaIds,
  submit: z.boolean().default(true),
});
const registrationStatus = z.object({ referenceCode: z.string().trim().toUpperCase().min(6).max(30), accessKey: z.string().trim().min(8).max(100) });
const registrationActivate = registrationStatus.extend({ password: z.string().min(10).max(200) });
const registrationUpdate = patchOf(registration).extend({ referenceCode: z.string().trim().toUpperCase(), accessKey: z.string().min(8).max(100), submit: z.boolean().default(false) });
const societySearch = z.object({ q: z.string().trim().max(100).optional(), city: z.string().trim().max(80).optional(), page: z.coerce.number().int().min(1).optional() });

// ---------- membership ----------
const membershipRequest = z.object({ societyId: objectId, buildingId: objectId, flatNumber: z.string().trim().min(1).max(20), residentType: z.enum(['owner', 'tenant', 'family']), name: text(120, 2).optional(), note: optText(500) });
const decision = z.object({ reason: optText(500) });
const requiredReason = z.object({ reason: text(500, 3) });

// ---------- complaints / services ----------
const complaintCreate = z.object({ categoryId: objectId, title: text(140, 4), description: text(4000, 10), priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'), media: mediaIds });
const complaintComment = z.object({ note: text(2000, 2) });
const complaintResidentAction = z.object({ action: z.enum(['close', 'reopen']), note: optText(1000) });
const complaintStatus = z.object({ status: z.enum(['assigned', 'in_progress', 'resolved', 'closed', 'rejected']), note: optText(2000) });
const complaintAssign = z.object({ assigneeType: z.enum(['staff', 'vendor']), assigneeName: text(120, 2), assigneePhone: phone.optional(), note: optText(1000) });
const serviceRequestCreate = z.object({ categoryId: objectId, description: text(2000, 5), preferredDate: date.optional(), preferredTime: optText(40) });
const serviceRequestUpdate = z.object({ status: z.enum(['accepted', 'scheduled', 'completed', 'cancelled', 'rejected']), note: optText(500), scheduledFor: z.string().datetime({ offset: true }).optional(), assigneeName: optText(120) });

// ---------- community ----------
const postCreate = z.object({ body: text(4000, 2), media: mediaIds });
const commentCreate = z.object({ body: text(2000, 1) });
const reportCreate = z.object({ reason: text(500, 3) });
const pollCreate = z.object({ question: text(300, 5), options: z.array(text(120)).min(2).max(8), closesAt: z.string().datetime({ offset: true }).optional() });
const pollVote = z.object({ optionId: objectId });
const announcementCreate = z.object({ title: text(160, 3), body: text(8000, 5), category: z.enum(['general', 'maintenance', 'meeting', 'event', 'finance', 'security', 'emergency']).default('general'), important: z.boolean().default(false), eventDate: z.string().datetime({ offset: true }).optional(), attachments: mediaIds });
const moderation = z.object({ action: z.enum(['hide', 'remove', 'restore']), note: optText(500) });

// ---------- listings ----------
const listingContact = { contactName: optText(120), contactPhone: phone, whatsappAvailable: z.boolean().default(true) };
const propertyCreate = z.object({
  listingType: z.enum(['sale', 'rent']),
  propertyType: z.enum(['apartment', 'house', 'plot', 'commercial', 'room']),
  title: text(140, 5),
  description: optText(5000),
  pricePaise: positivePaise,
  areaSqft: z.number().min(0).max(10_000_000).optional(),
  bedrooms: z.number().int().min(0).max(50).optional(),
  bathrooms: z.number().int().min(0).max(50).optional(),
  furnishing: z.enum(['unfurnished', 'semi_furnished', 'furnished']).optional(),
  amenities: z.array(text(60)).max(20).optional(),
  locality: optText(120),
  city: text(80, 2),
  address: optText(300),
  photos: mediaIds,
  linkToMySociety: z.boolean().default(false),
  ...listingContact,
});
const propertyUpdate = patchOf(propertyCreate).extend({ availability: z.enum(['available', 'sold', 'rented', 'inactive']).optional() });
const propertyQuery = pageQuery.extend({
  listingType: z.enum(['sale', 'rent']).optional(),
  propertyType: z.enum(['apartment', 'house', 'plot', 'commercial', 'room']).optional(),
  city: z.string().trim().max(80).optional(),
  locality: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
});
const marketplaceCreate = z.object({
  categoryId: objectId,
  title: text(140, 3),
  description: optText(3000),
  pricePaise: paise,
  negotiable: z.boolean().default(false),
  condition: z.enum(['new', 'like_new', 'good', 'fair']).default('good'),
  locality: optText(120),
  city: optText(80),
  photos: mediaIds,
  visibility: z.enum(['public', 'society']).default('public'),
  ...listingContact,
});
const marketplaceUpdate = patchOf(marketplaceCreate).extend({ status: z.enum(['active', 'sold', 'inactive']).optional() });
const marketplaceQuery = pageQuery.extend({ categoryId: objectId.optional(), city: z.string().trim().max(80).optional(), minPrice: z.coerce.number().int().min(0).optional(), maxPrice: z.coerce.number().int().min(0).optional() });
const listingModeration = z.object({ decision: z.enum(['approved', 'rejected', 'removed']), note: optText(500) });
const OFFER_MAX_PAISE = 10_00_000_00; // ₹10,00,000
const offerFields = {
  categoryId: objectId,
  title: text(140, 5),
  description: optText(3000),
  priceType: z.enum(OFFER_PRICE_TYPES),
  pricePaise: paise.max(OFFER_MAX_PAISE, 'Price is too high').optional().nullable(),
  experienceYears: z.number().int().min(0).max(60).optional().nullable(),
  serviceArea: optText(200),
  city: text(80, 2),
  availabilityNote: optText(120),
  photos: mediaIds,
  visibility: z.enum(['public', 'society']).default('public'),
  ...listingContact,
};
/** A price is required unless the provider quotes on request. */
const offerPriceRule = (v, ctx) => {
  if (v.priceType && v.priceType !== 'on_quote' && !(v.pricePaise > 0)) ctx.addIssue({ code: 'custom', path: ['pricePaise'], message: 'Enter a price, or choose "Price on request"' });
};
const offerCreate = z.object(offerFields).strict().superRefine(offerPriceRule);
const offerUpdate = patchOf(z.object(offerFields)).extend({ status: z.enum(['active', 'paused']).optional() }).strict();
const offerQuery = pageQuery.extend({ categoryId: objectId.optional(), city: z.string().trim().max(80).optional(), mySociety: z.enum(['true', 'false']).optional() });

// ---------- facilities ----------
const facilityUpsert = z.object({
  name: text(80, 2),
  description: optText(1000),
  icon: optText(60),
  feePaise: paise.default(0),
  capacity: z.number().int().min(0).max(100000).optional(),
  openTime: hhmm.default('06:00'),
  closeTime: hhmm.default('22:00'),
  slotMinutes: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120), z.literal(180), z.literal(240)]).default(60),
  maxAdvanceDays: z.number().int().min(1).max(365).default(30),
  requiresApproval: z.boolean().default(false),
  rules: optText(2000),
  active: z.boolean().default(true),
});
const bookingCreate = z.object({ facilityId: objectId, date, startTime: hhmm, endTime: hhmm.optional(), purpose: optText(300) });
const bookingDecision = z.object({ decision: z.enum(['confirmed', 'rejected']), reason: optText(300) });

// ---------- society setup ----------
const societyProfile = z.object({
  name: text(160, 3).optional(),
  addressLine: optText(300),
  area: optText(120),
  city: optText(80),
  state: optText(80),
  pincode: z.string().regex(/^\d{6}$/).optional(),
  phone: contactPhone.optional(),
  email: email.optional(),
  description: optText(2000),
  settings: z.object({ listingsRequireApproval: z.boolean(), bookingsRequireApproval: z.boolean() }).partial().optional(),
});
const billingSettings = z.object({
  defaultAmountPaise: paise.optional(),
  dueDayOfMonth: z.number().int().min(1).max(28).optional(),
  lateFeePaise: paise.optional(),
  autoGenerate: z.boolean().optional(),
  generateOnDay: z.number().int().min(1).max(28).optional(),
  invoicePrefix: z.string().trim().regex(/^[A-Z0-9-]{1,10}$/, 'Prefix: up to 10 capital letters, digits or dashes').optional(),
});
const openingBalance = z.object({ amountPaise: z.number().int(), asOf: date, account: z.enum(['bank', 'cash']).default('bank') });
const buildingUpsert = z.object({ name: text(80, 1), floors: z.number().int().min(0).max(200).default(0), description: optText(300), active: z.boolean().default(true) });
const flatUpsert = z.object({
  buildingId: objectId,
  number: z.string().trim().min(1).max(20),
  floor: z.number().int().min(-5).max(200).optional(),
  areaSqft: z.number().min(0).max(1_000_000).optional(),
  category: optText(40),
  maintenanceAmountPaise: paise.optional().nullable(),
  active: z.boolean().default(true),
});
const flatBulk = z.object({
  buildingId: objectId,
  fromFloor: z.number().int().min(-5).max(200),
  toFloor: z.number().int().min(-5).max(200),
  unitsPerFloor: z.number().int().min(1).max(50),
  pattern: z.enum(['{building}-{floor}{unit}', '{floor}{unit}', '{building}{floor}{unit}']).default('{building}-{floor}{unit}'),
  areaSqft: z.number().min(0).optional(),
  category: optText(40),
});
const staffInvite = z.object({ name: text(120, 2), email, phone: phone.optional(), role: z.enum(['admin', 'treasurer', 'secretary', 'manager', 'committee']), title: optText(80) });
const staffUpdate = z.object({ role: z.enum(['admin', 'treasurer', 'secretary', 'manager', 'committee']).optional(), status: z.enum(['active', 'disabled']).optional(), title: optText(80) });

// ---------- finance ----------
const chargeUpsert = z.object({ name: text(80, 2), calculation: z.enum(['fixed', 'per_sqft']).default('fixed'), amountPaise: paise, flatCategory: optText(40), active: z.boolean().default(true) });
const invoiceGenerate = z.object({ period, buildingId: objectId.optional(), dueDate: date.optional() });
const invoiceQuery = pageQuery.extend({ period: period.optional(), buildingId: objectId.optional(), flatId: objectId.optional(), overdue: z.enum(['true', 'false']).optional() });
const offlinePayment = z.object({ amountPaise: positivePaise, method: z.enum(['cash', 'bank_transfer', 'cheque', 'upi_direct']), paidOn: date.optional(), referenceNumber: optText(100), note: optText(500), idempotencyKey: z.string().max(80).optional() });
const refundRequest = z.object({ amountPaise: positivePaise.optional(), reason: text(300, 3) });
const expenseCreate = z.object({ category: text(60, 2), vendor: optText(120), description: optText(500), amountPaise: positivePaise, paidOn: date, account: z.enum(['bank', 'cash']).default('bank'), referenceNumber: optText(100), attachments: mediaIds });
const otherIncome = z.object({ category: text(60, 2), description: optText(500), amountPaise: positivePaise, receivedOn: date, account: z.enum(['bank', 'cash']).default('bank') });
const adjustment = z.object({ direction: z.enum(['credit', 'debit']), amountPaise: positivePaise, account: z.enum(['bank', 'cash', 'gateway']), category: text(60, 2), memo: text(500, 5), date: date.optional() });
const reportQuery = z.object({ format: z.enum(['json', 'pdf', 'xlsx']).default('json'), period: period.optional(), year: z.coerce.number().int().optional(), from: date.optional(), to: date.optional(), flatId: objectId.optional() });
const paymentConfirm = z.object({ orderId: z.string().min(5).max(60), paymentId: z.string().min(5).max(60), signature: z.string().min(10).max(200) });

// ---------- platform ----------
const categoryUpsert = z.object({ kind: z.enum(['complaint', 'service', 'marketplace']), name: text(80, 2), icon: optText(60), description: optText(300), active: z.boolean().default(true), sortOrder: z.number().int().min(0).max(1000).default(0) });
const societyPayments = z.object({ onlineEnabled: z.boolean(), settlementMode: z.enum(['none', 'razorpay_route', 'society_merchant']), linkedAccountId: z.string().trim().max(60).optional() });
const platformSetting$1 = z.object({ value: z.union([z.boolean(), z.number(), z.string().max(500)]) });
const adminCreate = z.object({ name: text(120, 2), email, phone: phone.optional(), role: z.enum(['admin', 'treasurer', 'secretary', 'manager', 'committee']).default('admin') });

/** Public, authentication, account and cross-role routes. */
const router = Router();

// ---- public ----
router.get('/public/config', config);
router.get('/public/categories', categories);
router.get('/public/societies', validate({ query: societySearch }), searchSocieties);
router.get('/public/societies/:id/buildings', validate({ params: idParam }), societyBuildings);
router.post('/public/society-registrations', publicFormLimiter, validate({ body: registration }), submitRegistration);
router.post('/public/society-registrations/status', publicFormLimiter, validate({ body: registrationStatus }), registrationStatus$1);
router.post('/public/society-registrations/activate', publicFormLimiter, validate({ body: registrationActivate }), activateRegistration);
router.patch('/public/society-registrations', publicFormLimiter, validate({ body: registrationUpdate }), updateRegistration);
router.post('/public/society-registrations/documents', drainUnreadBody, publicFormLimiter, uploadMiddleware, uploadRegistrationDocument);

// ---- auth ----
router.get('/auth/otp/status', otpStatus);
router.post('/auth/otp/request', otpLimiter, validate({ body: otpRequest }), requestOtp);
router.post('/auth/otp/verify', otpLimiter, validate({ body: otpVerify }), verifyOtp);
router.post('/auth/refresh', refreshLimiter, validate({ body: refresh }), refresh$1);
router.post('/auth/admin/login', loginLimiter, validate({ body: adminLogin }), adminLogin$1);
router.post('/auth/resident/register', loginLimiter, validate({ body: residentRegisterBody }), residentRegister);
router.post('/auth/resident/login', loginLimiter, validate({ body: residentLoginBody }), residentLogin);
router.post('/auth/password/setup', loginLimiter, validate({ body: passwordSetup }), completePasswordSetup);
router.post('/auth/password/reset-request', loginLimiter, validate({ body: passwordResetRequest }), requestPasswordReset);
router.post('/auth/logout', authenticate, logout);
router.post('/auth/logout-all', authenticate, logoutAll);

// ---- account (any signed-in user) ----
router.get('/me', authenticate, me);
router.patch('/me', authenticate, validate({ body: updateMe }), updateMe$1);
router.post('/me/password', authenticate, loginLimiter, validate({ body: changePasswordBody }), changeOwnPassword);
router.post('/push-tokens', authenticate, validate({ body: pushToken }), registerPushToken);
router.delete('/push-tokens', authenticate, validate({ body: pushToken }), removePushToken);
router.post('/uploads', drainUnreadBody, authenticate, uploadLimiter, uploadMiddleware, uploadMedia);

router.get('/notifications', authenticate, validate({ query: pageQuery }), listNotifications);
router.post('/notifications/read-all', authenticate, markAllRead);
router.post('/notifications/:id/read', authenticate, validate({ params: idParam }), markNotificationRead);

// ---- memberships (no approved membership needed) ----
router.get('/memberships', authenticate, myMemberships);
router.post('/memberships', authenticate, validate({ body: membershipRequest }), requestMembership);
router.post('/memberships/:id/cancel', authenticate, validate({ params: idParam }), cancelMembership);

async function platformSetting(key, fallback) {
  const s = await PlatformSetting.findOne({ key }).lean();
  return s ? s.value : fallback;
}

/** Listings tied to a society follow that society's rule; independent listings follow the platform rule. */
async function needsApproval(societyId) {
  if (societyId) {
    const s = await Society.findById(societyId).select('settings').lean();
    return s?.settings?.listingsRequireApproval !== false;
  }
  return (await platformSetting('listings.requireApproval', true)) !== false;
}

async function approvedSocietyOf(userId) {
  const m = await SocietyMembership.findOne({ user: userId, status: 'approved' }).select('society').lean();
  return m?.society || null;
}

async function alertModerators(societyId, title) {
  const staff = societyId ? await SocietyStaff.find({ society: societyId, status: 'active', role: { $in: ['admin', 'secretary', 'manager'] } }).select('user').lean() : [];
  if (staff.length) notifyUsers(staff.map((s) => s.user), { society: societyId, type: 'listing', title: 'Listing awaiting review', body: title, route: 'listings' }).catch(() => {});
}

const presentListing = (l, userId) => ({
  ...l,
  photos: presentMedia(l.photos),
  mine: String(l.owner?._id || l.owner || l.seller?._id || l.seller || l.provider?._id || l.provider) === String(userId),
  owner: undefined,
  seller: undefined,
  provider: undefined,
  postedBy: l.owner?.name || l.seller?.name || l.provider?.name || undefined,
  society: l.society?.name ? { _id: l.society._id, name: l.society.name } : l.society,
  reportCount: undefined,
});

// ======================= Property =======================
async function browseProperties(req, res) {
  const q = req.valid.query;
  const filter = { moderationStatus: 'approved', availability: 'available' };
  if (q.listingType) filter.listingType = q.listingType;
  if (q.propertyType) filter.propertyType = q.propertyType;
  if (q.city) filter.city = new RegExp(`^${escapeRegex(q.city)}`, 'i');
  if (q.locality) filter.locality = new RegExp(escapeRegex(q.locality), 'i');
  if (q.bedrooms !== undefined) filter.bedrooms = { $gte: q.bedrooms };
  if (q.minPrice !== undefined || q.maxPrice !== undefined) filter.pricePaise = { ...(q.minPrice !== undefined && { $gte: q.minPrice }), ...(q.maxPrice !== undefined && { $lte: q.maxPrice }) };
  if (q.q) filter.$or = [{ title: new RegExp(escapeRegex(q.q), 'i') }, { locality: new RegExp(escapeRegex(q.q), 'i') }, { city: new RegExp(escapeRegex(q.q), 'i') }];
  const page = await pagedFind(PropertyListing, filter, q, { sortable: ['createdAt', 'pricePaise'], populate: [{ path: 'photos' }, { path: 'society', select: 'name' }, { path: 'owner', select: 'name' }] });
  res.json({ ...page, items: page.items.map((l) => presentListing(l, req.user._id)) });
}

async function myProperties(req, res) {
  const page = await pagedFind(PropertyListing, { owner: req.user._id, moderationStatus: { $ne: 'removed' } }, req.valid.query, { populate: [{ path: 'photos' }, { path: 'society', select: 'name' }] });
  res.json({ ...page, items: page.items.map((l) => ({ ...presentListing(l, req.user._id), mine: true })) });
}

async function getProperty(req, res) {
  const l = await PropertyListing.findById(req.valid.params.id).populate('photos').populate('society', 'name city').populate('owner', 'name').lean();
  const mine = l && String(l.owner?._id) === String(req.user._id);
  if (!l || (!mine && (l.moderationStatus !== 'approved' || l.availability === 'inactive'))) throw notFound('Listing');
  res.json(presentListing(l, req.user._id));
}

async function createProperty(req, res) {
  const { linkToMySociety, photos, ...data } = req.valid.body;
  const society = linkToMySociety ? await approvedSocietyOf(req.user._id) : null;
  if (linkToMySociety && !society) throw badRequest('You need an approved society membership to link this listing to your society');
  const photoIds = await claimMedia(photos, { owner: req.user._id, purpose: 'property', max: 10 });
  const approval = await needsApproval(society);
  const listing = await PropertyListing.create({ ...data, photos: photoIds, owner: req.user._id, society, contactName: data.contactName || req.user.name, moderationStatus: approval ? 'pending' : 'approved' });
  if (approval) alertModerators(society, data.title);
  res.status(201).json(listing);
}

async function updateProperty(req, res) {
  const listing = await PropertyListing.findOne({ _id: req.valid.params.id, owner: req.user._id, moderationStatus: { $ne: 'removed' } });
  if (!listing) throw notFound('Listing');
  const { photos, linkToMySociety, ...data } = req.valid.body;
  const contentChanged = Object.keys(data).some((k) => !['availability'].includes(k)) || photos;
  Object.assign(listing, data);
  if (photos) listing.photos = await claimMedia(photos, { owner: req.user._id, purpose: 'property', max: 10 });
  // Edited content goes back to review when moderation applies.
  if (contentChanged && (await needsApproval(listing.society))) listing.moderationStatus = 'pending';
  await listing.save();
  res.json(listing);
}

async function deleteProperty(req, res) {
  const r = await PropertyListing.updateOne({ _id: req.valid.params.id, owner: req.user._id }, { moderationStatus: 'removed', availability: 'inactive', moderationNote: 'Deleted by owner' });
  if (!r.matchedCount) throw notFound('Listing');
  res.json({ ok: true });
}

// ======================= Marketplace =======================
async function marketplaceCategories(_req, res) {
  res.json({ items: await ServiceCategory.find({ kind: 'marketplace', society: null, active: true }).sort({ sortOrder: 1, name: 1 }).select('name icon').lean() });
}

async function browseMarketplace(req, res) {
  const q = req.valid.query;
  const mySociety = await approvedSocietyOf(req.user._id);
  const filter = { moderationStatus: 'approved', status: 'active', $or: [{ visibility: 'public' }, ...(mySociety ? [{ visibility: 'society', society: mySociety }] : [])] };
  if (q.categoryId) filter.category = q.categoryId;
  if (q.city) filter.city = new RegExp(`^${escapeRegex(q.city)}`, 'i');
  if (q.minPrice !== undefined || q.maxPrice !== undefined) filter.pricePaise = { ...(q.minPrice !== undefined && { $gte: q.minPrice }), ...(q.maxPrice !== undefined && { $lte: q.maxPrice }) };
  if (q.q) filter.title = new RegExp(escapeRegex(q.q), 'i');
  const page = await pagedFind(MarketplaceListing, filter, q, { sortable: ['createdAt', 'pricePaise'], populate: [{ path: 'photos' }, { path: 'category', select: 'name icon' }, { path: 'seller', select: 'name' }, { path: 'society', select: 'name' }] });
  res.json({ ...page, items: page.items.map((l) => presentListing(l, req.user._id)) });
}

async function myMarketplace(req, res) {
  const page = await pagedFind(MarketplaceListing, { seller: req.user._id, moderationStatus: { $ne: 'removed' } }, req.valid.query, { populate: [{ path: 'photos' }, { path: 'category', select: 'name icon' }] });
  res.json({ ...page, items: page.items.map((l) => ({ ...presentListing(l, req.user._id), mine: true })) });
}

async function getMarketplaceItem(req, res) {
  const l = await MarketplaceListing.findById(req.valid.params.id).populate('photos').populate('category', 'name icon').populate('seller', 'name').populate('society', 'name').lean();
  const mine = l && String(l.seller?._id) === String(req.user._id);
  if (!l) throw notFound('Listing');
  if (!mine) {
    if (l.moderationStatus !== 'approved' || l.status === 'inactive') throw notFound('Listing');
    if (l.visibility === 'society' && String(await approvedSocietyOf(req.user._id)) !== String(l.society?._id)) throw notFound('Listing');
  }
  res.json(presentListing(l, req.user._id));
}

async function createMarketplaceItem(req, res) {
  const { categoryId, photos, visibility, ...data } = req.valid.body;
  const category = await ServiceCategory.findOne({ _id: categoryId, kind: 'marketplace', active: true }).lean();
  if (!category) throw badRequest('Choose a valid category');
  const society = await approvedSocietyOf(req.user._id);
  if (visibility === 'society' && !society) throw badRequest('Society-only listings need an approved membership');
  const photoIds = await claimMedia(photos, { owner: req.user._id, purpose: 'marketplace', max: 6 });
  const approval = await needsApproval(society);
  const listing = await MarketplaceListing.create({ ...data, category: category._id, visibility, photos: photoIds, seller: req.user._id, society, contactName: data.contactName || req.user.name, moderationStatus: approval ? 'pending' : 'approved' });
  if (approval) alertModerators(society, data.title);
  res.status(201).json(listing);
}

async function updateMarketplaceItem(req, res) {
  const listing = await MarketplaceListing.findOne({ _id: req.valid.params.id, seller: req.user._id, moderationStatus: { $ne: 'removed' } });
  if (!listing) throw notFound('Listing');
  const { categoryId, photos, ...data } = req.valid.body;
  if (categoryId) {
    const category = await ServiceCategory.findOne({ _id: categoryId, kind: 'marketplace', active: true }).lean();
    if (!category) throw badRequest('Choose a valid category');
    listing.category = category._id;
  }
  const contentChanged = Object.keys(data).some((k) => k !== 'status') || photos || categoryId;
  Object.assign(listing, data);
  if (photos) listing.photos = await claimMedia(photos, { owner: req.user._id, purpose: 'marketplace', max: 6 });
  if (contentChanged && (await needsApproval(listing.society))) listing.moderationStatus = 'pending';
  await listing.save();
  res.json(listing);
}

async function deleteMarketplaceItem(req, res) {
  const r = await MarketplaceListing.updateOne({ _id: req.valid.params.id, seller: req.user._id }, { moderationStatus: 'removed', status: 'inactive', moderationNote: 'Deleted by seller' });
  if (!r.matchedCount) throw notFound('Listing');
  res.json({ ok: true });
}

// ======================= Service offers =======================
/** Max live (not removed) offers per person — keeps the directory useful and limits spam. */
const OFFER_LIMIT = 10;
const offerPopulate = [{ path: 'photos' }, { path: 'category', select: 'name icon' }, { path: 'provider', select: 'name' }, { path: 'society', select: 'name' }];

/** Platform service categories, plus the provider's own society categories when they are an approved member. */
async function offerCategory(categoryId, society) {
  const c = await ServiceCategory.findOne({ _id: categoryId, kind: 'service', active: true, $or: [{ society: null }, ...(society ? [{ society }] : [])] }).lean();
  if (!c) throw badRequest('Choose a valid service category');
  return c;
}

async function offerCategories(req, res) {
  res.json({ items: await categoriesFor('service', await approvedSocietyOf(req.user._id)) });
}

async function browseOffers(req, res) {
  const q = req.valid.query;
  const mySociety = await approvedSocietyOf(req.user._id);
  if (q.mySociety === 'true' && !mySociety) return res.json({ items: [], page: 1, limit: q.limit || 20, total: 0, pages: 0 });
  const and = [{ $or: [{ visibility: 'public' }, ...(mySociety ? [{ visibility: 'society', society: mySociety }] : [])] }];
  const filter = { moderationStatus: 'approved', status: 'active', $and: and };
  if (q.mySociety === 'true') filter.society = mySociety;
  if (q.categoryId) filter.category = q.categoryId;
  if (q.city) filter.city = new RegExp(`^${escapeRegex(q.city)}`, 'i');
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    and.push({ $or: [{ title: rx }, { serviceArea: rx }, { description: rx }] });
  }
  const page = await pagedFind(ServiceOffer, filter, q, { sortable: ['createdAt', 'pricePaise'], populate: offerPopulate });
  res.json({ ...page, items: page.items.map((l) => presentListing(l, req.user._id)) });
}

async function myOffers(req, res) {
  const page = await pagedFind(ServiceOffer, { provider: req.user._id, moderationStatus: { $ne: 'removed' } }, req.valid.query, { populate: offerPopulate });
  res.json({ ...page, items: page.items.map((l) => ({ ...presentListing(l, req.user._id), mine: true })) });
}

async function getOffer(req, res) {
  const l = await ServiceOffer.findById(req.valid.params.id).populate(offerPopulate).lean();
  if (!l) throw notFound('Service');
  const mine = String(l.provider?._id) === String(req.user._id);
  if (!mine) {
    if (l.moderationStatus !== 'approved' || l.status !== 'active') throw notFound('Service');
    if (l.visibility === 'society' && String(await approvedSocietyOf(req.user._id)) !== String(l.society?._id)) throw notFound('Service');
  }
  if (mine && l.moderationStatus === 'removed') throw notFound('Service');
  res.json(presentListing(l, req.user._id));
}

async function createOffer(req, res) {
  const { categoryId, photos, visibility, ...data } = req.valid.body;
  const society = await approvedSocietyOf(req.user._id);
  if (visibility === 'society' && !society) throw badRequest('Society-only services need an approved society membership');
  const live = await ServiceOffer.countDocuments({ provider: req.user._id, moderationStatus: { $ne: 'removed' } });
  if (live >= OFFER_LIMIT) throw new AppError(409, 'OFFER_LIMIT', `You can have up to ${OFFER_LIMIT} services listed. Delete one you no longer offer first.`);
  const category = await offerCategory(categoryId, society);
  const photoIds = await claimMedia(photos, { owner: req.user._id, purpose: 'service', max: 6 });
  const approval = await needsApproval(society);
  const offer = await ServiceOffer.create({
    ...data,
    pricePaise: data.priceType === 'on_quote' ? undefined : data.pricePaise,
    category: category._id,
    visibility,
    photos: photoIds,
    provider: req.user._id,
    society,
    contactName: data.contactName || req.user.name,
    moderationStatus: approval ? 'pending' : 'approved',
  });
  if (approval) alertModerators(society, `Service: ${data.title}`);
  res.status(201).json(offer);
}

async function updateOffer(req, res) {
  const offer = await ServiceOffer.findOne({ _id: req.valid.params.id, provider: req.user._id, moderationStatus: { $ne: 'removed' } });
  if (!offer) throw notFound('Service');
  const { categoryId, photos, ...data } = req.valid.body;
  if (categoryId) offer.category = (await offerCategory(categoryId, offer.society))._id;
  if (data.visibility === 'society' && !offer.society) throw badRequest('Society-only services need an approved society membership');
  // Validate the price against the resulting document, not just the patch.
  const priceType = data.priceType ?? offer.priceType;
  const pricePaise = data.pricePaise !== undefined ? data.pricePaise : offer.pricePaise;
  if (priceType !== 'on_quote' && !(pricePaise > 0)) throw badRequest('Enter a price, or choose "Price on request"');
  const contentChanged = Object.keys(data).some((k) => k !== 'status') || photos || categoryId;
  Object.assign(offer, data);
  if (priceType === 'on_quote') offer.pricePaise = undefined;
  if (photos) offer.photos = await claimMedia(photos, { owner: req.user._id, purpose: 'service', max: 6 });
  if (contentChanged && (await needsApproval(offer.society))) offer.moderationStatus = 'pending';
  await offer.save();
  res.json(offer);
}

async function deleteOffer(req, res) {
  const r = await ServiceOffer.updateOne({ _id: req.valid.params.id, provider: req.user._id, moderationStatus: { $ne: 'removed' } }, { moderationStatus: 'removed', status: 'paused', moderationNote: 'Deleted by provider' });
  if (!r.matchedCount) throw notFound('Service');
  res.json({ ok: true });
}

/** kind → model / owner field, shared by reporting and moderation. */
const LISTING_MODELS = { property: PropertyListing, marketplace: MarketplaceListing, service: ServiceOffer };
const LISTING_OWNER = { property: 'owner', marketplace: 'seller', service: 'provider' };
const LISTING_ROUTE = { property: 'MyProperties', marketplace: 'MyMarketplace', service: 'MyServices' };
const listingKind = (k) => (LISTING_MODELS[k] ? k : 'property');
const pendingListingCount = (filter) => Promise.all(Object.values(LISTING_MODELS).map((M) => M.countDocuments({ ...filter, moderationStatus: 'pending' }))).then((n) => n.reduce((a, b) => a + b, 0));

const reportListing = (kind) => async (req, res) => {
  const Model = LISTING_MODELS[kind];
  const l = await Model.findOne({ _id: req.valid.params.id, moderationStatus: 'approved' }).lean();
  if (!l) throw notFound('Listing');
  try {
    await ContentReport.create({ society: l.society, targetType: kind, targetId: l._id, reporter: req.user._id, reason: req.valid.body.reason });
  } catch (err) {
    if (err.code === 11000) throw conflict('You have already reported this listing');
    throw err;
  }
  await Model.updateOne({ _id: l._id }, { $inc: { reportCount: 1 } });
  res.status(201).json({ ok: true, message: 'Thanks — moderators will review this listing.' });
};

const id$1 = validate({ params: idParam });
const page$1 = validate({ query: pageQuery });

/** Resident features that require an APPROVED society membership. */
const residentRouter = Router();
residentRouter.use(authenticate, requireMembership);

residentRouter.get('/home', home);

residentRouter.get('/complaint-categories', complaintCategories);
residentRouter.get('/complaints', page$1, myComplaints);
residentRouter.post('/complaints', validate({ body: complaintCreate }), createComplaint);
residentRouter.get('/complaints/:id', id$1, getComplaint);
residentRouter.post('/complaints/:id/comments', id$1, validate({ body: complaintComment }), commentOnComplaint);
residentRouter.post('/complaints/:id/action', id$1, validate({ body: complaintResidentAction }), residentComplaintAction);

residentRouter.get('/announcements', page$1, listAnnouncements);
residentRouter.get('/announcements/:id', id$1, getAnnouncement);

residentRouter.get('/posts', page$1, feed);
residentRouter.post('/posts', validate({ body: postCreate }), createPost);
residentRouter.get('/posts/:id', id$1, getPost);
residentRouter.delete('/posts/:id', id$1, deleteOwnPost);
residentRouter.post('/posts/:id/like', id$1, toggleLike);
residentRouter.post('/posts/:id/comments', id$1, validate({ body: commentCreate }), addComment);
residentRouter.post('/posts/:id/report', id$1, validate({ body: reportCreate }), reportPostOrComment('post'));
residentRouter.post('/comments/:id/report', id$1, validate({ body: reportCreate }), reportPostOrComment('comment'));

residentRouter.get('/polls', listPolls);
residentRouter.post('/polls/:id/vote', id$1, validate({ body: pollVote }), votePoll);

residentRouter.get('/service-categories', serviceCategories);
residentRouter.get('/service-requests', page$1, myServiceRequests);
residentRouter.post('/service-requests', validate({ body: serviceRequestCreate }), createServiceRequest);
residentRouter.post('/service-requests/:id/cancel', id$1, cancelServiceRequest);

residentRouter.get('/facilities', listFacilities);
residentRouter.get('/facilities/:id/availability', id$1, facilityAvailability);
residentRouter.get('/bookings', page$1, myBookings);
residentRouter.post('/bookings', validate({ body: bookingCreate }), bookFacility);
residentRouter.post('/bookings/:id/cancel', id$1, cancelBooking);

residentRouter.get('/invoices', page$1, myInvoices);
residentRouter.get('/invoices/:id', id$1, getInvoice);
residentRouter.post('/invoices/:id/pay', id$1, startPayment);
residentRouter.post('/payments/confirm', validate({ body: paymentConfirm }), confirmPayment);
residentRouter.get('/payments', page$1, myPayments);
residentRouter.get('/payments/:id', id$1, paymentStatus);
residentRouter.get('/receipts/:id', id$1, getReceipt);
residentRouter.get('/receipts/:id/pdf', id$1, receiptPdf);

/** Marketplace & property: any signed-in (phone-verified) user; no society membership required. */
const listingsRouter = Router();
listingsRouter.use(['/properties', '/marketplace', '/service-offers'], authenticate);

listingsRouter.get('/properties', validate({ query: propertyQuery }), browseProperties);
listingsRouter.get('/properties/mine', page$1, myProperties);
listingsRouter.post('/properties', validate({ body: propertyCreate }), createProperty);
listingsRouter.get('/properties/:id', id$1, getProperty);
listingsRouter.patch('/properties/:id', id$1, validate({ body: propertyUpdate }), updateProperty);
listingsRouter.delete('/properties/:id', id$1, deleteProperty);
listingsRouter.post('/properties/:id/report', id$1, validate({ body: reportCreate }), reportListing('property'));

listingsRouter.get('/marketplace/categories', marketplaceCategories);
listingsRouter.get('/marketplace', validate({ query: marketplaceQuery }), browseMarketplace);
listingsRouter.get('/marketplace/mine', page$1, myMarketplace);
listingsRouter.post('/marketplace', validate({ body: marketplaceCreate }), createMarketplaceItem);
listingsRouter.get('/marketplace/:id', id$1, getMarketplaceItem);
listingsRouter.patch('/marketplace/:id', id$1, validate({ body: marketplaceUpdate }), updateMarketplaceItem);
listingsRouter.delete('/marketplace/:id', id$1, deleteMarketplaceItem);
listingsRouter.post('/marketplace/:id/report', id$1, validate({ body: reportCreate }), reportListing('marketplace'));

listingsRouter.get('/service-offers/categories', offerCategories);
listingsRouter.get('/service-offers', validate({ query: offerQuery }), browseOffers);
listingsRouter.get('/service-offers/mine', page$1, myOffers);
listingsRouter.post('/service-offers', validate({ body: offerCreate }), createOffer);
listingsRouter.get('/service-offers/:id', id$1, getOffer);
listingsRouter.patch('/service-offers/:id', id$1, validate({ body: offerUpdate }), updateOffer);
listingsRouter.delete('/service-offers/:id', id$1, deleteOffer);
listingsRouter.post('/service-offers/:id/report', id$1, validate({ body: reportCreate }), reportListing('service'));

const sid$1 = (req) => req.societyId;

// ======================= Overview =======================
async function overview$1(req, res) {
  const s = sid$1(req);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [flats, buildings, residents, pendingMembers, complaintsByStatus, dues, collectedThisMonth, pendingBookings, openServiceRequests, pendingListings, openReports, balance, recentComplaints] = await Promise.all([
    Flat.countDocuments({ society: s, active: true }),
    Building.countDocuments({ society: s, active: true }),
    SocietyMembership.countDocuments({ society: s, status: 'approved' }),
    SocietyMembership.countDocuments({ society: s, status: 'pending' }),
    Complaint.aggregate([{ $match: { society: s } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    MaintenanceInvoice.aggregate([
      { $match: { society: s, active: true, status: { $in: ['unpaid', 'partially_paid'] } } },
      { $group: { _id: null, due: { $sum: { $subtract: ['$totalPaise', '$paidPaise'] } }, overdue: { $sum: { $cond: [{ $lt: ['$dueDate', now] }, { $subtract: ['$totalPaise', '$paidPaise'] }, 0] } }, n: { $sum: 1 } } },
    ]),
    ledgerTotals(s, { from: monthStart }),
    FacilityBooking.countDocuments({ society: s, status: 'pending' }),
    ServiceRequest.countDocuments({ society: s, status: { $in: ['requested', 'accepted', 'scheduled'] } }),
    pendingListingCount({ society: s }),
    ContentReport.countDocuments({ society: s, status: 'open' }),
    ledgerTotals(s),
    Complaint.find({ society: s }).sort({ createdAt: -1 }).limit(5).select('ticketNumber title status priority createdAt').lean(),
  ]);
  // Six-month billed vs collected trend, computed from real invoices.
  const periods = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const trendRows = await MaintenanceInvoice.aggregate([
    { $match: { society: s, active: true, period: { $in: periods } } },
    { $group: { _id: '$period', billed: { $sum: '$totalPaise' }, collected: { $sum: '$paidPaise' } } },
  ]);
  const trendMap = Object.fromEntries(trendRows.map((r) => [r._id, r]));
  res.json({
    society: pick(req.society, ['_id', 'name', 'code', 'city', 'status']),
    role: req.staff.role,
    counts: { flats, buildings, residents, pendingMembers, pendingBookings, openServiceRequests, pendingListings, openReports },
    complaints: Object.fromEntries(complaintsByStatus.map((c) => [c._id, c.n])),
    finance: {
      outstandingPaise: dues[0]?.due || 0,
      overduePaise: dues[0]?.overdue || 0,
      openInvoices: dues[0]?.n || 0,
      collectedThisMonthPaise: collectedThisMonth.byType.maintenance_collection || 0,
      balancePaise: balance.netPaise,
    },
    trend: periods.map((p) => ({ period: p, billedPaise: trendMap[p]?.billed || 0, collectedPaise: trendMap[p]?.collected || 0 })),
    recentComplaints,
  });
}

// ======================= Profile & settings =======================
async function getProfile(req, res) {
  const s = await Society.findById(sid$1(req)).lean();
  res.json(s);
}

async function updateProfile(req, res) {
  const { settings, ...data } = req.valid.body;
  const update = { ...data };
  if (settings) for (const [k, v] of Object.entries(settings)) update[`settings.${k}`] = v;
  const s = await Society.findByIdAndUpdate(sid$1(req), update, { returnDocument: 'after', runValidators: true }).lean();
  await audit(req, { action: 'society.profile_updated', targetType: 'Society', targetId: s._id, changes: req.valid.body });
  res.json(s);
}

async function updateBilling(req, res) {
  const update = Object.fromEntries(Object.entries(req.valid.body).map(([k, v]) => [`billing.${k}`, v]));
  const s = await Society.findByIdAndUpdate(sid$1(req), update, { returnDocument: 'after', runValidators: true }).lean();
  await audit(req, { action: 'society.billing_updated', targetType: 'Society', targetId: s._id, changes: req.valid.body });
  res.json(s.billing);
}

// ======================= Buildings & flats =======================
async function listBuildings(req, res) {
  const buildings = await Building.find({ society: sid$1(req) }).sort({ name: 1 }).lean();
  const counts = await Flat.aggregate([{ $match: { society: sid$1(req) } }, { $group: { _id: '$building', n: { $sum: 1 } } }]);
  const map = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  res.json({ items: buildings.map((b) => ({ ...b, flatCount: map[String(b._id)] || 0 })) });
}

async function createBuilding(req, res) {
  const b = await Building.create({ ...req.valid.body, society: sid$1(req) });
  await audit(req, { action: 'building.created', targetType: 'Building', targetId: b._id, summary: b.name });
  res.status(201).json(b);
}

async function updateBuilding(req, res) {
  const b = await Building.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req) }, req.valid.body, { returnDocument: 'after', runValidators: true });
  if (!b) throw notFound('Building');
  await audit(req, { action: 'building.updated', targetType: 'Building', targetId: b._id, changes: req.valid.body });
  res.json(b);
}

async function listFlats(req, res) {
  const q = req.valid.query;
  const filter = { society: sid$1(req) };
  if (req.query.buildingId && mongoose.isValidObjectId(req.query.buildingId)) filter.building = req.query.buildingId;
  if (q.q) filter.number = new RegExp(escapeRegex(q.q.toUpperCase()));
  const page = await pagedFind(Flat, filter, { ...q, sort: q.sort || 'number', limit: q.limit || 50 }, { sortable: ['number', 'floor', 'createdAt'], defaultSort: 'number', populate: { path: 'building', select: 'name' } });
  const residents = await SocietyMembership.find({ society: sid$1(req), flat: { $in: page.items.map((f) => f._id) }, status: 'approved' }).populate('user', 'name phone').lean();
  const byFlat = {};
  for (const m of residents) (byFlat[String(m.flat)] ||= []).push({ _id: m.user?._id, name: m.user?.name, phone: m.user?.phone, residentType: m.residentType });
  res.json({ ...page, items: page.items.map((f) => ({ ...f, residents: byFlat[String(f._id)] || [] })) });
}

async function ownBuilding(req, buildingId) {
  const b = await Building.findOne({ _id: buildingId, society: sid$1(req) }).lean();
  if (!b) throw badRequest('Unknown building');
  return b;
}

async function createFlat(req, res) {
  const { buildingId, ...data } = req.valid.body;
  await ownBuilding(req, buildingId);
  const f = await Flat.create({ ...data, maintenanceAmountPaise: data.maintenanceAmountPaise ?? undefined, building: buildingId, society: sid$1(req) });
  await audit(req, { action: 'flat.created', targetType: 'Flat', targetId: f._id, summary: f.number });
  res.status(201).json(f);
}

async function updateFlat(req, res) {
  const { buildingId, ...data } = req.valid.body;
  if (buildingId) await ownBuilding(req, buildingId);
  const update = { ...data, ...(buildingId && { building: buildingId }) };
  const unset = data.maintenanceAmountPaise === null ? { $unset: { maintenanceAmountPaise: 1 } } : {};
  if (data.maintenanceAmountPaise === null) delete update.maintenanceAmountPaise;
  const f = await Flat.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req) }, { $set: update, ...unset }, { returnDocument: 'after', runValidators: true });
  if (!f) throw notFound('Flat');
  await audit(req, { action: 'flat.updated', targetType: 'Flat', targetId: f._id, changes: req.valid.body });
  res.json(f);
}

async function bulkCreateFlats(req, res) {
  const { buildingId, fromFloor, toFloor, unitsPerFloor, pattern, areaSqft, category } = req.valid.body;
  if (toFloor < fromFloor) throw badRequest('toFloor must be ≥ fromFloor');
  if ((toFloor - fromFloor + 1) * unitsPerFloor > 2000) throw badRequest('At most 2000 flats per batch');
  const b = await ownBuilding(req, buildingId);
  const prefix = b.name.replace(/^(block|tower|wing)\s*/i, '').replace(/\s+/g, '').toUpperCase().slice(0, 6);
  const docs = [];
  for (let floor = fromFloor; floor <= toFloor; floor += 1) {
    for (let u = 1; u <= unitsPerFloor; u += 1) {
      const unit = String(u).padStart(2, '0');
      const fl = floor === 0 ? 'G' : String(floor);
      const number = pattern.replace('{building}', prefix).replace('{floor}', fl).replace('{unit}', unit);
      docs.push({ society: sid$1(req), building: b._id, number, floor, areaSqft, category });
    }
  }
  let created = 0;
  try {
    const r = await Flat.insertMany(docs, { ordered: false });
    created = r.length;
  } catch (err) {
    created = err.insertedDocs?.length ?? err.result?.insertedCount ?? 0;
    if (err.code !== 11000 && !err.writeErrors) throw err;
  }
  await audit(req, { action: 'flat.bulk_created', targetType: 'Building', targetId: b._id, summary: `${created} flats created` });
  res.status(201).json({ requested: docs.length, created, skippedExisting: docs.length - created });
}

// ======================= Memberships =======================
async function listMemberships(req, res) {
  const q = req.valid.query;
  const filter = { society: sid$1(req), status: q.status || 'pending' };
  if (q.q) {
    // Search before paginating so totals stay correct.
    const rx = new RegExp(escapeRegex(q.q), 'i');
    const [users, flats] = await Promise.all([
      User.find({ $or: [{ name: rx }, { phone: rx }] }).select('_id').limit(500).lean(),
      Flat.find({ society: sid$1(req), number: rx }).select('_id').lean(),
    ]);
    filter.$or = [{ user: { $in: users.map((u) => u._id) } }, { flat: { $in: flats.map((f) => f._id) } }];
  }
  res.json(
    await pagedFind(SocietyMembership, filter, q, {
      populate: [{ path: 'user', select: 'name phone email' }, { path: 'building', select: 'name' }, { path: 'flat', select: 'number floor' }],
    }),
  );
}

async function ownMembership(req) {
  const m = await SocietyMembership.findOne({ _id: req.valid.params.id, society: sid$1(req) }).populate('flat', 'number').populate('building', 'name');
  if (!m) throw notFound('Membership');
  return m;
}

const decideMembership = (action) => async (req, res) => {
  const m = await ownMembership(req);
  const reason = req.valid.body?.reason;
  const allowed = { approve: ['pending', 'suspended'], reject: ['pending'], suspend: ['approved'], remove: ['approved', 'suspended'] }[action];
  if (!allowed.includes(m.status)) throw badRequest(`Cannot ${action} a ${m.status} membership`);
  if (['reject', 'suspend', 'remove'].includes(action) && !reason) throw badRequest('Please provide a reason');
  const previous = m.status;
  m.status = { approve: 'approved', reject: 'rejected', suspend: 'suspended', remove: 'cancelled' }[action];
  m.live = ['approved', 'suspended', 'pending'].includes(m.status);
  m.decisionReason = reason;
  m.decidedBy = req.user._id;
  m.decidedAt = new Date();
  await m.save();
  if (action === 'approve' && previous === 'pending') {
    await PropertyOccupancy.create({ society: sid$1(req), flat: m.flat._id, user: m.user, membership: m._id, kind: m.residentType });
    await Flat.updateOne({ _id: m.flat._id, occupancy: 'vacant' }, { occupancy: m.residentType === 'tenant' ? 'rented' : 'owner_occupied' });
  }
  if (action === 'remove') await PropertyOccupancy.updateMany({ membership: m._id, active: true }, { active: false, endDate: new Date() });
  await audit(req, { action: `membership.${action}`, targetType: 'SocietyMembership', targetId: m._id, summary: `${m.building?.name} ${m.flat?.number}: ${previous} → ${m.status}${reason ? ` (${reason})` : ''}` });
  const titles = { approve: 'Membership approved 🎉', reject: 'Membership request declined', suspend: 'Membership suspended', remove: 'Membership ended' };
  notifyUsers([m.user], { society: sid$1(req), type: 'membership', title: titles[action], body: action === 'approve' ? `Welcome to ${req.society.name}! You now have full access.` : reason, route: 'Home' }).catch(() => {});
  res.json({ _id: m._id, status: m.status });
};

// ======================= Staff =======================
async function listStaff(req, res) {
  const items = await SocietyStaff.find({ society: sid$1(req) }).populate('user', 'name email phone status lastLoginAt').sort({ createdAt: 1 }).lean();
  res.json({ items });
}

async function inviteStaff(req, res) {
  const { name, email, phone, role, title } = req.valid.body;
  let user = await User.findOne({ email });
  if (user?.platformRole === 'super_admin') throw badRequest('Platform administrators cannot be added as society staff');
  if (!user) user = await User.create({ name, email, phone: phone || undefined, status: 'pending_setup' });
  const exists = await SocietyStaff.findOne({ society: sid$1(req), user: user._id });
  if (exists) throw conflict('This person is already on the staff list');
  const staff = await SocietyStaff.create({ society: sid$1(req), user: user._id, role, title, addedBy: req.user._id });
  let link;
  let emailed = false;
  if (user.status === 'pending_setup') {
    const token = await issuePasswordSetupToken(user);
    link = setupLink(token);
    emailed = await sendMail({ to: email, subject: `You've been added to ${req.society.name} on AddaApp`, text: `Set your password within 72 hours:\n\n${link}` });
  }
  await audit(req, { action: 'staff.invited', targetType: 'SocietyStaff', targetId: staff._id, summary: `${email} as ${role}` });
  res.status(201).json({ staff, setupLink: link, emailed, emailConfigured: mailConfigured() });
}

async function updateStaff(req, res) {
  const staff = await SocietyStaff.findOne({ _id: req.valid.params.id, society: sid$1(req) });
  if (!staff) throw notFound('Staff member');
  if (String(staff.user) === String(req.user._id) && (req.valid.body.role && req.valid.body.role !== 'admin' || req.valid.body.status === 'disabled')) {
    throw forbidden('You cannot demote or disable your own admin access');
  }
  const before = { role: staff.role, status: staff.status };
  Object.assign(staff, req.valid.body);
  if (before.role === 'admin' && (staff.role !== 'admin' || staff.status !== 'active')) {
    const otherAdmins = await SocietyStaff.countDocuments({ society: sid$1(req), role: 'admin', status: 'active', _id: { $ne: staff._id } });
    if (!otherAdmins) throw badRequest('A society must keep at least one active admin');
  }
  await staff.save();
  await audit(req, { action: 'staff.updated', targetType: 'SocietyStaff', targetId: staff._id, changes: { before, after: req.valid.body } });
  res.json(staff);
}

async function resendStaffSetup(req, res) {
  const staff = await SocietyStaff.findOne({ _id: req.valid.params.id, society: sid$1(req) }).populate('user');
  if (!staff) throw notFound('Staff member');
  if (staff.user.status !== 'pending_setup') throw badRequest('This person has already set a password');
  const link = setupLink(await issuePasswordSetupToken(staff.user));
  const emailed = await sendMail({ to: staff.user.email, subject: 'Your AddaApp access link', text: link });
  await audit(req, { action: 'staff.setup_link_issued', targetType: 'SocietyStaff', targetId: staff._id });
  res.json({ setupLink: link, emailed });
}

// ======================= Complaints =======================
async function listComplaints(req, res) {
  const q = req.valid.query;
  const filter = { society: sid$1(req) };
  if (q.status) filter.status = q.status;
  if (req.query.categoryId && mongoose.isValidObjectId(req.query.categoryId)) filter.category = req.query.categoryId;
  if (req.query.priority) filter.priority = String(req.query.priority);
  if (q.q) filter.$or = [{ title: new RegExp(escapeRegex(q.q), 'i') }, { ticketNumber: new RegExp(escapeRegex(q.q), 'i') }];
  res.json(await pagedFind(Complaint, filter, q, { sortable: ['createdAt', 'updatedAt', 'priority'], select: '-timeline', populate: [{ path: 'category', select: 'name' }, { path: 'raisedBy', select: 'name phone' }, { path: 'flat', select: 'number' }, { path: 'currentAssignment', select: 'assigneeName assigneeType' }] }));
}

async function getComplaintAdmin(req, res) {
  const c = await Complaint.findOne({ _id: req.valid.params.id, society: sid$1(req) })
    .populate('category', 'name')
    .populate('raisedBy', 'name phone')
    .populate({ path: 'flat', select: 'number building', populate: { path: 'building', select: 'name' } })
    .populate('media')
    .populate('timeline.by', 'name')
    .lean();
  if (!c) throw notFound('Complaint');
  const assignments = await ComplaintAssignment.find({ complaint: c._id }).sort({ createdAt: -1 }).populate('assignedBy', 'name').lean();
  res.json({ ...c, media: presentMedia(c.media), assignments });
}

async function assignComplaint(req, res) {
  const c = await Complaint.findOne({ _id: req.valid.params.id, society: sid$1(req) });
  if (!c) throw notFound('Complaint');
  if (['closed', 'rejected'].includes(c.status)) throw badRequest('This complaint is closed');
  await ComplaintAssignment.updateMany({ complaint: c._id, active: true }, { active: false });
  const a = await ComplaintAssignment.create({ ...req.valid.body, society: sid$1(req), complaint: c._id, assignedBy: req.user._id });
  c.currentAssignment = a._id;
  // Assigning a new complaint moves it to "assigned"; reassigning keeps the current status.
  if (c.status === 'pending') c.status = 'assigned';
  c.timeline.push({ status: c.status, note: `Assigned to ${a.assigneeName} (${a.assigneeType})${a.note ? ` — ${a.note}` : ''}`, by: req.user._id, byRole: 'staff' });
  await c.save();
  await audit(req, { action: 'complaint.assigned', targetType: 'Complaint', targetId: c._id, summary: `${c.ticketNumber} → ${a.assigneeName}` });
  notifyUsers([c.raisedBy], { society: sid$1(req), type: 'complaint', title: `${c.ticketNumber} assigned`, body: `Your complaint has been assigned to ${a.assigneeName}.`, route: 'ComplaintDetail', id: c._id }).catch(() => {});
  res.json({ _id: c._id, status: c.status, assignment: a });
}

async function updateComplaintStatus(req, res) {
  const c = await Complaint.findOne({ _id: req.valid.params.id, society: sid$1(req) });
  if (!c) throw notFound('Complaint');
  const { status, note } = req.valid.body;
  if (!COMPLAINT_TRANSITIONS[c.status].includes(status)) throw badRequest(`Cannot change status from ${c.status} to ${status}`);
  if (status === 'rejected' && !note) throw badRequest('Add a note explaining the rejection');
  const previous = c.status;
  c.status = status;
  if (status === 'resolved') c.resolvedAt = new Date();
  if (status === 'closed') c.closedAt = new Date();
  c.timeline.push({ status, note, by: req.user._id, byRole: 'staff' });
  await c.save();
  await audit(req, { action: 'complaint.status_changed', targetType: 'Complaint', targetId: c._id, summary: `${c.ticketNumber}: ${previous} → ${status}` });
  notifyUsers([c.raisedBy], { society: sid$1(req), type: 'complaint', title: `${c.ticketNumber} is now ${status.replace('_', ' ')}`, body: note || c.title, route: 'ComplaintDetail', id: c._id }).catch(() => {});
  res.json({ _id: c._id, status: c.status });
}

async function addComplaintRemark(req, res) {
  const c = await Complaint.findOne({ _id: req.valid.params.id, society: sid$1(req) });
  if (!c) throw notFound('Complaint');
  c.timeline.push({ status: c.status, note: req.valid.body.note, by: req.user._id, byRole: 'staff' });
  await c.save();
  notifyUsers([c.raisedBy], { society: sid$1(req), type: 'complaint', title: `Update on ${c.ticketNumber}`, body: req.valid.body.note.slice(0, 140), route: 'ComplaintDetail', id: c._id }).catch(() => {});
  res.json({ ok: true });
}

// ======================= Categories (society-specific) =======================
async function listSocietyCategories(req, res) {
  const kind = ['complaint', 'service'].includes(req.query.kind) ? req.query.kind : 'complaint';
  const items = await ServiceCategory.find({ kind, $or: [{ society: null }, { society: sid$1(req) }] }).sort({ society: 1, sortOrder: 1, name: 1 }).lean();
  res.json({ items: items.map((c) => ({ ...c, scope: c.society ? 'society' : 'platform' })) });
}

async function createSocietyCategory(req, res) {
  if (req.valid.body.kind === 'marketplace') throw badRequest('Marketplace categories are managed by the platform');
  const c = await ServiceCategory.create({ ...req.valid.body, society: sid$1(req) });
  await audit(req, { action: 'category.created', targetType: 'ServiceCategory', targetId: c._id, summary: c.name });
  res.status(201).json(c);
}

async function updateSocietyCategory(req, res) {
  const c = await ServiceCategory.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req) }, req.valid.body, { returnDocument: 'after', runValidators: true });
  if (!c) throw notFound('Category (only society categories can be edited here)');
  res.json(c);
}

// ======================= Announcements =======================
async function listAnnouncementsAdmin(req, res) {
  res.json(await pagedFind(Announcement, { society: sid$1(req), ...(req.valid.query.status && { status: req.valid.query.status }) }, req.valid.query, { populate: { path: 'createdBy', select: 'name' } }));
}

async function createAnnouncement(req, res) {
  const attachments = await claimMedia(req.valid.body.attachments, { owner: req.user._id, purpose: 'announcement' });
  const a = await Announcement.create({ ...req.valid.body, attachments, scope: 'society', society: sid$1(req), createdBy: req.user._id });
  await audit(req, { action: 'announcement.published', targetType: 'Announcement', targetId: a._id, summary: a.title });
  notifySocietyResidents(sid$1(req), { type: 'announcement', title: a.important ? `Important: ${a.title}` : a.title, body: a.body.slice(0, 140), route: 'NoticeDetail', id: a._id }).catch(() => {});
  res.status(201).json(a);
}

async function updateAnnouncement(req, res) {
  const body = { ...req.valid.body };
  if (body.attachments) {
    // Files already on this notice (possibly uploaded by another staff member) are kept; only new ones must be the caller's uploads.
    const current = await Announcement.findOne({ _id: req.valid.params.id, society: sid$1(req) }).select('attachments').lean();
    if (!current) throw notFound('Announcement');
    const existing = new Set((current.attachments || []).map(String));
    const keep = body.attachments.filter((x) => existing.has(String(x)));
    const added = await claimMedia(body.attachments.filter((x) => !existing.has(String(x))), { owner: req.user._id, purpose: 'announcement' });
    body.attachments = [...keep, ...added];
  }
  const a = await Announcement.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req) }, body, { returnDocument: 'after', runValidators: true });
  if (!a) throw notFound('Announcement');
  await audit(req, { action: 'announcement.updated', targetType: 'Announcement', targetId: a._id });
  res.json(a);
}

async function archiveAnnouncement(req, res) {
  const a = await Announcement.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req) }, { status: 'archived' }, { returnDocument: 'after' });
  if (!a) throw notFound('Announcement');
  await audit(req, { action: 'announcement.archived', targetType: 'Announcement', targetId: a._id });
  res.json(a);
}

// ======================= Community moderation & polls =======================
async function listPostsAdmin(req, res) {
  const q = req.valid.query;
  const filter = { society: sid$1(req), ...(q.status ? { status: q.status } : { status: { $ne: 'removed' } }) };
  if (req.query.reported === 'true') filter.reportCount = { $gt: 0 };
  const page = await pagedFind(CommunityPost, filter, q, { sortable: ['createdAt', 'reportCount'], select: '-likes', populate: [{ path: 'author', select: 'name phone' }, { path: 'media' }] });
  res.json({ ...page, items: page.items.map((p) => ({ ...p, media: presentMedia(p.media) })) });
}

async function createOfficialPost(req, res) {
  const post = await CommunityPost.create({ society: sid$1(req), author: req.user._id, body: req.valid.body.body, official: true });
  await audit(req, { action: 'post.official_created', targetType: 'CommunityPost', targetId: post._id });
  res.status(201).json(post);
}

async function moderatePost(req, res) {
  const { action, note } = req.valid.body;
  const status = { hide: 'hidden', remove: 'removed', restore: 'published' }[action];
  const p = await CommunityPost.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req) }, { status, moderatedBy: req.user._id, moderationNote: note }, { returnDocument: 'after' });
  if (!p) throw notFound('Post');
  await ContentReport.updateMany({ targetType: 'post', targetId: p._id, status: 'open' }, { status: action === 'restore' ? 'dismissed' : 'actioned', resolvedBy: req.user._id, resolvedAt: new Date() });
  await audit(req, { action: `post.${action}`, targetType: 'CommunityPost', targetId: p._id, summary: note });
  res.json({ _id: p._id, status: p.status });
}

async function moderateComment(req, res) {
  const { action, note } = req.valid.body;
  const status = { hide: 'hidden', remove: 'removed', restore: 'published' }[action];
  const c = await Comment.findOne({ _id: req.valid.params.id, society: sid$1(req) });
  if (!c) throw notFound('Comment');
  const wasVisible = c.status === 'published';
  c.status = status;
  await c.save();
  if (wasVisible !== (status === 'published')) await CommunityPost.updateOne({ _id: c.post }, { $inc: { commentCount: status === 'published' ? 1 : -1 } });
  await ContentReport.updateMany({ targetType: 'comment', targetId: c._id, status: 'open' }, { status: action === 'restore' ? 'dismissed' : 'actioned', resolvedBy: req.user._id, resolvedAt: new Date() });
  await audit(req, { action: `comment.${action}`, targetType: 'Comment', targetId: c._id, summary: note });
  res.json({ _id: c._id, status: c.status });
}

async function listContentReports(req, res) {
  const page = await pagedFind(ContentReport, { society: sid$1(req), status: req.valid.query.status || 'open' }, req.valid.query, { populate: { path: 'reporter', select: 'name' } });
  // Attach a preview of the reported content.
  const items = await Promise.all(
    page.items.map(async (r) => {
      const Model = { post: CommunityPost, comment: Comment, property: PropertyListing, marketplace: MarketplaceListing }[r.targetType];
      const t = await Model.findById(r.targetId).select('body title status moderationStatus').lean();
      return { ...r, target: t ? { _id: t._id, preview: (t.body || t.title || '').slice(0, 200), status: t.status || t.moderationStatus } : null };
    }),
  );
  res.json({ ...page, items });
}

async function dismissReport(req, res) {
  const r = await ContentReport.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req), status: 'open' }, { status: 'dismissed', resolvedBy: req.user._id, resolvedAt: new Date() }, { returnDocument: 'after' });
  if (!r) throw notFound('Report');
  res.json(r);
}

async function listPollsAdmin(req, res) {
  res.json(await pagedFind(Poll, { society: sid$1(req), status: { $ne: 'removed' } }, req.valid.query, { populate: { path: 'createdBy', select: 'name' } }));
}

async function createPoll(req, res) {
  const { question, options, closesAt } = req.valid.body;
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw badRequest('Poll options must be unique');
  const p = await Poll.create({ society: sid$1(req), question, options: options.map((label) => ({ label })), closesAt, createdBy: req.user._id });
  await audit(req, { action: 'poll.created', targetType: 'Poll', targetId: p._id, summary: question });
  notifySocietyResidents(sid$1(req), { type: 'community', title: 'New community poll', body: question, route: 'Community' }).catch(() => {});
  res.status(201).json(p);
}

async function closePoll(req, res) {
  const p = await Poll.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req), status: 'open' }, { status: 'closed' }, { returnDocument: 'after' });
  if (!p) throw notFound('Open poll');
  await audit(req, { action: 'poll.closed', targetType: 'Poll', targetId: p._id });
  res.json(p);
}

// ======================= Facilities & bookings =======================
async function listFacilitiesAdmin(req, res) {
  res.json({ items: await Facility.find({ society: sid$1(req) }).sort({ name: 1 }).lean() });
}

async function createFacility(req, res) {
  const f = await Facility.create({ ...req.valid.body, society: sid$1(req) });
  await audit(req, { action: 'facility.created', targetType: 'Facility', targetId: f._id, summary: f.name });
  res.status(201).json(f);
}

async function updateFacility(req, res) {
  const f = await Facility.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req) }, req.valid.body, { returnDocument: 'after', runValidators: true });
  if (!f) throw notFound('Facility');
  await audit(req, { action: 'facility.updated', targetType: 'Facility', targetId: f._id, changes: req.valid.body });
  res.json(f);
}

async function listBookingsAdmin(req, res) {
  const q = req.valid.query;
  const filter = { society: sid$1(req) };
  if (q.status) filter.status = q.status;
  if (req.query.facilityId && mongoose.isValidObjectId(req.query.facilityId)) filter.facility = req.query.facilityId;
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '')) filter.date = req.query.date;
  res.json(await pagedFind(FacilityBooking, filter, { ...q, sort: q.sort || '-start' }, { sortable: ['start', 'createdAt'], populate: [{ path: 'facility', select: 'name' }, { path: 'user', select: 'name phone' }, { path: 'membership', select: 'flat', populate: { path: 'flat', select: 'number' } }] }));
}

async function decideBooking(req, res) {
  const { decision, reason } = req.valid.body;
  const b = await FacilityBooking.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req), status: 'pending' }, { status: decision, decisionReason: reason, decidedBy: req.user._id }, { returnDocument: 'after' }).populate('facility', 'name');
  if (!b) throw notFound('Pending booking');
  await audit(req, { action: `booking.${decision}`, targetType: 'FacilityBooking', targetId: b._id, summary: reason });
  notifyUsers([b.user], { society: sid$1(req), type: 'booking', title: `${b.facility?.name} booking ${decision === 'confirmed' ? 'confirmed' : 'declined'}`, body: `${b.date}${reason ? ` — ${reason}` : ''}`, route: 'Bookings' }).catch(() => {});
  res.json(b);
}

async function cancelBookingAdmin(req, res) {
  const b = await FacilityBooking.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req), status: { $in: ['pending', 'confirmed'] } }, { status: 'cancelled', cancelledAt: new Date(), decisionReason: req.valid.body.reason, decidedBy: req.user._id }, { returnDocument: 'after' }).populate('facility', 'name');
  if (!b) throw notFound('Active booking');
  await audit(req, { action: 'booking.cancelled_by_staff', targetType: 'FacilityBooking', targetId: b._id, summary: req.valid.body.reason });
  notifyUsers([b.user], { society: sid$1(req), type: 'booking', title: `${b.facility?.name} booking cancelled`, body: req.valid.body.reason, route: 'Bookings' }).catch(() => {});
  res.json(b);
}

// ======================= Service requests =======================
async function listServiceRequestsAdmin(req, res) {
  const filter = { society: sid$1(req), ...(req.valid.query.status && { status: req.valid.query.status }) };
  res.json(await pagedFind(ServiceRequest, filter, req.valid.query, { populate: [{ path: 'category', select: 'name' }, { path: 'user', select: 'name phone' }, { path: 'flat', select: 'number' }] }));
}

async function updateServiceRequest(req, res) {
  const sr = await ServiceRequest.findOne({ _id: req.valid.params.id, society: sid$1(req) });
  if (!sr) throw notFound('Service request');
  const { status, note, scheduledFor, assigneeName } = req.valid.body;
  if (!SERVICE_REQUEST_TRANSITIONS[sr.status].includes(status)) throw badRequest(`Cannot change status from ${sr.status} to ${status}`);
  sr.status = status;
  if (scheduledFor) sr.scheduledFor = scheduledFor;
  if (assigneeName) sr.assigneeName = assigneeName;
  sr.timeline.push({ status, note, by: req.user._id });
  await sr.save();
  await audit(req, { action: 'service_request.updated', targetType: 'ServiceRequest', targetId: sr._id, summary: status });
  notifyUsers([sr.user], { society: sid$1(req), type: 'service', title: `Service request ${status}`, body: note, route: 'ServiceRequests' }).catch(() => {});
  res.json(sr);
}

// ======================= Listing moderation =======================
async function listListingsAdmin(req, res) {
  const kind = listingKind(req.query.kind);
  const Model = LISTING_MODELS[kind];
  const filter = { society: sid$1(req), moderationStatus: req.valid.query.status || 'pending' };
  const populate = [{ path: LISTING_OWNER[kind], select: 'name phone' }, { path: 'photos' }];
  if (kind !== 'property') populate.push({ path: 'category', select: 'name icon' });
  const page = await pagedFind(Model, filter, req.valid.query, { populate });
  res.json({ ...page, items: page.items.map((l) => ({ ...l, photos: presentMedia(l.photos) })) });
}

const moderateListing = (kind) => async (req, res) => {
  const Model = LISTING_MODELS[kind];
  const { decision, note } = req.valid.body;
  const l = await Model.findOneAndUpdate({ _id: req.valid.params.id, society: sid$1(req) }, { moderationStatus: decision, moderationNote: note, moderatedBy: req.user._id, moderatedAt: new Date() }, { returnDocument: 'after' });
  if (!l) throw notFound('Listing');
  await audit(req, { action: `listing.${decision}`, targetType: kind, targetId: l._id, summary: note });
  notifyUsers([l[LISTING_OWNER[kind]]], { society: sid$1(req), type: 'listing', title: `Your ${kind === 'service' ? 'service' : 'listing'} was ${decision}`, body: note || l.title, route: LISTING_ROUTE[kind] }).catch(() => {});
  res.json({ _id: l._id, moderationStatus: l.moderationStatus });
};

// ======================= Audit =======================
async function listAuditLogs(req, res) {
  const filter = { society: sid$1(req) };
  if (req.query.action) filter.action = new RegExp(`^${escapeRegex(String(req.query.action))}`);
  res.json(await pagedFind(AuditLog, filter, req.valid.query, { select: '-hash', populate: { path: 'actor', select: 'name email' } }));
}

const sid = (req) => req.societyId;

// ---------- charges ----------
async function listCharges(req, res) {
  const [items, society] = await Promise.all([MaintenanceCharge.find({ society: sid(req) }).sort({ createdAt: 1 }).lean(), Society.findById(sid(req)).select('billing payments').lean()]);
  res.json({ items, billing: society.billing, onlinePayments: paymentAvailability(society) });
}

async function createCharge(req, res) {
  const c = await MaintenanceCharge.create({ ...req.valid.body, society: sid(req), createdBy: req.user._id });
  await audit(req, { action: 'charge.created', targetType: 'MaintenanceCharge', targetId: c._id, summary: `${c.name} ${formatINR(c.amountPaise)}` });
  res.status(201).json(c);
}

async function updateCharge(req, res) {
  const c = await MaintenanceCharge.findOneAndUpdate({ _id: req.valid.params.id, society: sid(req) }, req.valid.body, { returnDocument: 'after', runValidators: true });
  if (!c) throw notFound('Charge');
  await audit(req, { action: 'charge.updated', targetType: 'MaintenanceCharge', targetId: c._id, changes: req.valid.body });
  res.json(c);
}

// ---------- invoices ----------
async function listInvoices(req, res) {
  const q = req.valid.query;
  const filter = { society: sid(req) };
  if (q.period) filter.period = q.period;
  if (q.buildingId) filter.building = q.buildingId;
  if (q.flatId) filter.flat = q.flatId;
  if (q.status === 'open') filter.status = { $in: ['unpaid', 'partially_paid'] };
  else if (q.status) filter.status = q.status;
  if (q.overdue === 'true') Object.assign(filter, { status: { $in: ['unpaid', 'partially_paid'] }, dueDate: { $lt: new Date() } });
  if (q.q) filter.invoiceNumber = new RegExp(escapeRegex(q.q), 'i');
  const page = await pagedFind(MaintenanceInvoice, filter, { ...q, sort: q.sort || '-createdAt' }, { sortable: ['createdAt', 'dueDate', 'period', 'totalPaise'], populate: [{ path: 'flat', select: 'number' }, { path: 'building', select: 'name' }] });
  const agg = await MaintenanceInvoice.aggregate([
    { $match: { ...filter, society: new mongoose.Types.ObjectId(String(sid(req))), active: true } },
    { $group: { _id: null, billed: { $sum: '$totalPaise' }, collected: { $sum: '$paidPaise' } } },
  ]);
  res.json({
    ...page,
    items: page.items.map((i) => ({ ...i, balancePaise: i.status === 'cancelled' ? 0 : i.totalPaise - i.paidPaise, overdue: ['unpaid', 'partially_paid'].includes(i.status) && new Date(i.dueDate) < new Date() })),
    totals: { billedPaise: agg[0]?.billed || 0, collectedPaise: agg[0]?.collected || 0, outstandingPaise: (agg[0]?.billed || 0) - (agg[0]?.collected || 0) },
  });
}

async function generate(req, res) {
  const { period, buildingId, dueDate } = req.valid.body;
  const result = await generateInvoices(sid(req), period, { actorId: req.user._id, buildingId, dueDate: dueDate ? istDate(dueDate, '23:59') : undefined });
  await audit(req, { action: 'invoice.generated', targetType: 'Society', targetId: sid(req), summary: `${periodLabel(period)}: ${result.created} created, ${result.alreadyBilled} already billed, ${result.zeroAmount} zero-amount` });
  res.status(201).json({ ...result, invoices: undefined });
}

async function getInvoiceAdmin(req, res) {
  const inv = await MaintenanceInvoice.findOne({ _id: req.valid.params.id, society: sid(req) }).populate('flat', 'number areaSqft').populate('building', 'name').lean({ virtuals: true });
  if (!inv) throw notFound('Invoice');
  const payments = await Payment.find({ invoice: inv._id }).sort({ createdAt: -1 }).populate('receipt', 'receiptNumber').populate('recordedBy', 'name').populate('payer', 'name phone').lean();
  res.json({ ...inv, balancePaise: inv.status === 'cancelled' ? 0 : inv.totalPaise - inv.paidPaise, payments });
}

async function cancel(req, res) {
  const inv = await cancelInvoice(req.valid.params.id, sid(req), req.valid.body.reason);
  await audit(req, { action: 'invoice.cancelled', targetType: 'MaintenanceInvoice', targetId: inv._id, summary: `${inv.invoiceNumber}: ${req.valid.body.reason}` });
  res.json(inv);
}

async function recordPayment(req, res) {
  const payment = await recordOfflinePayment(req, req.valid.params.id, { ...req.valid.body, paidOn: req.valid.body.paidOn ? istDate(req.valid.body.paidOn, '12:00') : undefined });
  res.status(201).json(payment);
}

async function sendReminders(req, res) {
  const open = await MaintenanceInvoice.find({ society: sid(req), active: true, status: { $in: ['unpaid', 'partially_paid'] } }).lean();
  for (const inv of open) {
    notifyFlatResidents(sid(req), inv.flat, {
      type: 'reminder',
      title: inv.dueDate < new Date() ? 'Maintenance payment overdue' : 'Maintenance payment reminder',
      body: `${formatINR(inv.totalPaise - inv.paidPaise)} pending for ${periodLabel(inv.period)}.`,
      route: 'Invoice',
      id: inv._id,
    }).catch(() => {});
  }
  await audit(req, { action: 'invoice.reminders_sent', targetType: 'Society', targetId: sid(req), summary: `${open.length} invoices` });
  res.json({ reminded: open.length });
}

// ---------- payments ----------
async function listPayments(req, res) {
  const q = req.valid.query;
  const filter = { society: sid(req) };
  if (q.status) filter.status = q.status;
  if (req.query.channel === 'online' || req.query.channel === 'offline') filter.channel = req.query.channel;
  res.json(await pagedFind(Payment, filter, q, { sortable: ['createdAt', 'paidOn', 'amountPaise'], select: '-statusHistory', populate: [{ path: 'invoice', select: 'invoiceNumber period' }, { path: 'flat', select: 'number' }, { path: 'receipt', select: 'receiptNumber' }, { path: 'payer', select: 'name' }] }));
}

async function getPaymentAdmin(req, res) {
  const p = await Payment.findOne({ _id: req.valid.params.id, society: sid(req) }).populate('invoice', 'invoiceNumber period totalPaise').populate('flat', 'number').populate('receipt').populate('payer', 'name phone').populate('recordedBy', 'name').lean();
  if (!p) throw notFound('Payment');
  res.json(p);
}

async function reversePayment(req, res) {
  res.json(await reverseOfflinePayment(req, req.valid.params.id, req.valid.body.reason));
}

async function refundPayment(req, res) {
  res.json(await requestGatewayRefund(req, req.valid.params.id, req.valid.body.amountPaise, req.valid.body.reason));
}

async function receiptPdfAdmin(req, res) {
  const r = await Receipt.findOne({ _id: req.valid.params.id, society: sid(req) }).populate('invoice', 'invoiceNumber period').lean();
  if (!r) throw notFound('Receipt');
  const [society, flat, payment] = await Promise.all([Society.findById(sid(req)).lean(), Flat.findById(r.flat).populate('building', 'name').lean(), Payment.findById(r.payment).lean()]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${r.receiptNumber.replace(/[^\w-]/g, '_')}.pdf"`);
  receiptToPdf({ receipt: r, society, invoice: r.invoice, flat, payment }).pipe(res);
}

// ---------- expenses & income ----------
async function listExpenses(req, res) {
  const q = req.valid.query;
  const filter = { society: sid(req), status: q.status || 'recorded' };
  if (q.q) filter.$or = [{ vendor: new RegExp(escapeRegex(q.q), 'i') }, { category: new RegExp(escapeRegex(q.q), 'i') }, { description: new RegExp(escapeRegex(q.q), 'i') }];
  const page = await pagedFind(Expense, filter, { ...q, sort: q.sort || '-paidOn' }, { sortable: ['paidOn', 'amountPaise', 'createdAt'], populate: [{ path: 'recordedBy', select: 'name' }, { path: 'attachments' }] });
  const categories = await Expense.distinct('category', { society: sid(req) });
  res.json({ ...page, items: page.items.map((e) => ({ ...e, attachments: presentMedia(e.attachments) })), categories });
}

async function createExpense(req, res) {
  const { attachments, paidOn, ...data } = req.valid.body;
  const media = await claimMedia(attachments, { owner: req.user._id, purpose: 'expense' });
  const date = istDate(paidOn, '12:00');
  const expense = await mongoose.connection.transaction(async (session) => {
    const [e] = await Expense.create([{ ...data, paidOn: date, attachments: media, society: sid(req), recordedBy: req.user._id }], { session });
    await postLedgerEntry({ society: sid(req), date, direction: 'debit', amountPaise: e.amountPaise, account: e.account, category: e.category, entryType: 'expense', sourceType: 'expense', sourceId: e._id, memo: [e.vendor, e.description].filter(Boolean).join(' — '), createdBy: req.user._id, eventKey: `expense:${e._id}` }, session);
    await audit(req, { action: 'expense.recorded', targetType: 'Expense', targetId: e._id, summary: `${e.category} ${formatINR(e.amountPaise)}` }, session);
    return e;
  });
  res.status(201).json(expense);
}

/** Expenses are never deleted: voiding keeps the record and posts a reversing ledger entry. */
async function voidExpense(req, res) {
  const result = await mongoose.connection.transaction(async (session) => {
    const e = await Expense.findOne({ _id: req.valid.params.id, society: sid(req) }).session(session);
    if (!e) throw notFound('Expense');
    if (e.status === 'voided') throw conflict('This expense is already voided');
    e.status = 'voided';
    e.voidReason = req.valid.body.reason;
    e.voidedBy = req.user._id;
    e.voidedAt = new Date();
    await e.save({ session });
    const original = await FinancialLedgerEntry.findOne({ society: sid(req), eventKey: `expense:${e._id}` }).session(session);
    if (original) await reverseLedgerEntry(original._id, { memo: `Expense voided: ${req.valid.body.reason}`, createdBy: req.user._id }, session);
    await audit(req, { action: 'expense.voided', targetType: 'Expense', targetId: e._id, summary: req.valid.body.reason }, session);
    return e;
  });
  res.json(result);
}

async function recordOtherIncome(req, res) {
  const { receivedOn, ...data } = req.valid.body;
  const id = new mongoose.Types.ObjectId();
  const entry = await postLedgerEntry({ society: sid(req), date: istDate(receivedOn, '12:00'), direction: 'credit', amountPaise: data.amountPaise, account: data.account, category: data.category, entryType: 'other_income', sourceType: 'adjustment', sourceId: id, memo: data.description, createdBy: req.user._id, eventKey: `income:${id}` });
  await audit(req, { action: 'income.recorded', targetType: 'FinancialLedgerEntry', targetId: entry._id, summary: `${data.category} ${formatINR(data.amountPaise)}` });
  res.status(201).json(entry);
}

async function postAdjustment(req, res) {
  const id = new mongoose.Types.ObjectId();
  const { date, ...data } = req.valid.body;
  const entry = await postLedgerEntry({ society: sid(req), date: date ? istDate(date, '12:00') : new Date(), ...data, entryType: 'adjustment', sourceType: 'adjustment', sourceId: id, createdBy: req.user._id, eventKey: `adjustment:${id}` });
  await audit(req, { action: 'ledger.adjustment', targetType: 'FinancialLedgerEntry', targetId: entry._id, summary: `${data.direction} ${formatINR(data.amountPaise)}: ${data.memo}` });
  res.status(201).json(entry);
}

async function reverseEntry(req, res) {
  const original = await FinancialLedgerEntry.findOne({ _id: req.valid.params.id, society: sid(req) }).lean();
  if (!original) throw notFound('Ledger entry');
  if (!['adjustment', 'other_income', 'opening'].includes(original.entryType)) throw badRequest('Payments and expenses are reversed from their own screens so linked records stay consistent');
  const rev = await reverseLedgerEntry(original._id, { memo: `Reversed: ${req.valid.body.reason}`, createdBy: req.user._id });
  await audit(req, { action: 'ledger.reversed', targetType: 'FinancialLedgerEntry', targetId: original._id, summary: req.valid.body.reason });
  res.status(201).json(rev);
}

async function setOpeningBalance(req, res) {
  const { amountPaise, asOf, account } = req.valid.body;
  const existing = await FinancialLedgerEntry.findOne({ society: sid(req), entryType: 'opening' }).lean();
  if (existing) throw conflict('An opening balance is already recorded. Post an adjustment to correct it.');
  if (amountPaise === 0) throw badRequest('Opening balance must be non-zero');
  const entry = await postLedgerEntry({ society: sid(req), date: istDate(asOf), direction: amountPaise > 0 ? 'credit' : 'debit', amountPaise: Math.abs(amountPaise), account, category: 'Opening balance', entryType: 'opening', sourceType: 'society', sourceId: sid(req), memo: 'Opening balance', createdBy: req.user._id, eventKey: 'opening-balance' });
  await Society.updateOne({ _id: sid(req) }, { openingBalancePaise: amountPaise, openingBalanceDate: istDate(asOf) });
  await audit(req, { action: 'ledger.opening_balance', targetType: 'Society', targetId: sid(req), summary: formatINR(amountPaise) });
  res.status(201).json(entry);
}

async function listLedger(req, res) {
  const q = req.valid.query;
  const filter = { society: sid(req) };
  if (req.query.entryType) filter.entryType = String(req.query.entryType);
  if (req.query.account) filter.account = String(req.query.account);
  if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.from || '') || /^\d{4}-\d{2}-\d{2}$/.test(req.query.to || '')) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = istDate(req.query.from);
    if (req.query.to) filter.date.$lt = new Date(istDate(req.query.to).getTime() + 86400_000);
  }
  const page = await pagedFind(FinancialLedgerEntry, filter, { ...q, sort: q.sort || '-date' }, { sortable: ['date', 'amountPaise', 'createdAt'], populate: { path: 'createdBy', select: 'name' } });
  // Flag entries that already have a reversal so the panel can disable "Reverse" without guessing.
  const reversals = await FinancialLedgerEntry.find({ society: sid(req), reverses: { $in: page.items.map((e) => e._id) } }).select('reverses').lean();
  const reversed = new Set(reversals.map((r) => String(r.reverses)));
  res.json({ ...page, items: page.items.map((e) => ({ ...e, reversed: reversed.has(String(e._id)) })) });
}

// ---------- reports ----------
function listReportTypes(_req, res) {
  res.json({
    items: [
      { type: 'collection-monthly', label: 'Monthly collection', params: ['period'] },
      { type: 'collection-yearly', label: 'Yearly collection', params: ['year'] },
      { type: 'dues', label: 'Flat-wise pending dues', params: [] },
      { type: 'resident-statement', label: 'Resident payment statement', params: ['flatId'] },
      { type: 'income-expense', label: 'Income & expense summary', params: ['from', 'to'] },
      { type: 'vendor-expenditure', label: 'Vendor expenditure', params: ['from', 'to'] },
      { type: 'ledger', label: 'Transaction ledger', params: ['from', 'to'] },
      { type: 'audit-summary', label: 'Audit-supporting statement', params: ['from', 'to'] },
    ].filter((r) => REPORT_TYPES.includes(r.type)),
  });
}

async function report(req, res) {
  const { format, ...query } = req.valid.query;
  const society = await Society.findById(sid(req)).lean();
  const data = await buildReport(society, req.params.type, query);
  await audit(req, { action: 'report.generated', targetType: 'Report', targetId: req.params.type, summary: `${data.title} (${format})` });
  const filename = `${req.params.type}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    return reportToPdf(data).pipe(res);
  }
  if (format === 'xlsx') {
    const buf = await reportToXlsx(data);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    return res.send(Buffer.from(buf));
  }
  return res.json(data);
}

// ======================= Overview =======================
async function overview(_req, res) {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [societies, suspended, pendingRegistrations, users, newUsers, members, pendingMembers, openComplaints, pendingListings, openReports, payments30, invoiceTotals] = await Promise.all([
    Society.countDocuments({ status: 'active' }),
    Society.countDocuments({ status: 'suspended' }),
    SocietyRegistration.countDocuments({ status: { $in: ['submitted', 'under_review'] } }),
    User.countDocuments({ platformRole: 'user' }),
    User.countDocuments({ platformRole: 'user', createdAt: { $gte: since } }),
    SocietyMembership.countDocuments({ status: 'approved' }),
    SocietyMembership.countDocuments({ status: 'pending' }),
    Complaint.countDocuments({ status: { $in: ['pending', 'assigned', 'in_progress'] } }),
    pendingListingCount({}),
    ContentReport.countDocuments({ status: 'open' }),
    Payment.aggregate([{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { channel: '$channel', status: '$status' }, total: { $sum: '$amountPaise' }, n: { $sum: 1 } } }]),
    MaintenanceInvoice.aggregate([{ $match: { active: true } }, { $group: { _id: null, billed: { $sum: '$totalPaise' }, collected: { $sum: '$paidPaise' } } }]),
  ]);
  res.json({
    counts: { societies, suspended, pendingRegistrations, users, newUsers30d: newUsers, members, pendingMembers, openComplaints, pendingListings, openReports },
    payments30d: payments30.map((p) => ({ channel: p._id.channel, status: p._id.status, totalPaise: p.total, count: p.n })),
    billing: { billedPaise: invoiceTotals[0]?.billed || 0, collectedPaise: invoiceTotals[0]?.collected || 0 },
  });
}

// ======================= Registrations =======================
async function listRegistrations(req, res) {
  const q = req.valid.query;
  const filter = q.status ? { status: q.status } : { status: { $in: ['submitted', 'under_review'] } };
  if (q.q) filter.$or = [{ societyName: new RegExp(escapeRegex(q.q), 'i') }, { referenceCode: q.q.toUpperCase() }, { city: new RegExp(escapeRegex(q.q), 'i') }];
  res.json(await pagedFind(SocietyRegistration, filter, q, { sortable: ['createdAt', 'submittedAt'] }));
}

async function getRegistration(req, res) {
  const r = await SocietyRegistration.findById(req.valid.params.id).populate('documents').populate('reviewedBy', 'name').lean();
  if (!r) throw notFound('Registration');
  res.json({ ...r, documents: presentMedia(r.documents) });
}

async function markUnderReview(req, res) {
  const r = await SocietyRegistration.findOneAndUpdate({ _id: req.valid.params.id, status: 'submitted' }, { status: 'under_review', reviewedBy: req.user._id }, { returnDocument: 'after' });
  if (!r) throw badRequest('Only submitted applications can be moved to review');
  await audit(req, { action: 'registration.under_review', targetType: 'SocietyRegistration', targetId: r._id, summary: r.societyName });
  res.json(r);
}

async function rejectRegistration(req, res) {
  const r = await SocietyRegistration.findOneAndUpdate({ _id: req.valid.params.id, status: { $in: ['submitted', 'under_review'] } }, { status: 'rejected', decisionReason: req.valid.body.reason, reviewedBy: req.user._id, reviewedAt: new Date() }, { returnDocument: 'after' });
  if (!r) throw badRequest('This application is not awaiting a decision');
  await audit(req, { action: 'registration.rejected', targetType: 'SocietyRegistration', targetId: r._id, summary: `${r.societyName}: ${req.valid.body.reason}` });
  await sendMail({ to: r.email, subject: `Society registration ${r.referenceCode} update`, text: `Your application for ${r.societyName} was not approved.\nReason: ${req.valid.body.reason}\n\nYou can update and resubmit it using your reference code and access key.` });
  res.json(r);
}

/** Approval creates the Society, its first admin account (no password) and a one-time setup link. */
async function approveRegistration(req, res) {
  const outcome = await mongoose.connection.transaction(async (session) => {
    const r = await SocietyRegistration.findOne({ _id: req.valid.params.id, status: { $in: ['submitted', 'under_review'] } }).session(session);
    if (!r) throw badRequest('This application is not awaiting a decision');
    let user = await User.findOne({ email: r.representative.email }).session(session);
    if (user?.platformRole === 'super_admin') throw badRequest('The representative email belongs to a platform administrator');
    if (!user) [user] = await User.create([{ name: r.representative.name, email: r.representative.email, status: 'pending_setup' }], { session });
    const [society] = await Society.create(
      [{ name: r.societyName, code: `SOC${shortCode(5)}`, addressLine: r.addressLine, area: r.area, city: r.city, state: r.state, pincode: r.pincode, phone: r.phone, email: r.email, registration: r._id }],
      { session },
    );
    await SocietyStaff.create([{ society: society._id, user: user._id, role: 'admin', title: r.representative.designation, addedBy: req.user._id }], { session });
    r.status = 'approved';
    r.society = society._id;
    r.reviewedBy = req.user._id;
    r.reviewedAt = new Date();
    r.decisionReason = req.valid.body?.reason;
    await r.save({ session });
    await audit(req, { action: 'registration.approved', society: society._id, targetType: 'SocietyRegistration', targetId: r._id, summary: `${r.societyName} → ${society.code}` }, session);
    return { registration: r, society, user };
  });
  let link;
  let emailed = false;
  if (outcome.user.status === 'pending_setup') {
    link = setupLink(await issuePasswordSetupToken(outcome.user));
    emailed = await sendMail({ to: outcome.user.email, subject: `${outcome.society.name} is approved on AddaApp`, text: `Your society has been approved.\nSociety code: ${outcome.society.code}\n\nSet your admin password within 72 hours:\n${link}` });
  }
  res.json({ society: outcome.society, adminEmail: outcome.user.email, setupLink: link, emailed, emailConfigured: mailConfigured() });
}

// ======================= Societies =======================
async function listSocieties(req, res) {
  const q = req.valid.query;
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.q) filter.$or = [{ name: new RegExp(escapeRegex(q.q), 'i') }, { code: q.q.toUpperCase() }, { city: new RegExp(escapeRegex(q.q), 'i') }];
  const page = await pagedFind(Society, filter, q, { sortable: ['createdAt', 'name'] });
  const ids = page.items.map((s) => s._id);
  const [members, admins] = await Promise.all([
    SocietyMembership.aggregate([{ $match: { society: { $in: ids }, status: 'approved' } }, { $group: { _id: '$society', n: { $sum: 1 } } }]),
    SocietyStaff.aggregate([{ $match: { society: { $in: ids }, status: 'active' } }, { $group: { _id: '$society', n: { $sum: 1 } } }]),
  ]);
  const m = Object.fromEntries(members.map((x) => [String(x._id), x.n]));
  const a = Object.fromEntries(admins.map((x) => [String(x._id), x.n]));
  res.json({ ...page, items: page.items.map((s) => ({ ...s, residentCount: m[String(s._id)] || 0, staffCount: a[String(s._id)] || 0 })) });
}

async function getSociety(req, res) {
  const s = await Society.findById(req.valid.params.id).lean();
  if (!s) throw notFound('Society');
  const [staff, residents, invoices] = await Promise.all([
    SocietyStaff.find({ society: s._id }).populate('user', 'name email phone status lastLoginAt').lean(),
    SocietyMembership.countDocuments({ society: s._id, status: 'approved' }),
    MaintenanceInvoice.aggregate([{ $match: { society: s._id, active: true } }, { $group: { _id: null, billed: { $sum: '$totalPaise' }, collected: { $sum: '$paidPaise' }, n: { $sum: 1 } } }]),
  ]);
  res.json({ ...s, staff: maskPersonalData(staff), residentCount: residents, financeSummary: { invoices: invoices[0]?.n || 0, billedPaise: invoices[0]?.billed || 0, collectedPaise: invoices[0]?.collected || 0 } });
}

const setSocietyStatus = (status) => async (req, res) => {
  const reason = req.valid.body?.reason;
  if (status === 'suspended' && !reason) throw badRequest('Provide a suspension reason');
  const s = await Society.findByIdAndUpdate(req.valid.params.id, { status, suspendedReason: status === 'suspended' ? reason : undefined }, { returnDocument: 'after' });
  if (!s) throw notFound('Society');
  await audit(req, { action: `society.${status === 'suspended' ? 'suspended' : 'reactivated'}`, society: s._id, targetType: 'Society', targetId: s._id, summary: reason });
  res.json(s);
};

async function updateSocietyPayments(req, res) {
  const { onlineEnabled, settlementMode, linkedAccountId } = req.valid.body;
  if (onlineEnabled && settlementMode === 'none') throw badRequest('Choose a verified settlement mode before enabling online collection');
  if (settlementMode === 'razorpay_route' && !linkedAccountId) throw badRequest('Razorpay Route requires the society linked account id (acc_...)');
  const s = await Society.findByIdAndUpdate(
    req.valid.params.id,
    { 'payments.onlineEnabled': onlineEnabled, 'payments.settlementMode': settlementMode, 'payments.linkedAccountId': linkedAccountId, 'payments.verifiedAt': new Date(), 'payments.verifiedBy': req.user._id },
    { returnDocument: 'after' },
  );
  if (!s) throw notFound('Society');
  await audit(req, { action: 'society.payments_configured', society: s._id, targetType: 'Society', targetId: s._id, changes: { onlineEnabled, settlementMode } });
  res.json(s.payments);
}

async function addSocietyAdmin(req, res) {
  const s = await Society.findById(req.valid.params.id);
  if (!s) throw notFound('Society');
  const { name, email, phone, role } = req.valid.body;
  let user = await User.findOne({ email });
  if (user?.platformRole === 'super_admin') throw badRequest('Platform administrators cannot be added as society staff');
  if (!user) user = await User.create({ name, email, phone: phone || undefined, status: 'pending_setup' });
  if (await SocietyStaff.exists({ society: s._id, user: user._id })) throw conflict('Already a staff member of this society');
  const staff = await SocietyStaff.create({ society: s._id, user: user._id, role, addedBy: req.user._id });
  let link;
  let emailed = false;
  if (user.status === 'pending_setup') {
    link = setupLink(await issuePasswordSetupToken(user));
    emailed = await sendMail({ to: email, subject: `Your ${s.name} admin access`, text: link });
  }
  await audit(req, { action: 'society.admin_added', society: s._id, targetType: 'SocietyStaff', targetId: staff._id, summary: `${email} (${role})` });
  res.status(201).json({ staff, setupLink: link, emailed });
}

async function issueStaffSetupLink(req, res) {
  const staff = await SocietyStaff.findById(req.valid.params.id).populate('user');
  if (!staff) throw notFound('Staff member');
  const link = setupLink(await issuePasswordSetupToken(staff.user, 24));
  await revokeAllSessions(staff.user._id, 'admin_reset');
  await audit(req, { action: 'staff.reset_link_issued', society: staff.society, targetType: 'User', targetId: staff.user._id });
  res.json({ setupLink: link, expiresInHours: 24 });
}

// ======================= Users =======================
async function listUsers(req, res) {
  const q = req.valid.query;
  const filter = {};
  if (q.status) filter.status = q.status;
  if (req.query.role === 'super_admin' || req.query.role === 'user') filter.platformRole = req.query.role;
  if (q.q) filter.$or = [{ name: new RegExp(escapeRegex(q.q), 'i') }, { phone: new RegExp(escapeRegex(q.q)) }, { email: new RegExp(escapeRegex(q.q), 'i') }];
  res.json(maskPersonalData(await pagedFind(User, filter, q, { sortable: ['createdAt', 'lastLoginAt', 'name'] })));
}

async function setUserStatus(req, res) {
  const { status } = req.params;
  if (!['active', 'disabled'].includes(status)) throw badRequest('Invalid status');
  if (String(req.valid.params.id) === String(req.user._id)) throw forbidden('You cannot change your own account status');
  const u = await User.findById(req.valid.params.id);
  if (!u) throw notFound('User');
  if (u.platformRole === 'super_admin') throw forbidden('Super admin accounts are managed from the server console');
  if (status === 'active' && u.status === 'pending_setup') throw badRequest('This account has not completed setup');
  u.status = status;
  u.disabledReason = status === 'disabled' ? req.valid.body?.reason : undefined;
  await u.save();
  if (status === 'disabled') await revokeAllSessions(u._id, 'account_disabled');
  await audit(req, { action: `user.${status === 'disabled' ? 'disabled' : 'enabled'}`, targetType: 'User', targetId: u._id, summary: req.valid.body?.reason });
  res.json(u);
}

// ======================= Listings & content =======================
async function listAllListings(req, res) {
  const kind = listingKind(req.query.kind);
  const Model = LISTING_MODELS[kind];
  const filter = { moderationStatus: req.valid.query.status || 'pending' };
  if (req.query.scope === 'independent') filter.society = null;
  if (req.query.reported === 'true') filter.reportCount = { $gt: 0 };
  const populate = [{ path: LISTING_OWNER[kind], select: 'name phone' }, { path: 'society', select: 'name' }, { path: 'photos' }];
  if (kind !== 'property') populate.push({ path: 'category', select: 'name icon' });
  const page = await pagedFind(Model, filter, req.valid.query, { sortable: ['createdAt', 'reportCount'], populate });
  res.json({ ...page, items: page.items.map((l) => ({ ...l, photos: presentMedia(l.photos) })) });
}

const moderateAnyListing = (kind) => async (req, res) => {
  const Model = LISTING_MODELS[kind];
  const { decision, note } = req.valid.body;
  const l = await Model.findByIdAndUpdate(req.valid.params.id, { moderationStatus: decision, moderationNote: note, moderatedBy: req.user._id, moderatedAt: new Date() }, { returnDocument: 'after' });
  if (!l) throw notFound('Listing');
  await ContentReport.updateMany({ targetType: kind, targetId: l._id, status: 'open' }, { status: decision === 'approved' ? 'dismissed' : 'actioned', resolvedBy: req.user._id, resolvedAt: new Date() });
  await audit(req, { action: `platform.listing_${decision}`, society: l.society, targetType: kind, targetId: l._id, summary: note });
  notifyUsers([l[LISTING_OWNER[kind]]], { type: 'listing', title: `Your ${kind === 'service' ? 'service' : 'listing'} was ${decision}`, body: note || l.title, route: LISTING_ROUTE[kind] }).catch(() => {});
  res.json({ _id: l._id, moderationStatus: l.moderationStatus });
};

async function listAllReports(req, res) {
  res.json(await pagedFind(ContentReport, { status: req.valid.query.status || 'open' }, req.valid.query, { populate: [{ path: 'reporter', select: 'name' }, { path: 'society', select: 'name' }] }));
}

// ======================= Categories =======================
async function listCategories(req, res) {
  const filter = { society: null };
  if (['complaint', 'service', 'marketplace'].includes(req.query.kind)) filter.kind = req.query.kind;
  res.json({ items: await ServiceCategory.find(filter).sort({ kind: 1, sortOrder: 1, name: 1 }).lean() });
}

async function createCategory(req, res) {
  const c = await ServiceCategory.create({ ...req.valid.body, society: null });
  await audit(req, { action: 'platform.category_created', targetType: 'ServiceCategory', targetId: c._id, summary: `${c.kind}: ${c.name}` });
  res.status(201).json(c);
}

async function updateCategory(req, res) {
  const c = await ServiceCategory.findOneAndUpdate({ _id: req.valid.params.id, society: null }, req.valid.body, { returnDocument: 'after', runValidators: true });
  if (!c) throw notFound('Category');
  await audit(req, { action: 'platform.category_updated', targetType: 'ServiceCategory', targetId: c._id, changes: req.valid.body });
  res.json(c);
}

// ======================= Platform announcements =======================
async function listPlatformAnnouncements(req, res) {
  const filter = { scope: 'platform' };
  if (['published', 'archived'].includes(req.valid.query.status)) filter.status = req.valid.query.status;
  res.json(await pagedFind(Announcement, filter, req.valid.query, { populate: { path: 'createdBy', select: 'name' } }));
}

async function createPlatformAnnouncement(req, res) {
  const a = await Announcement.create({ ...req.valid.body, attachments: [], scope: 'platform', society: null, createdBy: req.user._id });
  await audit(req, { action: 'platform.announcement', targetType: 'Announcement', targetId: a._id, summary: a.title });
  res.status(201).json(a);
}

async function archivePlatformAnnouncement(req, res) {
  const a = await Announcement.findOneAndUpdate({ _id: req.valid.params.id, scope: 'platform' }, { status: 'archived' }, { returnDocument: 'after' });
  if (!a) throw notFound('Announcement');
  await audit(req, { action: 'platform.announcement_archived', targetType: 'Announcement', targetId: a._id });
  res.json(a);
}

// ======================= Settings & audit =======================
const SETTING_KEYS = { 'listings.requireApproval': 'boolean', 'support.email': 'string', 'support.phone': 'string' };

async function listSettings(_req, res) {
  const rows = await PlatformSetting.find({}).lean();
  const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  res.json({ items: Object.entries(SETTING_KEYS).map(([key, type]) => ({ key, type, value: values[key] ?? (key === 'listings.requireApproval' ? true : '') })) });
}

async function updateSetting(req, res) {
  const key = req.params.key;
  if (!SETTING_KEYS[key]) throw badRequest('Unknown setting');
  if (typeof req.valid.body.value !== SETTING_KEYS[key]) throw badRequest(`Setting ${key} must be a ${SETTING_KEYS[key]}`);
  const s = await PlatformSetting.findOneAndUpdate({ key }, { value: req.valid.body.value, updatedBy: req.user._id }, { upsert: true, returnDocument: 'after' });
  await audit(req, { action: 'platform.setting_updated', targetType: 'PlatformSetting', targetId: key, changes: { value: req.valid.body.value } });
  res.json(s);
}

async function listAudit(req, res) {
  const filter = {};
  if (req.query.societyId && mongoose.isValidObjectId(req.query.societyId)) filter.society = req.query.societyId;
  if (req.query.action) filter.action = new RegExp(`^${escapeRegex(String(req.query.action))}`);
  res.json(await pagedFind(AuditLog, filter, req.valid.query, { select: '-hash', populate: [{ path: 'actor', select: 'name email' }, { path: 'society', select: 'name' }] }));
}

async function listPaymentsPlatform(req, res) {
  const filter = {};
  if (req.valid.query.status) filter.status = req.valid.query.status;
  if (req.query.societyId && mongoose.isValidObjectId(req.query.societyId)) filter.society = req.query.societyId;
  res.json(await pagedFind(Payment, filter, req.valid.query, { select: '-statusHistory', populate: [{ path: 'society', select: 'name' }, { path: 'invoice', select: 'invoiceNumber' }] }));
}

const id = validate({ params: idParam });
const page = validate({ query: pageQuery });
const reason = validate({ body: requiredReason });

/** Society Admin / staff routes. Every handler is scoped to req.societyId from the caller's staff assignment. */
const societyRouter = Router();
societyRouter.use(authenticate);
const can = requireStaff;

societyRouter.get('/overview', can('society.read'), overview$1);
societyRouter.get('/profile', can('society.read'), getProfile);
societyRouter.patch('/profile', can('society.manage'), validate({ body: societyProfile }), updateProfile);
societyRouter.patch('/billing-settings', can('finance'), validate({ body: billingSettings }), updateBilling);

societyRouter.get('/buildings', can('members.read'), listBuildings);
societyRouter.post('/buildings', can('society.manage'), validate({ body: buildingUpsert }), createBuilding);
societyRouter.patch('/buildings/:id', can('society.manage'), id, validate({ body: patchOf(buildingUpsert) }), updateBuilding);
societyRouter.get('/flats', can('members.read'), page, listFlats);
societyRouter.post('/flats', can('society.manage'), validate({ body: flatUpsert }), createFlat);
societyRouter.post('/flats/bulk', can('society.manage'), validate({ body: flatBulk }), bulkCreateFlats);
societyRouter.patch('/flats/:id', can('society.manage'), id, validate({ body: patchOf(flatUpsert) }), updateFlat);

societyRouter.get('/memberships', can('members.read'), page, listMemberships);
societyRouter.post('/memberships/:id/approve', can('members'), id, validate({ body: decision }), decideMembership('approve'));
societyRouter.post('/memberships/:id/reject', can('members'), id, validate({ body: decision }), decideMembership('reject'));
societyRouter.post('/memberships/:id/suspend', can('members'), id, validate({ body: decision }), decideMembership('suspend'));
societyRouter.post('/memberships/:id/remove', can('members'), id, validate({ body: decision }), decideMembership('remove'));

societyRouter.get('/staff', can('society.read'), listStaff);
societyRouter.post('/staff', can('staff'), validate({ body: staffInvite }), inviteStaff);
societyRouter.patch('/staff/:id', can('staff'), id, validate({ body: staffUpdate }), updateStaff);
societyRouter.post('/staff/:id/setup-link', can('staff'), id, resendStaffSetup);

societyRouter.get('/complaints', can('complaints'), page, listComplaints);
societyRouter.get('/complaints/:id', can('complaints'), id, getComplaintAdmin);
societyRouter.post('/complaints/:id/assign', can('complaints'), id, validate({ body: complaintAssign }), assignComplaint);
societyRouter.post('/complaints/:id/status', can('complaints'), id, validate({ body: complaintStatus }), updateComplaintStatus);
societyRouter.post('/complaints/:id/remarks', can('complaints'), id, validate({ body: complaintComment }), addComplaintRemark);

societyRouter.get('/categories', can('society.read'), listSocietyCategories);
societyRouter.post('/categories', can('society.manage'), validate({ body: categoryUpsert }), createSocietyCategory);
societyRouter.patch('/categories/:id', can('society.manage'), id, validate({ body: patchOf(categoryUpsert) }), updateSocietyCategory);

societyRouter.get('/announcements', can('society.read'), page, listAnnouncementsAdmin);
societyRouter.post('/announcements', can('announcements'), validate({ body: announcementCreate }), createAnnouncement);
societyRouter.patch('/announcements/:id', can('announcements'), id, validate({ body: patchOf(announcementCreate) }), updateAnnouncement);
societyRouter.post('/announcements/:id/archive', can('announcements'), id, archiveAnnouncement);

societyRouter.get('/posts', can('community'), page, listPostsAdmin);
societyRouter.post('/posts', can('community'), validate({ body: postCreate }), createOfficialPost);
societyRouter.post('/posts/:id/moderate', can('community'), id, validate({ body: moderation }), moderatePost);
societyRouter.post('/comments/:id/moderate', can('community'), id, validate({ body: moderation }), moderateComment);
societyRouter.get('/content-reports', can('community'), page, listContentReports);
societyRouter.post('/content-reports/:id/dismiss', can('community'), id, dismissReport);
societyRouter.get('/polls', can('community'), page, listPollsAdmin);
societyRouter.post('/polls', can('community'), validate({ body: pollCreate }), createPoll);
societyRouter.post('/polls/:id/close', can('community'), id, closePoll);

societyRouter.get('/facilities', can('facilities'), listFacilitiesAdmin);
societyRouter.post('/facilities', can('facilities'), validate({ body: facilityUpsert }), createFacility);
societyRouter.patch('/facilities/:id', can('facilities'), id, validate({ body: patchOf(facilityUpsert) }), updateFacility);
societyRouter.get('/bookings', can('facilities'), page, listBookingsAdmin);
societyRouter.post('/bookings/:id/decision', can('facilities'), id, validate({ body: bookingDecision }), decideBooking);
societyRouter.post('/bookings/:id/cancel', can('facilities'), id, reason, cancelBookingAdmin);

societyRouter.get('/service-requests', can('services'), page, listServiceRequestsAdmin);
societyRouter.post('/service-requests/:id/status', can('services'), id, validate({ body: serviceRequestUpdate }), updateServiceRequest);

societyRouter.get('/listings', can('listings'), page, listListingsAdmin);
societyRouter.post('/listings/property/:id/moderate', can('listings'), id, validate({ body: listingModeration }), moderateListing('property'));
societyRouter.post('/listings/marketplace/:id/moderate', can('listings'), id, validate({ body: listingModeration }), moderateListing('marketplace'));
societyRouter.post('/listings/service/:id/moderate', can('listings'), id, validate({ body: listingModeration }), moderateListing('service'));

societyRouter.get('/audit-logs', can('audit'), page, listAuditLogs);

// ---- finance ----
societyRouter.get('/charges', can('finance.read'), listCharges);
societyRouter.post('/charges', can('finance'), validate({ body: chargeUpsert }), createCharge);
societyRouter.patch('/charges/:id', can('finance'), id, validate({ body: patchOf(chargeUpsert) }), updateCharge);
societyRouter.get('/invoices', can('finance.read'), validate({ query: invoiceQuery }), listInvoices);
societyRouter.post('/invoices/generate', can('finance'), validate({ body: invoiceGenerate }), generate);
societyRouter.post('/invoices/reminders', can('finance'), sendReminders);
societyRouter.get('/invoices/:id', can('finance.read'), id, getInvoiceAdmin);
societyRouter.post('/invoices/:id/cancel', can('finance'), id, reason, cancel);
societyRouter.post('/invoices/:id/payments', can('finance'), id, validate({ body: offlinePayment }), recordPayment);
societyRouter.get('/payments', can('finance.read'), page, listPayments);
societyRouter.get('/payments/:id', can('finance.read'), id, getPaymentAdmin);
societyRouter.post('/payments/:id/reverse', can('finance'), id, reason, reversePayment);
societyRouter.post('/payments/:id/refund', can('finance'), id, validate({ body: refundRequest }), refundPayment);
societyRouter.get('/receipts/:id/pdf', can('finance.read'), id, receiptPdfAdmin);
societyRouter.get('/expenses', can('finance.read'), page, listExpenses);
societyRouter.post('/expenses', can('finance'), validate({ body: expenseCreate }), createExpense);
societyRouter.post('/expenses/:id/void', can('finance'), id, reason, voidExpense);
societyRouter.post('/income', can('finance'), validate({ body: otherIncome }), recordOtherIncome);
societyRouter.get('/ledger', can('finance.read'), page, listLedger);
societyRouter.post('/ledger/adjustments', can('finance'), validate({ body: adjustment }), postAdjustment);
societyRouter.post('/ledger/:id/reverse', can('finance'), id, reason, reverseEntry);
societyRouter.post('/ledger/opening-balance', can('finance'), validate({ body: openingBalance }), setOpeningBalance);
societyRouter.get('/reports', can('reports'), listReportTypes);
societyRouter.get('/reports/:type', can('reports'), validate({ query: reportQuery }), report);

// ======================= Master admin (platform owner) =======================
/** Personal data is masked by default in master-admin responses; the full value needs a logged "reveal". */
const maskPhone = (p) => (typeof p === 'string' && p.length >= 6 ? `${p.slice(0, 2)}${'•'.repeat(p.length - 4)}${p.slice(-2)}` : p);
const maskEmail = (e) => {
  if (typeof e !== 'string' || !e.includes('@')) return e;
  const at = e.lastIndexOf('@');
  return `${e.slice(0, Math.min(2, at))}•••${e.slice(at)}`;
};
const PERSON_KEYS = new Set(['user', 'users', 'raisedBy', 'author', 'owner', 'seller', 'payer', 'reporter', 'reportedBy', 'recordedBy', 'createdBy', 'assignedBy', 'actor', 'decidedBy', 'issuedTo', 'residents', 'resident', 'staffUser', 'provider', 'moderatedBy', 'addedBy', 'by', 'items']);
const maskPerson = (v) => {
  if (Array.isArray(v)) return v.map(maskPerson);
  if (!v || typeof v !== 'object') return v;
  const o = { ...v };
  if (typeof o.phone === 'string') o.phone = maskPhone(o.phone);
  if (typeof o.email === 'string') o.email = maskEmail(o.email);
  return o;
};
function maskTree(value) {
  if (Array.isArray(value)) return value.map(maskTree);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = PERSON_KEYS.has(k) ? maskPerson(maskTree(v)) : maskTree(v);
  return out;
}
/** Works on plain JSON (ids/dates already serialised), so Mongoose docs and ObjectIds are safe to pass. */
const maskPersonalData = (body) => maskTree(JSON.parse(JSON.stringify(body ?? null)));

const readActionReason = (req) => {
  let r = String(req.get('x-action-reason') || '');
  try {
    r = decodeURIComponent(r);
  } catch {
    /* keep raw */
  }
  r = r.trim().slice(0, 500);
  if (r.length < 3) throw new AppError(400, 'REASON_REQUIRED', 'Give a reason for this action (at least 3 characters).');
  return r;
};

/**
 * Lets the platform owner use every society-admin endpoint for ONE society, chosen by URL.
 * Same handlers, validation and state machines as society admins. Every write needs a reason and is audited.
 * Responses are passed through the personal-data mask.
 */
async function loadPlatformSociety(req, res, next) {
  if (!isObjectId(req.params.sid)) throw badRequest('Invalid society id');
  const society = await Society.findById(req.params.sid).lean();
  if (!society) throw notFound('Society');
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  const why = write ? readActionReason(req) : undefined;
  req.platformSociety = true;
  req.society = society;
  req.societyId = society._id;
  req.staff = { role: 'admin', platform: true };
  const json = res.json.bind(res);
  res.json = (body) => json(maskPersonalData(body));
  if (write) {
    const path = req.originalUrl.split('/manage')[1]?.split('?')[0] || '/';
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      audit(req, { action: 'platform.society_action', society: society._id, targetType: 'Society', targetId: society._id, summary: `${req.method} ${path} — ${why}` }).catch(() => {});
    });
  }
  next();
}

const userCard = 'name phone email status lastLoginAt createdAt platformRole';

/** Members directory across all societies. */
async function listMembers(req, res) {
  const q = req.valid.query;
  const filter = {};
  if (['pending', 'approved', 'rejected', 'suspended', 'cancelled'].includes(q.status)) filter.status = q.status;
  if (isObjectId(req.query.societyId)) filter.society = req.query.societyId;
  if (['owner', 'tenant', 'family'].includes(req.query.residentType)) filter.residentType = req.query.residentType;
  if (q.q) {
    const rx = new RegExp(escapeRegex(q.q), 'i');
    const [users, flats] = await Promise.all([
      User.find({ $or: [{ name: rx }, { phone: rx }, { email: rx }] }).select('_id').limit(1000).lean(),
      Flat.find({ number: q.q.toUpperCase(), ...(filter.society ? { society: filter.society } : {}) }).select('_id').limit(1000).lean(),
    ]);
    filter.$or = [{ user: { $in: users.map((u) => u._id) } }, { flat: { $in: flats.map((f) => f._id) } }];
  }
  const page = await pagedFind(SocietyMembership, filter, q, {
    sortable: ['createdAt', 'decidedAt'],
    populate: [{ path: 'user', select: userCard }, { path: 'society', select: 'name code city status' }, { path: 'building', select: 'name' }, { path: 'flat', select: 'number' }],
  });
  res.json(maskPersonalData(page));
}

/** Full 360° profile of one person. */
async function getUserProfile(req, res) {
  const user = await User.findById(req.valid.params.id).lean();
  if (!user) throw notFound('User');
  const uid = user._id;
  const [memberships, occupancies, staff, sessions, complaints, payments, invoices, bookings, posts, propertyListings, marketListings, serviceOffers, notifications, auditEntries] = await Promise.all([
    SocietyMembership.find({ user: uid }).sort({ createdAt: -1 }).populate('society', 'name code city status').populate('building', 'name').populate('flat', 'number').populate('decidedBy', 'name').lean(),
    PropertyOccupancy.find({ user: uid }).sort({ startDate: -1 }).populate('society', 'name').populate('flat', 'number').lean(),
    SocietyStaff.find({ user: uid }).populate('society', 'name code status').lean(),
    UserSession.find({ user: uid, revokedAt: null, expiresAt: { $gt: new Date() } }).select('client deviceName ip userAgent createdAt lastUsedAt expiresAt').sort({ lastUsedAt: -1 }).lean(),
    Complaint.find({ raisedBy: uid }).select('ticketNumber title status priority society createdAt').sort({ createdAt: -1 }).limit(20).populate('society', 'name').lean(),
    Payment.find({ payer: uid }).select('amountPaise status channel method society createdAt').sort({ createdAt: -1 }).limit(20).populate('society', 'name').lean(),
    SocietyMembership.distinct('flat', { user: uid, status: { $in: ['approved', 'suspended'] } }).then((flats) =>
      MaintenanceInvoice.find({ flat: { $in: flats }, active: true }).select('invoiceNumber period totalPaise paidPaise status dueDate society flat').sort({ period: -1 }).limit(24).populate('flat', 'number').lean({ virtuals: true }),
    ),
    FacilityBooking.find({ user: uid }).select('facility date start end status society').sort({ start: -1 }).limit(20).populate('facility', 'name').lean(),
    CommunityPost.countDocuments({ author: uid }),
    PropertyListing.countDocuments({ owner: uid }),
    MarketplaceListing.countDocuments({ seller: uid }),
    ServiceOffer.countDocuments({ provider: uid, moderationStatus: { $ne: "removed" } }),
    Notification.find({ user: uid }).select('type title createdAt readAt').sort({ createdAt: -1 }).limit(15).lean(),
    SocietyMembership.distinct('_id', { user: uid }).then((mids) =>
      AuditLog.find({ $or: [{ targetId: String(uid) }, { actor: uid }, { targetType: 'SocietyMembership', targetId: { $in: mids.map(String) } }] })
        .sort({ createdAt: -1 })
        .limit(40)
        .populate('actor', 'name')
        .lean(),
    ),
  ]);
  res.json(
    maskPersonalData({
      user,
      memberships,
      occupancies,
      staff,
      sessions,
      complaints,
      payments,
      invoices,
      bookings,
      counts: { posts, propertyListings, marketListings, serviceOffers },
      notifications,
      audit: auditEntries,
    }),
  );
}

/** Shows unmasked contact details; every reveal is written to the audit log with the reason. */
async function revealUser(req, res) {
  const user = await User.findById(req.valid.params.id).select('name phone email').lean();
  if (!user) throw notFound('User');
  await audit(req, { action: 'privacy.reveal', targetType: 'User', targetId: user._id, summary: req.valid.body.reason });
  res.json({ _id: user._id, name: user.name, phone: user.phone || null, email: user.email || null });
}

const notSelfOrOwner = async (req) => {
  if (String(req.valid.params.id) === String(req.user._id)) throw forbidden('Use your own account settings for your account');
  const u = await User.findById(req.valid.params.id);
  if (!u) throw notFound('User');
  if (u.platformRole === 'super_admin') throw forbidden('Platform administrator accounts cannot be changed here');
  return u;
};

/** Owner sets a new password for a person (no SMS/OTP yet). All their devices are signed out. */
async function setUserPassword(req, res) {
  const u = await notSelfOrOwner(req);
  const { password, reason } = req.valid.body;
  validatePasswordStrength(password);
  u.passwordHash = await hashPassword(password);
  u.passwordChangedAt = new Date();
  u.failedLoginCount = 0;
  u.lockedUntil = undefined;
  if (u.status === 'pending_setup') u.status = 'active';
  await u.save();
  await revokeAllSessions(u._id, 'admin_password_set');
  await audit(req, { action: 'user.password_set_by_admin', targetType: 'User', targetId: u._id, summary: reason });
  res.json({ ok: true });
}

async function signOutUserEverywhere(req, res) {
  const u = await notSelfOrOwner(req);
  const { modifiedCount } = await UserSession.updateMany({ user: u._id, revokedAt: null }, { revokedAt: new Date(), revokedReason: 'admin_sign_out' });
  await audit(req, { action: 'user.signed_out_everywhere', targetType: 'User', targetId: u._id, summary: req.valid.body.reason });
  res.json({ ok: true, sessionsEnded: modifiedCount });
}

async function changeUserPhone(req, res) {
  const u = await notSelfOrOwner(req);
  const { phone: next, reason } = req.valid.body;
  if (u.phone === next) throw badRequest('This is already the account phone number');
  if (await User.exists({ phone: next, _id: { $ne: u._id } })) throw conflict('Another account already uses this mobile number');
  const previous = u.phone;
  u.phone = next;
  u.phoneVerifiedAt = undefined;
  await u.save();
  await revokeAllSessions(u._id, 'admin_phone_changed');
  await audit(req, { action: 'user.phone_changed', targetType: 'User', targetId: u._id, summary: reason, changes: { from: maskPhone(previous), to: maskPhone(next) } });
  res.json({ ok: true });
}

/** Move a live membership to another flat of the same society (keeps history in PropertyOccupancy). */
async function moveMembership(req, res) {
  const { flatId, residentType, reason } = req.valid.body;
  const m = await SocietyMembership.findById(req.valid.params.id).populate('flat', 'number').populate('building', 'name');
  if (!m) throw notFound('Membership');
  if (!['pending', 'approved', 'suspended'].includes(m.status)) throw badRequest(`Cannot move a ${m.status} membership`);
  const flat = await Flat.findOne({ _id: flatId, society: m.society, active: true }).populate('building', 'name');
  if (!flat) throw badRequest('Choose an active flat in the same society');
  if (String(flat._id) === String(m.flat._id) && (!residentType || residentType === m.residentType)) throw badRequest('Nothing to change');
  if (String(flat._id) !== String(m.flat._id) && (await SocietyMembership.exists({ user: m.user, flat: flat._id, live: true }))) throw conflict('This person already has a membership for that flat');
  const from = `${m.building?.name || ''} ${m.flat?.number || ''}`.trim();
  const kind = residentType || m.residentType;
  m.flat = flat._id;
  m.building = flat.building._id;
  m.residentType = kind;
  await m.save();
  if (m.status !== 'pending') {
    await PropertyOccupancy.updateMany({ membership: m._id, active: true }, { active: false, endDate: new Date() });
    await PropertyOccupancy.create({ society: m.society, flat: flat._id, user: m.user, membership: m._id, kind });
    await Flat.updateOne({ _id: flat._id, occupancy: 'vacant' }, { occupancy: kind === 'tenant' ? 'rented' : 'owner_occupied' });
  }
  await audit(req, { action: 'membership.moved', society: m.society, targetType: 'SocietyMembership', targetId: m._id, summary: `${from} → ${flat.building?.name || ''} ${flat.number} (${kind}): ${reason}` });
  notifyUsers([m.user], { society: m.society, type: 'membership', title: 'Your flat details were updated', body: `You are now listed at ${flat.building?.name || ''} ${flat.number}.`, route: 'Home' }).catch(() => {});
  res.json({ _id: m._id, flat: flat._id, building: flat.building._id, residentType: kind });
}

/** Platform dashboard: KPIs + trends + "needs attention" + top societies. */
async function masterOverview(req, res) {
  const now = new Date();
  const monthsBack = (n) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
  const since6 = monthsBack(5);
  const old3d = new Date(Date.now() - 3 * 86400_000);
  const old14d = new Date(Date.now() - 14 * 86400_000);
  const monthKey = { $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: '+05:30' } };
  const [residentTrend, complaintTrend, resolvedTrend, collectionTrend, staleApplications, staleComplaints, societiesNoAdmin, bySize, byDues, byComplaints] = await Promise.all([
    User.aggregate([{ $match: { platformRole: 'user', createdAt: { $gte: since6 } } }, { $group: { _id: monthKey, n: { $sum: 1 } } }]),
    Complaint.aggregate([{ $match: { createdAt: { $gte: since6 } } }, { $group: { _id: monthKey, n: { $sum: 1 } } }]),
    Complaint.aggregate([{ $match: { status: { $in: ['resolved', 'closed'] }, updatedAt: { $gte: since6 } } }, { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$updatedAt', timezone: '+05:30' } }, n: { $sum: 1 } } }]),
    MaintenanceInvoice.aggregate([{ $match: { active: true, period: { $gte: istDay(since6).slice(0, 7) } } }, { $group: { _id: '$period', billed: { $sum: '$totalPaise' }, collected: { $sum: '$paidPaise' } } }]),
    SocietyRegistration.find({ status: { $in: ['submitted', 'under_review'] }, submittedAt: { $lte: old3d } }).select('societyName city referenceCode submittedAt status').sort({ submittedAt: 1 }).limit(10).lean(),
    Complaint.find({ status: { $in: ['pending', 'assigned', 'in_progress'] }, createdAt: { $lte: old14d } }).select('ticketNumber title status society createdAt').sort({ createdAt: 1 }).limit(10).populate('society', 'name').lean(),
    Society.aggregate([
      { $match: { status: 'active' } },
      { $lookup: { from: 'societystaffs', let: { s: '$_id' }, pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$society', '$$s'] }, { $eq: ['$role', 'admin'] }, { $eq: ['$status', 'active'] }] } } }, { $limit: 1 }], as: 'admins' } },
      { $match: { admins: { $size: 0 } } },
      { $project: { name: 1, code: 1, city: 1 } },
      { $limit: 10 },
    ]),
    SocietyMembership.aggregate([{ $match: { status: 'approved' } }, { $group: { _id: '$society', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]),
    MaintenanceInvoice.aggregate([
      { $match: { active: true, status: { $in: ['unpaid', 'partially_paid'] } } },
      { $group: { _id: '$society', duePaise: { $sum: { $subtract: ['$totalPaise', '$paidPaise'] } }, billedPaise: { $sum: '$totalPaise' } } },
      { $sort: { duePaise: -1 } },
      { $limit: 10 },
    ]),
    Complaint.aggregate([{ $match: { status: { $in: ['pending', 'assigned', 'in_progress'] } } }, { $group: { _id: '$society', n: { $sum: 1 } } }, { $sort: { n: -1 } }, { $limit: 10 }]),
  ]);
  const ids = [...new Set([...bySize, ...byDues, ...byComplaints].map((x) => String(x._id)))];
  const names = Object.fromEntries((await Society.find({ _id: { $in: ids } }).select('name code city').lean()).map((s) => [String(s._id), s]));
  const named = (rows, field) => rows.map((r) => ({ society: names[String(r._id)] || { _id: r._id, name: 'Unknown' }, [field]: r[field] ?? r.n, ...(r.billedPaise !== undefined ? { billedPaise: r.billedPaise } : {}) }));
  const months = Array.from({ length: 6 }, (_, i) => istDay(monthsBack(5 - i)).slice(0, 7));
  const series = (rows, f = 'n') => months.map((m) => rows.find((r) => r._id === m)?.[f] || 0);
  res.json({
    months,
    trends: {
      newResidents: series(residentTrend),
      complaintsOpened: series(complaintTrend),
      complaintsResolved: series(resolvedTrend),
      billedPaise: series(collectionTrend, 'billed'),
      collectedPaise: series(collectionTrend, 'collected'),
    },
    attention: { staleApplications, staleComplaints, societiesWithoutAdmin: societiesNoAdmin },
    top: { bySize: named(bySize, 'residents'), byDues: named(byDues, 'duePaise'), byOpenComplaints: named(byComplaints, 'openComplaints') },
  });
}

const reasonedPassword = z.object({ password: z.string().min(10).max(200), reason: text(500, 3) });
const reasonedPhone = z.object({ phone, reason: text(500, 3) });
const membershipMove = z.object({ flatId: objectId, residentType: z.enum(['owner', 'tenant', 'family']).optional(), reason: text(500, 3) });

/** Super Admin routes. */
const platformRouter = Router();
platformRouter.use(authenticate, requireSuperAdmin);

platformRouter.get('/overview', overview);
platformRouter.get('/overview/insights', masterOverview);
// Society 360°: every society-admin endpoint, for the society in the URL (reason header required for writes).
platformRouter.use('/societies/:sid/manage', loadPlatformSociety, societyRouter);
platformRouter.get('/members', page, listMembers);
platformRouter.get('/users/:id/profile', id, getUserProfile);
platformRouter.post('/users/:id/reveal', id, reason, revealUser);
platformRouter.post('/users/:id/password', id, validate({ body: reasonedPassword }), setUserPassword);
platformRouter.post('/users/:id/sign-out-all', id, reason, signOutUserEverywhere);
platformRouter.post('/users/:id/phone', id, validate({ body: reasonedPhone }), changeUserPhone);
platformRouter.post('/memberships/:id/move', id, validate({ body: membershipMove }), moveMembership);
platformRouter.get('/society-registrations', page, listRegistrations);
platformRouter.get('/society-registrations/:id', id, getRegistration);
platformRouter.post('/society-registrations/:id/review', id, markUnderReview);
platformRouter.post('/society-registrations/:id/approve', id, validate({ body: decision }), approveRegistration);
platformRouter.post('/society-registrations/:id/reject', id, reason, rejectRegistration);

platformRouter.get('/societies', page, listSocieties);
platformRouter.get('/societies/:id', id, getSociety);
platformRouter.post('/societies/:id/suspend', id, reason, setSocietyStatus('suspended'));
platformRouter.post('/societies/:id/reactivate', id, validate({ body: decision }), setSocietyStatus('active'));
platformRouter.patch('/societies/:id/payments', id, validate({ body: societyPayments }), updateSocietyPayments);
platformRouter.post('/societies/:id/admins', id, validate({ body: adminCreate }), addSocietyAdmin);
platformRouter.post('/staff/:id/reset-link', id, issueStaffSetupLink);

platformRouter.get('/users', page, listUsers);
platformRouter.post('/users/:id/:status', id, validate({ body: decision }), setUserStatus);

platformRouter.get('/listings', page, listAllListings);
platformRouter.post('/listings/property/:id/moderate', id, validate({ body: listingModeration }), moderateAnyListing('property'));
platformRouter.post('/listings/marketplace/:id/moderate', id, validate({ body: listingModeration }), moderateAnyListing('marketplace'));
platformRouter.post('/listings/service/:id/moderate', id, validate({ body: listingModeration }), moderateAnyListing('service'));
platformRouter.get('/content-reports', page, listAllReports);

platformRouter.get('/categories', listCategories);
platformRouter.post('/categories', validate({ body: categoryUpsert }), createCategory);
platformRouter.patch('/categories/:id', id, validate({ body: patchOf(categoryUpsert) }), updateCategory);

platformRouter.get('/announcements', page, listPlatformAnnouncements);
platformRouter.post('/announcements', validate({ body: announcementCreate }), createPlatformAnnouncement);
platformRouter.post('/announcements/:id/archive', id, archivePlatformAnnouncement);

platformRouter.get('/settings', listSettings);
platformRouter.put('/settings/:key', validate({ body: platformSetting$1 }), updateSetting);
platformRouter.get('/audit-logs', page, listAudit);
platformRouter.get('/payments', page, listPaymentsPlatform);

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY);

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/health' },
      serializers: {
        req: (req) => ({ method: req.method, url: req.url.replace(/([?&](sig|token)=)[^&]+/g, '$1[REDACTED]') }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, cb) {
        // Native apps send no Origin header; browsers must be on the allowlist.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return cb(null, true);
        return cb(null, false);
      },
      credentials: false,
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Society-Id'],
      exposedHeaders: ['Content-Disposition'],
      maxAge: 600,
    }),
  );
  app.use(compression());

  // Liveness and readiness.
  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: Math.round(process.uptime()) }));
  app.get('/ready', (_req, res) => {
    const ready = isDatabaseReady();
    res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', database: ready ? 'connected' : 'disconnected' });
  });

  // Payment webhooks must see the exact raw bytes for signature verification — mounted before express.json().
  app.post('/api/v1/payments/webhook/razorpay', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const outcome = await handleWebhook(req.body, req.get('x-razorpay-signature'), req.get('x-razorpay-event-id'));
    res.json({ ok: true, outcome });
  });

  app.use(express.json({ limit: '200kb' }));
  app.use(globalLimiter);

  app.get('/media/:id', serveMedia);

  app.use('/api/v1', router);
  app.use('/api/v1/resident', residentRouter);
  app.use('/api/v1/society', societyRouter);
  app.use('/api/v1/platform', platformRouter);
  app.use('/api/v1', listingsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

const TICK_MS = 5 * 60_000;
let timer = null;

/**
 * Claim a job run exactly once across restarts and multiple backend instances.
 * Returns false if another run already claimed the key.
 */
async function claim(key) {
  try {
    await JobLock.create({ key });
    return true;
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

async function finish(key, status, detail) {
  if (status === 'failed') {
    // Release the lock so the next tick retries; the underlying operations are idempotent.
    await JobLock.deleteOne({ key });
    logger.error({ key, detail }, 'Scheduled job failed; will retry');
    return;
  }
  await JobLock.updateOne({ key }, { status, detail, finishedAt: new Date() });
}

async function runAutoBilling(now = new Date()) {
  const period = currentPeriod(now);
  const day = Number(istDay(now).slice(8, 10));
  const societies = await Society.find({ status: 'active', 'billing.autoGenerate': true, 'billing.generateOnDay': { $lte: day } }).select('_id').lean();
  for (const s of societies) {
    const key = `billing:${s._id}:${period}`;
    if (!(await claim(key))) continue;
    try {
      const r = await generateInvoices(s._id, period, {});
      await finish(key, 'done', `${r.created} created`);
    } catch (err) {
      await finish(key, 'failed', err.message);
    }
  }
}

/** Due-soon (3 days before), due-day and overdue (+3, +10 days) reminders; each sent once per invoice. */
async function runReminders(now = new Date()) {
  const open = await MaintenanceInvoice.find({ active: true, status: { $in: ['unpaid', 'partially_paid'] }, dueDate: { $gt: new Date(now.getTime() - 11 * 86400_000), $lt: new Date(now.getTime() + 3 * 86400_000) } }).lean();
  for (const inv of open) {
    const days = Math.ceil((inv.dueDate - now) / 86400_000);
    const stage = days >= 2 && days <= 3 ? 'due_soon' : days >= 0 && days <= 1 ? 'due_today' : days <= -2 && days >= -4 ? 'overdue_3' : days <= -10 ? 'overdue_10' : null;
    if (!stage) continue;
    if (!(await claim(`reminder:${inv._id}:${stage}`))) continue;
    const balance = inv.totalPaise - inv.paidPaise;
    await notifyFlatResidents(inv.society, inv.flat, {
      type: 'reminder',
      title: stage.startsWith('overdue') ? 'Maintenance payment overdue' : stage === 'due_today' ? 'Maintenance due today' : 'Maintenance due soon',
      body: `${formatINR(balance)} for ${periodLabel(inv.period)}.`,
      route: 'Invoice',
      id: inv._id,
    }).catch((err) => logger.warn({ err: err.message }, 'Reminder failed'));
  }
}

async function runDaily(now = new Date()) {
  const key = `daily:${istDay(now)}`;
  if (!(await claim(key))) return;
  try {
    const societies = await Society.find({ status: 'active', 'billing.lateFeePaise': { $gt: 0 } }).select('_id').lean();
    let fees = 0;
    for (const s of societies) fees += await applyLateFees(s._id, now);
    const closed = await Poll.updateMany({ status: 'open', closesAt: { $lt: now } }, { status: 'closed' });
    await finish(key, 'done', `lateFees=${fees} pollsClosed=${closed.modifiedCount}`);
  } catch (err) {
    await finish(key, 'failed', err.message);
  }
}

async function tick() {
  const now = new Date();
  for (const job of [runAutoBilling, runReminders, runDaily]) {
    try {
      await job(now);
    } catch (err) {
      logger.error({ job: job.name, err: err.message }, 'Scheduler job error');
    }
  }
}

function startScheduler() {
  if (timer) return;
  setTimeout(() => tick().catch(() => {}), 10_000).unref();
  timer = setInterval(() => tick().catch(() => {}), TICK_MS);
  timer.unref();
  logger.info('Background scheduler started');
}

function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Default platform categories (configuration, not records). Inserted only when a kind has none. */
const DEFAULT_CATEGORIES = {
  complaint: ['Water Supply', 'Electricity', 'Lift Maintenance', 'Plumbing & Drainage', 'Security', 'Cleaning & Sanitation', 'Parking', 'Waste Management', 'Common Area Maintenance', 'Road Damage', 'Other'],
  service: ['Plumber', 'Electrician', 'Carpenter', 'Housekeeping', 'Pest Control', 'Appliance Repair', 'Painting', 'Gardening'],
  marketplace: ['Furniture', 'Electronics', 'Home Appliances', 'Books', 'Vehicles', 'Kids & Toys', 'Sports & Fitness', 'Household', 'Other'],
};
const ICONS = { 'Water Supply': 'water', Electricity: 'flash', 'Lift Maintenance': 'swap-vertical', Security: 'shield-checkmark', Parking: 'car', Plumber: 'build', Electrician: 'flash', Furniture: 'bed', Electronics: 'phone-portrait', Books: 'book', Vehicles: 'bicycle' };

async function ensureDefaults() {
  const summary = {};
  for (const [kind, names] of Object.entries(DEFAULT_CATEGORIES)) {
    const count = await ServiceCategory.countDocuments({ kind, society: null });
    if (count) {
      summary[kind] = `kept ${count} existing`;
      continue;
    }
    await ServiceCategory.insertMany(names.map((name, i) => ({ kind, name, society: null, sortOrder: i, icon: ICONS[name] })));
    summary[kind] = `inserted ${names.length}`;
  }
  return summary;
}

// ============================================================================================
// Entry point + command line. Usage:
//   node server.js                         start the API (default)
//   node server.js db:init                 sync indexes + insert default categories (if none)
//   node server.js create-super-admin --email you@example.com --name "Name"
//                                          password from SUPER_ADMIN_PASSWORD or a hidden prompt
//   node server.js check-secrets           fail if backend secrets leak into AddaApp/SocialPanel
//   node server.js dev:db                  local in-memory MongoDB on :27027 (dev only)
// ============================================================================================

// ---------------------------------------------------------------------------------- server
async function startServer() {
  await connectDatabase();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV, otp: env.OTP_PROVIDER, payments: env.paymentsConfigured ? 'razorpay' : 'unavailable' }, 'AddaApp API listening');
  });
  server.headersTimeout = 65_000;
  server.requestTimeout = 60_000;
  if (env.JOBS_ENABLED) startScheduler();

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down gracefully');
    stopScheduler();
    const force = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 15_000);
    force.unref();
    server.close(async () => {
      await disconnectDatabase().catch(() => {});
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => logger.error({ reason: reason?.message || String(reason) }, 'Unhandled promise rejection'));
}

// ---------------------------------------------------------------------------------- db:init
/** Idempotent: builds indexes and inserts default categories only when none exist. Creates no users or records. */
async function dbInit() {
  await connectDatabase();
  const synced = [];
  for (const model of Object.values(models)) {
    if (model?.prototype instanceof mongoose.Model) {
      await model.syncIndexes();
      synced.push(model.modelName);
    }
  }
  console.log(`Indexes synced for ${synced.length} collections.`);
  console.log('Default categories:', await ensureDefaults());
  await mongoose.disconnect();
}

// ---------------------------------------------------------------------------------- create-super-admin
function cliArg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? s : '*');
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

/** Server-side Super Admin bootstrap. No default password and no HTTP endpoint. Re-running resets the password. */
async function createSuperAdmin() {
  const email = cliArg('email')?.trim().toLowerCase();
  const name = cliArg('name')?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Provide --email <address>');
  let password = process.env.SUPER_ADMIN_PASSWORD;
  if (!password) {
    password = await promptHidden('New super admin password (min 10 chars, letters + numbers): ');
    const confirm = await promptHidden('Confirm password: ');
    if (password !== confirm) throw new Error('Passwords do not match');
  }
  validatePasswordStrength(password);

  await connectDatabase();
  let user = await User.findOne({ email });
  if (user && user.platformRole !== 'super_admin') {
    throw new Error('That email belongs to an existing non-admin account. Use a dedicated email for the super admin.');
  }
  const passwordHash = await hashPassword(password);
  if (user) {
    user.passwordHash = passwordHash;
    user.status = 'active';
    user.failedLoginCount = 0;
    user.lockedUntil = undefined;
    if (name) user.name = name;
    await user.save();
    await revokeAllSessions(user._id, 'password_reset_cli');
    console.log(`Super admin ${email} password reset; existing sessions revoked.`);
  } else {
    user = await User.create({ email, name: name || 'Platform Admin', passwordHash, platformRole: 'super_admin', status: 'active' });
    console.log(`Super admin ${email} created.`);
  }
  await audit({ user, ip: 'cli' }, { action: 'platform.super_admin_bootstrap', targetType: 'User', targetId: user._id, summary: email });
  await mongoose.disconnect();
}

// ---------------------------------------------------------------------------------- check-secrets
function checkSecrets() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const clientDirs = ['Adda_App', 'AddaApp', 'SocialPanel', 'Admin_Panel'].map((d) => path.join(root, d)).filter((d) => fs$1.existsSync(d));
  const SKIP = new Set(['node_modules', '.expo', 'android', 'ios', '.git', 'dist']);
  const PATTERNS = [
    [/mongodb(\+srv)?:\/\/[^\s'"]+/i, 'MongoDB connection string'],
    [/JWT_(ACCESS|REFRESH)_SECRET/, 'JWT secret variable'],
    [/PAYMENT_(SECRET_KEY|WEBHOOK_SECRET)/, 'Payment secret variable'],
    [/OTP_PROVIDER_API_KEY|OTP_HASH_SECRET/, 'OTP secret variable'],
    [/EXPO_PUBLIC_[A-Z_]*(SECRET|PASSWORD|MONGO)/, 'Secret exposed via EXPO_PUBLIC_'],
    [/VITE_[A-Z_]*(SECRET|PASSWORD|MONGO)/, 'Secret exposed via VITE_'],
  ];
  const findings = [];
  const walk = (dir) => {
    for (const entry of fs$1.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|tsx?|json|html)$/.test(entry.name) || entry.name.startsWith('.env')) {
        const text = fs$1.readFileSync(full, 'utf8');
        for (const [rx, label] of PATTERNS) if (rx.test(text)) findings.push(`${path.relative(root, full)}: ${label}`);
      }
    }
  };
  clientDirs.forEach(walk);
  if (findings.length) {
    console.error('Secret leak check FAILED:\n' + findings.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log(`Secret leak check passed (${clientDirs.map((d) => path.basename(d)).join(', ') || 'no client dirs'}).`);
}

// ---------------------------------------------------------------------------------- dev:db
async function devDatabase() {
  if (env.isProd) throw new Error('dev:db is for local development only');
  const { MongoMemoryReplSet } = await import('mongodb-memory-server');
  const port = Number(process.env.DEV_DB_PORT || 27027);
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, name: 'rs0', storageEngine: 'wiredTiger' }, instanceOpts: [{ port }] });
  console.log(`Dev MongoDB ready: mongodb://127.0.0.1:${port}/?replicaSet=rs0  (data is discarded on exit)`);
  const stop = async () => {
    await replSet.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

// ---------------------------------------------------------------------------------- dispatch
const COMMANDS = { 'db:init': dbInit, 'create-super-admin': createSuperAdmin, 'check-secrets': checkSecrets, 'dev:db': devDatabase };

// ADDA_NO_AUTOSTART lets the module be imported without starting anything.
if (!process.env.ADDA_NO_AUTOSTART) {
  const command = COMMANDS[process.argv[2]];
  Promise.resolve()
    .then(() => (command ? command() : startServer()))
    .catch(async (err) => {
      logger.fatal({ err: err.message }, command ? `${process.argv[2]} failed` : 'Failed to start server');
      if (command) console.error(`${process.argv[2]} failed: ${err.message}`);
      await mongoose.disconnect().catch(() => {});
      process.exit(1);
    });
}

export { BCRYPT_ROUNDS, __setPaymentProvider, adminPasswordLogin, applyLateFees, applyToInvoice, audit, auditHash, balanceBefore, canTransition, cancelInvoice, completePasswordSetup$1 as completePasswordSetup, computeInvoiceLines, confirmCheckout, connectDatabase, createApp, createSession, defaultDueDate, disconnectDatabase, ensureDefaults, env, financialYear, flatOutstanding, generateInvoices, handleWebhook, hashPassword, initiateOnlinePayment, issuePasswordSetupToken, ledgerTotals, markCaptured, markFailed, models, nextSequence, otpStatus$1 as otpStatus, paymentAvailability, postLedgerEntry, recordOfflinePayment, requestGatewayRefund, requestOtp$1 as requestOtp, reverseLedgerEntry, reverseOfflinePayment, revokeAllSessions, revokeSession, rotateRefreshToken, signAccessToken, sumLines, unapplyFromInvoice, validatePasswordStrength, verifyOtp$1 as verifyOtp, verifyPassword };
