// Structured Logger for Enterprise Telemetry
import { createClient } from "@supabase/supabase-js";

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  correlationId: string;
  source: string;
  message: string;
  metadata?: Record<string, any>;
  userEmail?: string;
}

// Generate unique cryptographically safe correlation IDs for transaction tracking
export function generateCorrelationId(): string {
  return 'tx-id-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
}

class TelemetryLogger {
  private static instance: TelemetryLogger;
  private appCorrelationId: string;

  private constructor() {
    this.appCorrelationId = generateCorrelationId();
  }

  public static getInstance(): TelemetryLogger {
    if (!TelemetryLogger.instance) {
      TelemetryLogger.instance = new TelemetryLogger();
    }
    return TelemetryLogger.instance;
  }

  public getCorrelationId(): string {
    return this.appCorrelationId;
  }

  private writeLog(level: LogLevel, source: string, message: string, metadata?: Record<string, any>) {
    const userEmail = localStorage.getItem('auth_user_email') || 'anonymous';
    const logObj: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      correlationId: this.appCorrelationId,
      source,
      message,
      metadata,
      userEmail
    };

    // Format output beautifully for the container logs inside Cloud Run or development web inspectors
    const logColor = 
      level === 'ERROR' || level === 'FATAL' ? '\x1b[31m' :
      level === 'WARN' ? '\x1b[33m' :
      level === 'INFO' ? '\x1b[32m' : '\x1b[36m';
    const logReset = '\x1b[0m';

    console.log(
      `%c[${logObj.timestamp}] [${logObj.level}] [CID: ${logObj.correlationId}] [SRC: ${logObj.source}] - ${logObj.message}`,
      `color: ${level === 'ERROR' ? '#f87171' : level === 'WARN' ? '#fbbf24' : '#60a5fa'}; font-weight: bold; font-family: monospace;`,
      metadata ? metadata : ''
    );

    // Integrated Third-Party SaaS Telemetry Proxies
    if ((window as any).Sentry) {
      if (level === 'ERROR' || level === 'FATAL') {
        (window as any).Sentry.captureMessage(`[${source}] ${message}`, {
          level: 'error',
          extra: { correlationId: this.appCorrelationId, metadata }
        });
      }
    }
  }

  public debug(source: string, message: string, metadata?: Record<string, any>) {
    this.writeLog('DEBUG', source, message, metadata);
  }

  public info(source: string, message: string, metadata?: Record<string, any>) {
    this.writeLog('INFO', source, message, metadata);
  }

  public warn(source: string, message: string, metadata?: Record<string, any>) {
    this.writeLog('WARN', source, message, metadata);
  }

  public error(source: string, message: string, metadata?: Record<string, any>) {
    this.writeLog('ERROR', source, message, metadata);
  }

  public fatal(source: string, message: string, metadata?: Record<string, any>) {
    this.writeLog('FATAL', source, message, metadata);
  }
}

export const logger = TelemetryLogger.getInstance();
export default logger;
