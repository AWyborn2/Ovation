/**
 * Wrap a lazily-created object so it can be exported as a plain value.
 *
 * Every property read goes to the real instance (created on first access via
 * `factory`). Functions are bound to the real instance so `proxy.method()` runs
 * with the correct `this`; Drizzle's query builders and pg's Pool both rely on
 * internal state reached through `this`.
 *
 * Used by `./index.ts` and `./central.ts` so `import { db } from "@workspace/db"`
 * keeps working across ~100 call sites while no connection is opened at import.
 */
export function lazyProxy<T extends object>(factory: () => T): T {
  let instance: T | null = null;
  const resolve = (): T => {
    if (!instance) instance = factory();
    return instance;
  };
  return new Proxy({} as T, {
    get(_target, prop) {
      const real = resolve();
      const value = Reflect.get(real as object, prop, real);
      return typeof value === "function" ? value.bind(real) : value;
    },
    has(_target, prop) {
      return prop in (resolve() as object);
    },
    set(_target, prop, value) {
      return Reflect.set(resolve() as object, prop, value);
    },
    ownKeys() {
      return Reflect.ownKeys(resolve() as object);
    },
    getOwnPropertyDescriptor(_target, prop) {
      const desc = Reflect.getOwnPropertyDescriptor(resolve() as object, prop);
      // Proxy invariants require reported descriptors to be configurable when
      // the target (our empty object) has no such own property.
      return desc ? { ...desc, configurable: true } : undefined;
    },
  });
}
