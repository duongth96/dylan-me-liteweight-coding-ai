export function createBus() {
  const vscode = acquireVsCodeApi();

  const handlersByType = new Map();

  function send(type, value) {
    vscode.postMessage({ type, value });
  }

  function on(type, handler) {
    const handlers = handlersByType.get(type) ?? [];
    handlers.push(handler);
    handlersByType.set(type, handlers);

    return () => {
      const current = handlersByType.get(type) ?? [];
      const next = current.filter((h) => h !== handler);
      handlersByType.set(type, next);
    };
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message.type !== "string") {
      return;
    }

    const handlers = handlersByType.get(message.type) ?? [];
    for (const handler of handlers) {
      handler(message);
    }
  });

  return { send, on };
}
