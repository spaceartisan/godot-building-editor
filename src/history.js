const cloneState = value => (
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

const sameState = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createHistory(initialState, limit = 100) {
  let current = cloneState(initialState);
  const undoStack = [];
  const redoStack = [];

  const trim = stack => {
    while (stack.length > limit) stack.shift();
  };

  return {
    record(nextState, action = 'Edit') {
      if (sameState(current, nextState)) return false;
      undoStack.push({ state: cloneState(current), action });
      trim(undoStack);
      current = cloneState(nextState);
      redoStack.length = 0;
      return true;
    },

    undo() {
      const entry = undoStack.pop();
      if (!entry) return null;
      redoStack.push({ state: cloneState(current), action: entry.action });
      trim(redoStack);
      current = cloneState(entry.state);
      return { state: cloneState(current), action: entry.action };
    },

    redo() {
      const entry = redoStack.pop();
      if (!entry) return null;
      undoStack.push({ state: cloneState(current), action: entry.action });
      trim(undoStack);
      current = cloneState(entry.state);
      return { state: cloneState(current), action: entry.action };
    },

    reset(nextState) {
      current = cloneState(nextState);
      undoStack.length = 0;
      redoStack.length = 0;
    },

    canUndo() { return undoStack.length > 0; },
    canRedo() { return redoStack.length > 0; },
    undoCount() { return undoStack.length; },
    redoCount() { return redoStack.length; }
  };
}
