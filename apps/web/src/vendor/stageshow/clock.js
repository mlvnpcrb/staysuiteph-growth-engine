// The stage clock. Everything on a stage moves on the browser's own clocks:
// performance.now, requestAnimationFrame, setTimeout/setInterval, and CSS
// transitions and animations on the compositor. With nothing attached, that
// is all this file is: `clock` reads those same globals, so a stage plays in
// real time exactly as it always has.
//
// A recorder or the playground runs installVirtualClock() in the page
// before any of its code loads. From then on time only moves when the
// recorder steps it, by exactly 1/fps: timers fire in time order, one
// animation frame runs, and every CSS transition and animation is set to the
// new time. Live playback instead calls advance() with the native RAF's
// elapsed time, so its motion follows the display refresh rate. Each fixed
// frame of a video is then the same on every render, a
// timed beat lands on a known frame, and nothing drops or doubles.
//
// Chrome's own virtual time (Emulation.setVirtualTimePolicy) doesn't do this:
// it moves timers but runs no animation frames and leaves CSS animations
// where they are.
/**
 * The clock the kit and its scenes read. Each call goes to the page's global
 * at call time, so under a recorder it is the virtual clock and otherwise
 * the real one.
 */
export const clock = {
    now: () => performance.now(),
    raf: (fn) => requestAnimationFrame(fn),
    cancelRaf: (id) => cancelAnimationFrame(id),
    // Layout must finish even when a preview is paused. Keep these callbacks
    // separate: running arbitrary motion RAFs at a frozen timestamp can still
    // advance a spring that integrates once per callback.
    layoutRaf: (fn) => clock.recording?.requestLayoutFrame(fn) ?? requestAnimationFrame(fn),
    cancelLayoutRaf: (id) => {
        const recording = clock.recording;
        if (recording)
            recording.cancelLayoutFrame(id);
        else
            cancelAnimationFrame(id);
    },
    timeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    /** The recorder's control while one drives the page, else null. */
    get recording() {
        return typeof window === 'undefined' ? null : (window.__stageshow?.clock ?? null);
    },
};
/**
 * Replace the page's clocks with a virtual one that only moves on step().
 * Self-contained (a recorder can inject its source as an init script), so it
 * must not reference anything outside its own body.
 *
 * `epoch` is the wall-clock time Date reports at frame 0, so a clock drawn
 * in a scene reads the same on every render.
 */
