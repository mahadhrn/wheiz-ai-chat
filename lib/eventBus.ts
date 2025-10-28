import { EventEmitter } from 'events';

const eventBus = new EventEmitter();

// Increase the maximum number of listeners to avoid memory leak warnings
eventBus.setMaxListeners(20);

export default eventBus; 