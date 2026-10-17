// src/persistence/database.ts
import { DatabaseSync } from "node:sqlite";
export function openDatabase(path) {
    const dbPath = path ?? process.env.DESH_DB_PATH ?? "./desh-sub-dispatch.db";
    const db = new DatabaseSync(dbPath);
    db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      config TEXT NOT NULL,
      concurrency INTEGER,
      tags TEXT,
      createdAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      agentId TEXT NOT NULL,
      input TEXT,
      priority INTEGER,
      timeoutMs INTEGER,
      retries INTEGER,
      retryDelayMs INTEGER,
      dependencies TEXT,
      metadata TEXT,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      result TEXT,
      createdAt INTEGER NOT NULL,
      startedAt INTEGER,
      finishedAt INTEGER,
      cancelRequested INTEGER
    );
  `);
    return db;
}
//# sourceMappingURL=database.js.map