export function installVirtualClock(opts = {}) {
    const w = window;
    if (w.__stageshow?.clock)
        return w.__stageshow.clock;
    const fps = opts.fps ?? 60;
    const RealDate = Date;
    const epoch = opts.epoch ?? RealDate.now();
    // Not 0: code that tests a timestamp for truthiness must still see one
    const BASE = 1000;
    let vt = BASE;
    let frame = 0;
    let fixedAnchor = BASE;
    let fixedFrame = 0;
    const timers = new Map();
    let nextId = 1;
    let seq = 0;
    let frameCbs = new Map();
    let layoutCbs = new Map();
    const arm = (fn, ms, args, every) => {
        const d = Math.max(0, Number(ms) || 0);
        const id = nextId++;
        timers.set(id, { id, at: vt + d, seq: seq++, fn, args, every: every ? Math.max(1, d) : null });
        return id;
    };
    w.setTimeout = (fn, ms, ...args) => arm(fn, ms, args, false);
    w.setInterval = (fn, ms, ...args) => arm(fn, ms, args, true);
    w.clearTimeout = w.clearInterval = (id) => void timers.delete(id);
    w.requestAnimationFrame = (fn) => {
        const id = nextId++;
        frameCbs.set(id, fn);
        return id;
    };
    w.cancelAnimationFrame = (id) => void frameCbs.delete(id);
    performance.now = () => vt;
    const dateNow = () => Math.floor(epoch + (vt - BASE));
    const VDate = function (...a) {
        if (!new.target)
            return new RealDate(dateNow()).toString();
        return a.length ? new RealDate(...a) : new RealDate(dateNow());
    };
    Object.assign(VDate, { prototype: RealDate.prototype, now: dateNow, parse: RealDate.parse, UTC: RealDate.UTC });
    w.Date = VDate;
    // Queued work (React renders on a MessageChannel, effects after them,
    // promise chains) runs between tasks; a few message round trips let it all
    // land before time moves on.
    const tick = () => new Promise((r) => {
        const c = new MessageChannel();
        c.port1.onmessage = () => {
            c.port1.close();
            c.port2.close();
            r();
        };
        c.port2.postMessage(0);
    });
    // Anything that started meanwhile is held from here on (see scan below).
    const settle = async () => {
        for (let i = 0; i < 4; i++)
            await tick();
        scan();
    };
    const run = (fn, args) => {
        try {
            // String callbacks are ignored: running them would need eval
            if (typeof fn === 'function')
                fn(...args);
        }
        catch (e) {
            console.error(e);
        }
    };
    const held = new WeakMap();
    const live = new Set();
    const scan = () => {
        for (const a of document.getAnimations()) {
            if (held.has(a) || a.playState === 'finished' || a.playState === 'idle')
                continue;
            held.set(a, { local: 0, rate: a.playbackRate || 1, born: vt });
            a.playbackRate = 0;
            a.currentTime = 0;
            live.add(a);
        }
    };
    const moveAnimations = (from) => {
        scan();
        for (const a of Array.from(live)) {
            const h = held.get(a);
            if (a.playState === 'idle' || a.playState === 'finished') {
                live.delete(a);
                continue;
            }
            if (a.playState !== 'paused')
                h.local += (vt - Math.max(from, h.born)) * h.rate;
            const end = a.effect?.getComputedTiming().endTime;
            if (typeof end === 'number' && Number.isFinite(end) && h.local >= end) {
                // Cancel a pending play task before restoring the rate. Otherwise a
                // delayed transition can restart on the native timeline after finish().
                a.pause();
                a.playbackRate = h.rate;
                a.finish();
                live.delete(a);
            }
            else {
                a.currentTime = h.local;
            }
        }
    };
    const stepTo = async (to) => {
        const from = vt;
        await settle();
        // Timers due by `to`, in time order, each with the work it queued. A
        // hair of slack, so a wait summed from frame-sized steps can't miss its
        // frame by a rounding error
        for (let guard = 0; guard < 10000; guard++) {
            let next = null;
            for (const t of Array.from(timers.values()))
                if (t.at <= to + 1e-6 && (!next || t.at < next.at || (t.at === next.at && t.seq < next.seq)))
                    next = t;
            if (!next)
                break;
            vt = next.at;
            if (next.every === null)
                timers.delete(next.id);
            else {
                next.at += next.every;
                next.seq = seq++;
            }
            run(next.fn, next.args);
            await settle();
        }
        vt = to;
        frame++;
        const cbs = frameCbs;
        const layout = layoutCbs;
        frameCbs = new Map();
        layoutCbs = new Map();
        for (const fn of Array.from(layout.values()))
            run(fn, [vt]);
        for (const fn of Array.from(cbs.values()))
            run(fn, [vt]);
        await settle();
        moveAnimations(from);
    };
    const control = {
        fps,
        get frame() {
            return frame;
        },
        now: () => vt,
        async step(n = 1) {
            // Keep recorder timestamps exact, without accumulating rounded deltas.
            for (let i = 0; i < n; i++)
                await stepTo(fixedAnchor + (++fixedFrame * 1000) / fps);
        },
        async advance(milliseconds) {
            if (!Number.isFinite(milliseconds) || milliseconds < 0)
                throw new RangeError('Clock advance must be a finite, non-negative duration');
            if (milliseconds === 0)
                return;
            await stepTo(vt + milliseconds);
            // A manual fixed step after live playback starts at the current time.
            fixedAnchor = vt;
            fixedFrame = 0;
        },
        settle,
        requestLayoutFrame(callback) {
            const empty = layoutCbs.size === 0;
            const id = nextId++;
            layoutCbs.set(id, callback);
            // A paused React/ResizeObserver commit can enqueue measurement work
            // without changing any observed DOM attributes. Wake its host directly.
            if (empty)
                opts.onLayout?.();
            return id;
        },
        cancelLayoutFrame: (id) => void layoutCbs.delete(id),
        get layoutPending() { return layoutCbs.size > 0; },
        async flushLayout() {
            await settle();
            // Snapshot once: a nested layout frame belongs to the next native
            // paint, rather than an unbounded drain in this task.
            const callbacks = layoutCbs;
            layoutCbs = new Map();
            for (const fn of Array.from(callbacks.values()))
                run(fn, [vt]);
            await settle();
        },
    };
    w.__stageshow = { ...(w.__stageshow ?? {}), clock: control };
    return control;
}
