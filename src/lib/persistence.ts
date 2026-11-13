import { openDB, type DBSchema } from 'idb';
import type { Collection, Settings } from '../audio/types';
interface VinylDB extends DBSchema {
  preferences: { key: string; value: Settings | Collection[] | string[] };
  files: { key: string; value: Blob };
}
let database: ReturnType<typeof openDB<VinylDB>> | undefined;
function db() { return database ??= openDB<VinylDB>('vinyl-listening-room', 1, {upgrade(db) { db.createObjectStore('preferences'); db.createObjectStore('files'); }}); }
export async function readPreference<T>(key: string): Promise<T | undefined> { return (await (await db()).get('preferences', key)) as T | undefined; }
export async function writePreference(key: string, value: Settings | Collection[] | string[]) { await (await db()).put('preferences', value, key); }
export async function saveFile(id: string, file: Blob) { await (await db()).put('files', file, id); }
export async function getFile(id: string) { return (await db()).get('files', id); }
export async function deleteFile(id: string) { await (await db()).delete('files', id); }
