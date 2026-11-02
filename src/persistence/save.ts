/**
 * Salvataggi locali in più slot, con versione dello schema. Ogni partita ha
 * il suo slot e si salva da sola a ogni passo; all'avvio si sceglie quale
 * riprendere. Il vecchio salvataggio unico viene spostato nel primo slot.
 */
import type { GameState } from '../domain/types';

const KEY = 'alto-medioevo/saves';
/** chiave del salvataggio unico delle versioni precedenti */
const OLD_KEY = 'alto-medioevo/save';
export const SAVE_SCHEMA_VERSION = 1;
export const MAX_SLOTS = 8;

export interface SaveSlot {
  id: string;
  schema: number;
  rngKind: 'c64' | 'mulberry';
  state: GameState;
  /** quando è stata salvata (ms dall'epoca) */
  savedAt: number;
}

function readAll(): SaveSlot[] {
  try {
    const raw = localStorage.getItem(KEY);
    const slots = raw ? (JSON.parse(raw) as SaveSlot[]) : [];
    // il vecchio salvataggio unico diventa uno slot
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      const data = JSON.parse(old) as Omit<SaveSlot, 'id' | 'savedAt'>;
      slots.push({ ...data, id: 'precedente', savedAt: 0 });
      localStorage.removeItem(OLD_KEY);
      writeAll(slots);
    }
    return slots.filter(s => s.schema === SAVE_SCHEMA_VERSION);
  } catch {
    return [];
  }
}

function writeAll(slots: SaveSlot[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(slots));
    return true;
  } catch {
    return false;
  }
}

/** Identificativo nuovo per una partita appena iniziata. */
export const newSlotId = () => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

/** Partite salvate, dalla più recente. */
export function listSaves(): SaveSlot[] {
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Salva la partita nel suo slot. Se gli slot sono pieni, la partita nuova
 * prende il posto di quella salvata da più tempo.
 */
export function saveGame(state: GameState, rngKind: SaveSlot['rngKind'], id = 'partita'): boolean {
  const all = readAll();
  const slots = all.filter(s => s.id !== id);
  // l'ultimo salvataggio è sempre il più recente, anche nello stesso millisecondo
  const savedAt = Math.max(Date.now(), ...all.map(s => s.savedAt + 1));
  slots.push({ id, schema: SAVE_SCHEMA_VERSION, rngKind, state, savedAt });
  slots.sort((a, b) => b.savedAt - a.savedAt);
  return writeAll(slots.slice(0, MAX_SLOTS));
}

/** La partita dello slot indicato, o la più recente. */
export function loadGame(id?: string): SaveSlot | null {
  const slots = listSaves();
  return (id ? slots.find(s => s.id === id) : slots[0]) ?? null;
}

export function deleteSave(id: string): void {
  writeAll(readAll().filter(s => s.id !== id));
}
