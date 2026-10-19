import {syncedWriter,type ContextStorage} from '../store/index.ts';

// Only Connectors write Synced Context (#676): the bounded copies of Services they keep up to date. Platform's sync loop
// writes a finished snapshot through this, never through the Store's general writer, which refuses Synced.
/** The writer a Connector uses for its Service's Synced records. */
export const connectorWriter=(storage:ContextStorage,service:string)=>syncedWriter(storage,service);
