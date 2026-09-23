/**
 * ==============================================================================
 * TỆP TIN: js/core/EventBus.js
 * LỚP: EventBus
 * MÔ TẢ:
 *   Bộ điều vận sự kiện trung tâm (Publish/Subscribe Event Bus):
 *   - Giúp các Class/Controller giao tiếp độc lập, không phụ thuộc cứng vào nhau.
 *   - Cung cấp các phương thức: on(event, fn), off(event, fn), emit(event, data).
 * ==============================================================================
 */

export class EventBus {
  constructor() {
    this.events = new Map();
  }

  on(eventName, listener) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }
    this.events.get(eventName).add(listener);
    return () => this.off(eventName, listener);
  }

  off(eventName, listener) {
    if (!this.events.has(eventName)) return;
    this.events.get(eventName).delete(listener);
    if (this.events.get(eventName).size === 0) {
      this.events.delete(eventName);
    }
  }

  emit(eventName, data) {
    if (!this.events.has(eventName)) return;
    for (const listener of this.events.get(eventName)) {
      try {
        listener(data);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${eventName}":`, err);
      }
    }
  }
}
