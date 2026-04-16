import winston from "winston";

// For MCP stdio servers, only log to file to avoid interfering with JSON-RPC
const transports: winston.transport[] = [];

// Only add console logging in development or when explicitly enabled
if (process.env.NODE_ENV !== "production" || process.env.ENABLE_CONSOLE_LOGS === "true") {
  transports.push(
    new winston.transports.Console({
      stderrLevels: ["error", "warn", "info", "debug"],
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

// Always log to file if specified
if (process.env.LOG_FILE) {
  transports.push(
    new winston.transports.File({ filename: process.env.LOG_FILE })
  );
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports,
  silent: transports.length === 0, // Silent if no transports configured
});
