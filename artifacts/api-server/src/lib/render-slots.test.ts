import { describe, expect, it, vi } from "vitest";
import { RenderSlots, RendererBusyError } from "./render-slots";

describe("RenderSlots", () => {
  it("runs at most `max` renders at once and hands a slot to the next waiter", async () => {
    const slots = new RenderSlots(2, 10, 60_000);
    const a = await slots.acquire();
    const b = await slots.acquire();
    expect(slots.running).toBe(2);
    let third = false;
    const c = slots.acquire().then((release) => {
      third = true;
      return release;
    });
    await Promise.resolve();
    expect(third).toBe(false);
    expect(slots.queued).toBe(1);
    a();
    const releaseC = await c;
    expect(third).toBe(true);
    expect(slots.running).toBe(2);
    b();
    releaseC();
    expect(slots.running).toBe(0);
  });

  it("a release called twice frees one slot only", async () => {
    const slots = new RenderSlots(1, 10, 60_000);
    const a = await slots.acquire();
    a();
    a();
    expect(slots.running).toBe(0);
    await slots.acquire();
    expect(slots.running).toBe(1);
  });

  it("turns a request away at once when the queue is full", async () => {
    const slots = new RenderSlots(1, 1, 60_000);
    await slots.acquire();
    void slots.acquire();
    await expect(slots.acquire()).rejects.toBeInstanceOf(RendererBusyError);
    expect(slots.queued).toBe(1);
  });

  it("a waiter gives up after waitMs and leaves the queue", async () => {
    vi.useFakeTimers();
    try {
      const slots = new RenderSlots(1, 5, 1_000);
      const a = await slots.acquire();
      const waiting = slots.acquire();
      const check = expect(waiting).rejects.toBeInstanceOf(RendererBusyError);
      vi.advanceTimersByTime(1_001);
      await check;
      expect(slots.queued).toBe(0);
      a();
      expect(slots.running).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
