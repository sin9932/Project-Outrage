export function genId(state, prefix){
  const id = `${prefix}${state.entities.nextId++}`;
  return id;
}

export function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
