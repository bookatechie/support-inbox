/**
 * Centralized configuration management
 * Single source of truth for all environment variables and config
 */

import type { SmtpConfig, ImapConfig } from './types.js';

export interface ServerConfig {
  // Server
  port: number;
  nodeEnv: string;
  jwtSecret: string;
  serverUrl: string;

  // Authentication
  internalApiKey?: string;

  // Default Admin User
  defaultAdminEmail: string;
  defaultAdminPassword: string;
  defaultAdminName: string;

  // File Storage
  attachmentsDir: string;

  // SMTP
  smtp: SmtpConfig;

  // IMAP
  imap: ImapConfig;

  // External APIs
  customerInfoApiUrl?: string;
  aiResponseApiUrl?: string;

  // Webhooks
  webhookUrl?: string;
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): ServerConfig {
  const config: ServerConfig = {
    // Server
    port: parseInt(process.env.PORT || '3001'),
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
    serverUrl: process.env.SERVER_URL || 'http://localhost:3001',

    // Authentication
    internalApiKey: process.env.INTERNAL_API_KEY,

    // Default Admin User
    defaultAdminEmail: process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com',
    defaultAdminPassword: process.env.DEFAULT_ADMIN_PASSWORD || 'admin123',
    defaultAdminName: process.env.DEFAULT_ADMIN_NAME || 'Admin User',

    // File Storage
    attachmentsDir: process.env.ATTACHMENTS_DIR || 'data/attachments',

    // SMTP
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
      from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    },

    // IMAP
    imap: {
      user: process.env.IMAP_USER || '',
      password: process.env.IMAP_PASSWORD || '',
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT || '993'),
      tls: process.env.IMAP_TLS !== 'false',
      pollInterval: parseInt(process.env.IMAP_POLL_INTERVAL || '1') * 60 * 1000, // Convert minutes to milliseconds
    },

    // External APIs
    customerInfoApiUrl: process.env.CUSTOMER_INFO_API_URL,
    aiResponseApiUrl: process.env.AI_RESPONSE_API_URL,

    // Webhooks
    webhookUrl: process.env.WEBHOOK_URL,
  };

  // Validate critical configuration
  validateConfig(config);

  return config;
}

/**
 * Validate configuration and warn about insecure defaults
 */
function validateConfig(config: ServerConfig): void {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Production-specific checks
  if (config.nodeEnv === 'production') {
    if (config.jwtSecret === 'change-me-in-production') {
      errors.push('JWT_SECRET must be set in production');
    }

    if (config.internalApiKey === 'sk_internal_change-me-in-production' || !config.internalApiKey) {
      warnings.push('INTERNAL_API_KEY should be set with a secure value in production');
    }

    if (config.defaultAdminEmail === 'admin@example.com' || config.defaultAdminPassword === 'admin123') {
      errors.push('DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be changed in production');
    }

    if (!config.smtp.user || !config.smtp.password) {
      warnings.push('SMTP credentials not configured - email sending will fail');
    }

    if (!config.imap.user || !config.imap.password) {
      warnings.push('IMAP credentials not configured - email receiving disabled');
    }
  }

  // Port validation
  if (config.port < 1 || config.port > 65535) {
    errors.push(`Invalid PORT: ${config.port}`);
  }

  // SMTP port validation
  if (config.smtp.port < 1 || config.smtp.port > 65535) {
    errors.push(`Invalid SMTP_PORT: ${config.smtp.port}`);
  }

  // IMAP port validation
  if (config.imap.port < 1 || config.imap.port > 65535) {
    errors.push(`Invalid IMAP_PORT: ${config.imap.port}`);
  }

  // Poll interval validation (stored in milliseconds, but configured in minutes)
  const pollMinutes = config.imap.pollInterval / 60000;
  if (pollMinutes < 0.5) {
    warnings.push('IMAP poll interval < 30s may cause issues with some providers');
  }

  // Log warnings and errors
  if (warnings.length > 0) {
    console.warn('⚠️  Configuration warnings:');
    warnings.forEach(w => console.warn(`   - ${w}`));
  }

  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(e => console.error(`   - ${e}`));
    throw new Error('Invalid configuration - see errors above');
  }
}

// Export singleton instance
export const config = loadConfig();
