import { EventEmitter } from 'events';

class SyncEventEmitter extends EventEmitter {}

export const syncEvents = new SyncEventEmitter();

export const SYNC_EVENT_DATA_CHANGED = 'data_changed';
