import { sql as init } from "./0001_init";

export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [{ id: "0001_init", sql: init }];
