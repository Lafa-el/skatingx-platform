/**
 * 手写 canonical JSON：不依赖对象键插入顺序，也不走 JSON.stringify 的对象键排序（整数形键会被它按数值排）。
 * 浏览器可运行，可以从 src/index.ts 导出。
 */

export function canonicalCatalogJson(value: unknown): string {
  const stack = new WeakSet<object>();
  return writeValue(value, stack);
}

function writeValue(value: unknown, stack: WeakSet<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error("canonical JSON rejects non-finite numbers");
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "undefined":
    case "function":
    case "symbol":
    case "bigint":
      throw new Error(`canonical JSON rejects ${typeof value}`);
    case "object":
      return writeContainer(value, stack);
    default:
      throw new Error(`canonical JSON rejects ${typeof value}`);
  }
}

function writeContainer(value: object, stack: WeakSet<object>): string {
  if (stack.has(value)) {
    throw new Error("canonical JSON rejects circular references");
  }
  if (Array.isArray(value)) {
    stack.add(value);
    try {
      const parts: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const key = String(index);
        if (!Object.getOwnPropertyDescriptor(value, key)) {
          throw new Error("canonical JSON rejects sparse arrays");
        }
        parts.push(writeValue(ownValue(value, key), stack));
      }
      return `[${parts.join(",")}]`;
    } finally {
      stack.delete(value);
    }
  }
  if (!isPlainObject(value)) {
    throw new Error("canonical JSON rejects non-plain objects");
  }
  stack.add(value);
  try {
    const keys = Object.keys(value).sort();
    const body = keys
      .map((key) => `${JSON.stringify(key)}:${writeValue(ownValue(value, key), stack)}`)
      .join(",");
    return `{${body}}`;
  } finally {
    stack.delete(value);
  }
}

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function ownValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) {
    throw new Error(`canonical JSON rejects accessor property ${key}`);
  }
  return descriptor.value;
}
