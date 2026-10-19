// The demo backend's database: one SQLite file (schema.sql), opened with Node's own node:sqlite, so the backend needs
// nothing installed. Queries are plain SQL with ? for their values.

import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const SCHEMA = readFileSync(new URL("schema.sql", import.meta.url), "utf8");

export class Db {
  private readonly sqlite: DatabaseSync;
  private readonly statements = new Map<string, ReturnType<DatabaseSync["prepare"]>>();

  /** The database in `file` (":memory:" for one held in memory alone), made from schema.sql when it is new. */
  constructor(file: string) {
    const fresh = file === ":memory:" || !existsSync(file);
    this.sqlite = new DatabaseSync(file);
    this.sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    if (fresh) this.sqlite.exec(SCHEMA);
  }

  private statement(sql: string) {
    let statement = this.statements.get(sql);
    if (!statement) this.statements.set(sql, (statement = this.sqlite.prepare(sql)));
    return statement;
  }

  /** Every row `sql` finds. */
  all<T>(sql: string, ...values: SQLInputValue[]): T[] {
    return this.statement(sql).all(...values) as T[];
  }

  /** The first row `sql` finds, or undefined. */
  one<T>(sql: string, ...values: SQLInputValue[]): T | undefined {
    return this.statement(sql).get(...values) as T | undefined;
  }

  /** Runs a change; the id of the row it inserted, if any. Whatever was worked out from the tables before it is forgotten. */
  run(sql: string, ...values: SQLInputValue[]): number {
    this.version++;
    this.kept.clear();
    return Number(this.statement(sql).run(...values).lastInsertRowid);
  }

  /** Counts up with every change: answers worked out at one version hold until the next. */
  version = 0;
  private readonly kept = new Map<string, unknown>();

  /** What `work` works out from the tables, worked out once until the next change. */
  memo<T>(key: string, work: () => T): T {
    if (!this.kept.has(key)) this.kept.set(key, work());
    return this.kept.get(key) as T;
  }

  /** Runs `work` as one transaction: all of it, or none of it if it throws. */
  transaction<T>(work: () => T): T {
    this.sqlite.exec("BEGIN");
    try {
      const result = work();
      this.sqlite.exec("COMMIT");
      return result;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  meta(key: string): string | undefined {
    return this.one<{ value: string }>("SELECT value FROM meta WHERE key = ?", key)?.value;
  }

  /** Your person id: the owner of the map. */
  you(): number {
    return this.one<{ id: number }>("SELECT id FROM people WHERE is_you = 1")!.id;
  }

  close(): void {
    this.sqlite.close();
  }
}
