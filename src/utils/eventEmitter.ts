// src/utils/eventEmitter.ts

// Make listeners a Record of string keys to array of callback functions
const listeners: Record<string, Array<(...args: any[]) => void>> = {};

// Register a callback for an event
export function on(event: string, cb: (...args: any[]) => void) {
  listeners[event] = listeners[event] || [];
  listeners[event].push(cb);
  // Return unsubscribe function
  return () => off(event, cb);
}

// Emit an event, calls all listeners
export function emit(event: string, ...args: any[]) {
  (listeners[event] || []).forEach(cb => cb(...args));
}

// Remove a listener
export function off(event: string, cb: (...args: any[]) => void) {
  if (!listeners[event]) return;
  listeners[event] = listeners[event].filter(x => x !== cb);
}
