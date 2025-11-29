/**
 * Type declarations for imap-simple
 */

declare module 'imap-simple' {
  import { EventEmitter } from 'events';

  export interface ImapSimpleOptions {
    imap: {
      user: string;
      password: string;
      host: string;
      port: number;
      tls: boolean;
      tlsOptions?: {
        rejectUnauthorized?: boolean;
      };
      authTimeout?: number;
    };
    onmail?: (numNewMail: number) => void;
    onupdate?: (seqno: number, info: any) => void;
    onexpunge?: (seqno: number) => void;
  }

  export interface Message {
    attributes: {
      uid: number;
      flags: string[];
      date: Date;
      'body[]'?: string;
    };
    parts: MessagePart[];
    seqno: number;
  }

  export interface MessagePart {
    which: string;
    size: number;
    body: string | Buffer;
  }

  export interface ImapSimple extends EventEmitter {
    openBox(boxName: string): Promise<any>;
    search(criteria: any[], options: any): Promise<Message[]>;
    addFlags(source: string | number | number[], flags: string | string[]): Promise<void>;
    end(): void;
  }

  export function connect(options: ImapSimpleOptions): Promise<ImapSimple>;

  export interface ParsedHeader {
    from?: string[];
    to?: string[];
    subject?: string[];
    'message-id'?: string[];
    'in-reply-to'?: string[];
    references?: string[];
    date?: string[];
    [key: string]: string[] | undefined;
  }

  export class ImapSimpleError extends Error {
    source?: string;
    textCode?: string;
  }
}
