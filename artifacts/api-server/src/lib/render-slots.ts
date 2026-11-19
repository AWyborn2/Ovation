/**
 * A bounded gate for headless-Chromium renders (round 6 retest).
 *
 * Every card still opens a browser context (a renderer process of its own),
 * and the still endpoint used to take any number at once: several open tabs
 * downloading sets, plus the post-pack queue, could start as many contexts as
 * there were requests and run the api-server's container out of memory. The
 * gate lets `max` renders run, queues up to `maxWaiting` more (each waits at
 * most `waitMs`), and turns the rest away at once with RendererBusyError
 * instead of piling them up.
 */

export class RendererBusyError extends Error {
  constructor() {
    super(
      "The card renderer is busy with other downloads. Nothing was saved; try again in a minute.",
    );
    this.name = "RendererBusyError";
  }
}

type Waiter = { grant: () => void; timer: NodeJS.Timeout };

export class RenderSlots {
  private active = 0;
  private readonly waiting: Waiter[] = [];

  constructor(
    readonly max: number,
    readonly maxWaiting: number,
    readonly waitMs: number,
  ) {}

  /** Renders running now. */
  get running(): number {
    return this.active;
  }

  /** Renders waiting for a slot. */
  get queued(): number {
    return this.waiting.length;
  }

  /**
   * Wait for a slot. Resolves with its release (call it exactly once, when
   * the render ends); rejects with RendererBusyError when the queue is full or
   * the wait runs out.
   */
  acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return Promise.resolve(this.releaser());
    }
    if (this.waiting.length >= this.maxWaiting) return Promise.reject(new RendererBusyError());
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        grant: () => {
          clearTimeout(waiter.timer);
          resolve(this.releaser());
        },
        timer: setTimeout(() => {
          const at = this.waiting.indexOf(waiter);
          if (at >= 0) this.waiting.splice(at, 1);
          reject(new RendererBusyError());
        }, this.waitMs),
      };
      waiter.timer.unref?.();
      this.waiting.push(waiter);
    });
  }

  private releaser(): () => void {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const next = this.waiting.shift();
      // The slot passes straight to the next waiter, so `active` is unchanged.
      if (next) next.grant();
      else this.active--;
    };
  }
}
