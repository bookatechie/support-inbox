/**
 * File storage service for attachments
 * Supports both local file system and AWS S3 storage
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logger interface for Pino/Fastify logger compatibility
interface Logger {
  info: (objOrMsg: object | string, msg?: string) => void;
  error: (objOrMsg: object | string, msg?: string) => void;
  debug: (objOrMsg: object | string, msg?: string) => void;
}

let logger: Logger | null = null;

/**
 * Set the logger for this module
 */
export function setFileStorageLogger(log: Logger): void {
  logger = log;
}

// Configuration
const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR || path.join(__dirname, '../../../data/attachments');

// S3 Configuration (if all required S3 env vars are present, use S3, otherwise use local storage)
const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION || 'us-east-1';
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_PREFIX = process.env.S3_PREFIX || 'support-inbox/attachments';

// Auto-detect S3: if bucket and credentials exist, use S3
const USE_S3 = !!(S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY);

/**
 * Storage backend interface
 */
interface StorageBackend {
  save(filename: string, content: Buffer, ticketId: number): Promise<string>;
  read(path: string): Promise<Buffer>;
  delete(path: string): Promise<void>;
  deleteTicketFiles(ticketId: number): Promise<void>;
}

/**
 * Local file system storage implementation
 */
class LocalStorage implements StorageBackend {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async ensureDirectory(): Promise<void> {
    try {
      await fs.access(this.baseDir);
    } catch {
      await fs.mkdir(this.baseDir, { recursive: true });
      logger?.info({ dir: this.baseDir }, 'Created attachments directory');
    }
  }

  async save(filename: string, content: Buffer, ticketId: number): Promise<string> {
    await this.ensureDirectory();

    // Create ticket-specific subdirectory
    const ticketDir = path.join(this.baseDir, `ticket-${ticketId}`);
    await fs.mkdir(ticketDir, { recursive: true });

    // Generate UUID-based filename
    const safeFilename = generateSafeFilename(filename);
    const filePath = path.join(ticketDir, safeFilename);

    // Write file
    await fs.writeFile(filePath, content);

    // Return relative path (for database storage)
    return path.join(`ticket-${ticketId}`, safeFilename);
  }

  async read(relativePath: string): Promise<Buffer> {
    const fullPath = path.join(this.baseDir, relativePath);
    return await fs.readFile(fullPath);
  }

  async delete(relativePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, relativePath);
    await fs.unlink(fullPath);
  }

  async deleteTicketFiles(ticketId: number): Promise<void> {
    const ticketDir = path.join(this.baseDir, `ticket-${ticketId}`);
    try {
      await fs.rm(ticketDir, { recursive: true, force: true });
      logger?.info({ ticketId }, 'Deleted attachments directory for ticket');
    } catch {
      logger?.debug({ ticketId }, 'No attachments directory found for ticket');
    }
  }

  getFullPath(relativePath: string): string {
    return path.join(this.baseDir, relativePath);
  }
}

/**
 * AWS S3 storage implementation
 */
class S3Storage implements StorageBackend {
  private client: S3Client;
  private bucket: string;
  private prefix: string;

  constructor(config: {
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    prefix: string;
  }) {
    this.bucket = config.bucket;
    this.prefix = config.prefix;
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async save(filename: string, content: Buffer, ticketId: number): Promise<string> {
    // Generate UUID-based filename
    const safeFilename = generateSafeFilename(filename);

    // S3 key format: support-inbox/attachments/ticket-123/uuid.ext
    const key = `${this.prefix}/ticket-${ticketId}/${safeFilename}`;

    // Get MIME type from extension
    const mimeType = getMimeType(filename);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: mimeType,
      })
    );

    logger?.info({ bucket: this.bucket, key }, 'Uploaded to S3');

    // Return S3 key as the "path" (for database storage)
    return key;
  }

  async read(s3Key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      })
    );

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async delete(s3Key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      })
    );
    logger?.info({ bucket: this.bucket, key: s3Key }, 'Deleted from S3');
  }

  async deleteTicketFiles(ticketId: number): Promise<void> {
    // Note: S3 doesn't support deleting by prefix directly in a single call
    // For now, individual files are deleted via delete() when messages are removed
    // This method is a no-op for S3, but could be enhanced with ListObjectsV2 + batch delete
    logger?.debug({ ticketId }, 'S3 ticket files will be cleaned up individually');
  }
}

/**
 * Generate a safe filename with UUID to avoid collisions and prevent information leakage
 * Original filename is preserved in database for user-facing display
 */
function generateSafeFilename(originalFilename: string): string {
  // Generate a UUID for secure, collision-resistant filename
  const uuid = crypto.randomUUID();

  // Get file extension from original filename
  const ext = path.extname(originalFilename).toLowerCase();

  // Return: uuid.ext (e.g., "550e8400-e29b-41d4-a716-446655440000.pdf")
  return `${uuid}${ext}`;
}

/**
 * Get attachment MIME type from extension
 */
export function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();

  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.7z': 'application/x-7z-compressed',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

// Initialize storage backend based on configuration
let storage: StorageBackend;

if (USE_S3) {
  storage = new S3Storage({
    bucket: S3_BUCKET,
    region: S3_REGION,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    prefix: S3_PREFIX,
  });
  // Log after logger might be set (deferred logging in initFileStorage)
} else {
  storage = new LocalStorage(ATTACHMENTS_DIR);
  // Log after logger might be set (deferred logging in initFileStorage)
}

/**
 * Initialize file storage and log configuration
 * Called after logger is set
 */
export function initFileStorage(): void {
  if (USE_S3) {
    logger?.info({ bucket: S3_BUCKET, prefix: S3_PREFIX }, 'Using S3 storage');
  } else {
    logger?.info({ dir: ATTACHMENTS_DIR }, 'Using local file storage');
    // Ensure directory exists for local storage
    if (storage instanceof LocalStorage) {
      storage.ensureDirectory().catch(err => {
        logger?.error({ err }, 'Failed to create attachments directory');
      });
    }
  }
}

/**
 * Public API - delegates to the configured storage backend
 */

/**
 * Ensure attachments directory exists (only for local storage)
 */
export async function ensureAttachmentsDirectory(): Promise<void> {
  if (storage instanceof LocalStorage) {
    await storage.ensureDirectory();
  }
}

/**
 * Save attachment to storage (local or S3)
 * Returns the path/key for database storage
 */
export async function saveAttachment(
  filename: string,
  content: Buffer,
  ticketId: number
): Promise<string> {
  return await storage.save(filename, content, ticketId);
}

/**
 * Read attachment from storage (local or S3)
 */
export async function readAttachment(path: string): Promise<Buffer> {
  return await storage.read(path);
}

/**
 * Get absolute path for attachment (local storage only)
 * For S3, returns the S3 key
 */
export function getAttachmentPath(path: string): string {
  if (storage instanceof LocalStorage) {
    return storage.getFullPath(path);
  }
  // For S3, return the key as-is (used for email attachments)
  return path;
}

/**
 * Check if attachment exists (local storage only)
 */
export async function attachmentExists(path: string): Promise<boolean> {
  if (storage instanceof LocalStorage) {
    try {
      const fullPath = storage.getFullPath(path);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
  // For S3, assume it exists (could enhance with HeadObject call)
  return true;
}

/**
 * Delete attachment file
 */
export async function deleteAttachment(path: string): Promise<void> {
  await storage.delete(path);
}

/**
 * Delete entire ticket directory with all attachments
 */
export async function deleteTicketAttachments(ticketId: number): Promise<void> {
  await storage.deleteTicketFiles(ticketId);
}
