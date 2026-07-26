/**
 * EventEmitter - シンプルなイベントエミッター
 */
class EventEmitter {
  constructor() {
    this.handlers = new Map();
    this.handlerCount = 0;
  }
  
  on(event, handler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event).push(handler);
    this.handlerCount++;
  }
  
  emit(event, data) {
    if (this.handlers.has(event)) {
      const results = [];
      for (const handler of this.handlers.get(event)) {
        results.push(handler(data));
      }
      return results;
    }
    return [];
  }
  
  off(event, handler) {
    if (this.handlers.has(event)) {
      const handlers = this.handlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
        this.handlerCount--;
      }
    }
  }
  
  getHandlerCount() {
    return this.handlerCount;
  }
  
  getRegisteredEvents() {
    return Array.from(this.handlers.keys());
  }
}

module.exports = { EventEmitter };
EOF