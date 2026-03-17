/**
 * Resolve the chat/thread ID for the current TypingMind session.
 * Priority: URLSearchParams (threadId/chatId/id) > pathname (/chat/:id) > sessionStorage fallback
 * @returns {string} The resolved chat ID
 */
function getChatId() {
  // 1. Check URLSearchParams for threadId, chatId, or id
  const params = new URLSearchParams(window.location.search);
  for (const key of ['threadId', 'chatId', 'id']) {
    const value = params.get(key);
    if (value) return value;
  }

  // 2. Check pathname for /chat/:id pattern
  const pathMatch = window.location.pathname.match(/\/chat\/([^/]+)/);
  if (pathMatch && pathMatch[1]) return pathMatch[1];

  // 3. Fallback: use or generate a session-scoped ID stored in sessionStorage
  const sessionKey = 'typingmind_todos_session_id';
  let sessionId = sessionStorage.getItem(sessionKey);
  if (!sessionId) {
    // Generate a new ID - prefer crypto.randomUUID, fallback to random hex
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      sessionId = crypto.randomUUID();
    } else {
      sessionId = 'session_' + Math.random().toString(36).substring(2, 15);
    }
    sessionStorage.setItem(sessionKey, sessionId);
  }
  return sessionId;
}

/**
 * Prune stale todo lists from localStorage.
 * Deletes any typingmind_todos_* key whose updatedAt is older than 7 days.
 * Must collect keys first before deleting to avoid iteration issues.
 */
function pruneStaleTodos() {
  const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  const cutoff = Date.now() - TTL_MS;
  const keysToDelete = [];

  // Collect matching keys first (don't delete while iterating)
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('typingmind_todos_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data && typeof data.updatedAt === 'number' && data.updatedAt < cutoff) {
          keysToDelete.push(key);
        }
      } catch (e) {
        // Corrupt data - mark for deletion
        keysToDelete.push(key);
      }
    }
  }

  // Delete collected keys
  for (const key of keysToDelete) {
    localStorage.removeItem(key);
  }
}

/**
 * Main todo_write implementation.
 * @param {Object} params - The parameters object
 * @param {Array} params.todos - Array of todo items { id, content, status }
 * @param {boolean} params.merge - If true, merge with existing; if false, replace
 * @returns {string} Human-readable summary of the current todo list state
 */
function todo_write({ todos, merge }) {
  // Defensive validation
  if (!todos || !Array.isArray(todos)) {
    return "Error: todos array missing or invalid";
  }
  if (typeof merge !== 'boolean') {
    merge = false; // Default to full-replace
  }

  // Prune stale entries first
  pruneStaleTodos();

  // Get the storage key for this chat
  const chatId = getChatId();
  const storageKey = 'typingmind_todos_' + chatId;

  // Load existing data
  let stored;
  try {
    const raw = localStorage.getItem(storageKey);
    stored = raw ? JSON.parse(raw) : { todos: [] };
    if (!stored.todos || !Array.isArray(stored.todos)) {
      stored = { todos: [] };
    }
  } catch (e) {
    // Corrupt data - start fresh
    stored = { todos: [] };
  }

  // Merge or replace
  if (merge === false) {
    // Full replace
    stored.todos = todos;
  } else {
    // Merge: upsert by id
    const existingMap = new Map(stored.todos.map(item => [item.id, item]));
    for (const incoming of todos) {
      if (incoming && incoming.id) {
        const existing = existingMap.get(incoming.id);
        if (existing) {
          // Merge: update only provided fields
          existingMap.set(incoming.id, {
            ...existing,
            ...incoming
          });
        } else {
          // New item
          existingMap.set(incoming.id, incoming);
        }
      }
    }
    stored.todos = Array.from(existingMap.values());
  }

  // Update timestamp and persist
  stored.updatedAt = Date.now();
  localStorage.setItem(storageKey, JSON.stringify(stored));

  // Build return string (human-readable summary with id, status, content)
  if (stored.todos.length === 0) {
    return "Todo list is empty.";
  }

  const lines = stored.todos.map(item => {
    const id = item.id || '?';
    const status = item.status || 'pending';
    const content = item.content || '';
    return `[${id}] (${status}): ${content}`;
  });

  return "Current todo list:\n" + lines.join("\n");
}
