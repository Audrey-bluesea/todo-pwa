import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Category, Todo, TimeEntry } from '../types';

interface MatchaDB extends DBSchema {
  categories: {
    key: string;
    value: Category;
    indexes: { createdAt: Date };
  };
  todos: {
    key: string;
    value: Todo;
    indexes: { categoryId: string; sortOrder: number };
  };
  timeEntries: {
    key: string;
    value: TimeEntry;
    indexes: { createdAt: Date };
  };
  meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = 'matcha-todo';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<MatchaDB>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<MatchaDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('categories')) {
          const s = db.createObjectStore('categories', { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('todos')) {
          const s = db.createObjectStore('todos', { keyPath: 'id' });
          s.createIndex('categoryId', 'categoryId');
          s.createIndex('sortOrder', 'sortOrder');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta');
        }
        if (!db.objectStoreNames.contains('timeEntries')) {
          const s = db.createObjectStore('timeEntries', { keyPath: 'id' });
          s.createIndex('createdAt', 'createdAt');
        }
      },
    });
  }
  return dbPromise;
}

/* ---------- categories ---------- */

export async function allCategories(): Promise<Category[]> {
  const db = await getDB();
  const list = await db.getAll('categories');
  return list.sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      +new Date(a.createdAt) - +new Date(b.createdAt),
  );
}

export async function putCategory(c: Category) {
  const db = await getDB();
  await db.put('categories', c);
}

export async function putCategories(list: Category[]) {
  const db = await getDB();
  const tx = db.transaction('categories', 'readwrite');
  for (const c of list) await tx.store.put(c);
  await tx.done;
}

export async function deleteCategory(id: string) {
  const db = await getDB();
  const tx = db.transaction(['categories', 'todos'], 'readwrite');
  await tx.objectStore('categories').delete(id);
  const todoStore = tx.objectStore('todos');
  const idx = todoStore.index('categoryId');
  let cursor = await idx.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function clearCategories() {
  const db = await getDB();
  await db.clear('categories');
}

/* ---------- todos ---------- */

export async function allTodos(): Promise<Todo[]> {
  const db = await getDB();
  const list = await db.getAll('todos');
  return list.map(reviveTodo);
}

export async function putTodo(t: Todo) {
  const db = await getDB();
  await db.put('todos', t);
}

export async function putTodos(list: Todo[]) {
  const db = await getDB();
  const tx = db.transaction('todos', 'readwrite');
  await Promise.all(list.map((t) => tx.store.put(t)));
  await tx.done;
}

export async function deleteTodo(id: string) {
  const db = await getDB();
  await db.delete('todos', id);
}

export async function clearTodos() {
  const db = await getDB();
  await db.clear('todos');
}

/* ---------- time entries（计时记录） ---------- */

export async function allTimeEntries(): Promise<TimeEntry[]> {
  const db = await getDB();
  const list = await db.getAll('timeEntries');
  return list
    .map(reviveTimeEntry)
    .sort((a, b) => +b.start - +a.start);
}

export async function putTimeEntry(e: TimeEntry) {
  const db = await getDB();
  await db.put('timeEntries', e);
}

export async function deleteTimeEntry(id: string) {
  const db = await getDB();
  await db.delete('timeEntries', id);
}

export async function clearTimeEntries() {
  const db = await getDB();
  await db.clear('timeEntries');
}

export async function putTimeEntries(list: TimeEntry[]) {
  const db = await getDB();
  const tx = db.transaction('timeEntries', 'readwrite');
  await Promise.all(list.map((e) => tx.store.put(e)));
  await tx.done;
}

function reviveTimeEntry(e: TimeEntry): TimeEntry {
  return {
    ...e,
    start: new Date(e.start),
    end: e.end ? new Date(e.end) : null,
    createdAt: new Date(e.createdAt),
  };
}

/* ---------- meta ---------- */

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return (await db.get('meta', key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown) {
  const db = await getDB();
  await db.put('meta', value, key);
}

function reviveTodo(t: Todo): Todo {
  return {
    ...t,
    dueDate: t.dueDate ? new Date(t.dueDate) : null,
    endDate: t.endDate ? new Date(t.endDate) : null,
    createdAt: new Date(t.createdAt),
  };
}
