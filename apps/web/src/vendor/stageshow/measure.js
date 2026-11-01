// Measuring: where things are, in stage pixels. Targets and rects for the
// script API, the drawn scale that turns screen pixels into stage pixels,
// and the rect helpers demos use to place overlays from measured targets.
export const EMPTY = { x: 0, y: 0, width: 0, height: 0 };
export const nameOf = (t) => (typeof t === 'string' ? t : 'at' in t ? t.at : null);
/** Rect helpers for positioning overlays from measured targets. */
export const inset = (r, by) => ({ x: r.x - by, y: r.y - by, width: r.width + by * 2, height: r.height + by * 2 });
export const box = (r) => ({ left: r.x, top: r.y, width: r.width, height: r.height });
export const between = (a, b) => ({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
});
export const contains = (outer, inner) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
// Stage pixels from screen pixels. The scale is measured as the stage is drawn
// now (its rendered width over its layout width), not the fit's own scale, so
// a stage inside anything else that scales it (a camera, a zoomed card) still
// aims true
export const drawnScale = (root, fallback) => (root?.offsetWidth && root.getBoundingClientRect().width / root.offsetWidth) || fallback || 1;
// Reuse one stage read while measuring a collection of targets. A fresh
// snapshot on each pass still includes parent Camera/Phone transforms.
export function stageSpace(root, fallback) {
    const bounds = root.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top, scale: (root.offsetWidth && bounds.width / root.offsetWidth) || fallback || 1, borderX: root.clientLeft, borderY: root.clientTop };
}
export function rectOf(root, el, fallback, space = stageSpace(root, fallback)) {
    const b = el.getBoundingClientRect();
    const { scale } = space;
    // From the inside of the stage's border, where its absolute children are placed
    return { x: (b.left - space.left) / scale - space.borderX, y: (b.top - space.top) / scale - space.borderY, width: b.width / scale, height: b.height / scale };
}
// A target's box as rect() hands it to the scene: where it is drawn, but
// without a scale of its own (a button's press, a hover lift). Anything
// placed from it (a popover under a button) would otherwise shift by a
// fraction of a pixel for every press and settle back after
export function targetRectOf(root, el, fallback, space = stageSpace(root, fallback)) {
    const r = rectOf(root, el, fallback, space);
    const style = getComputedStyle(el);
    const t = style.transform;
    const m = t && t !== 'none' ? t.match(/^matrix\(([^)]+)\)$/) : null;
    if (!m)
        return r;
    const [a, b, c, d, e, f] = m[1].split(',').map(Number);
    if (b || c || e || f || !a || !d)
        return r;
    // Unscaled from the drawn box, not offsetWidth, which rounds to whole pixels
    const w = r.width / a;
    const h = r.height / d;
    const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat);
    return { x: r.x - ox * (1 - a), y: r.y - oy * (1 - d), width: w, height: h };
}
// The untransformed layout box: offsets up to the stage, ignoring any scale
// or slide an element is part way through. When nothing between the element
// and the stage is transformed, the drawn box is the layout box, measured
// exactly; offsets round to whole pixels. Otherwise it walks the offsets. An
// offset is measured from the inside of its parent's border and before its
// scroll, so each parent's border is added and its scroll taken off on the way
// up: without that, an element in a bordered box measured a pixel up and left,
// and whatever landed on it (a flyer) jumped that pixel on the handoff.
const transformed = (n) => {
    const c = getComputedStyle(n);
    return c.transform !== 'none' || (c.translate && c.translate !== 'none') || (c.scale && c.scale !== 'none') || (c.rotate && c.rotate !== 'none');
};
export function layoutRectOf(root, el) {
    let still = true;
    for (let a = el; a && a !== root; a = a.parentElement)
        if (transformed(a)) {
            still = false;
            break;
        }
    if (still)
        return rectOf(root, el, 1);
    let x = 0;
    let y = 0;
    let n = el;
    while (n && n !== root) {
        x += n.offsetLeft;
        y += n.offsetTop;
        const parent = n.offsetParent;
        if (!parent || !root.contains(parent))
            break;
        n = parent;
        if (n !== root) {
            x += n.clientLeft - n.scrollLeft;
            y += n.clientTop - n.scrollTop;
        }
    }
    return { x, y, width: el.offsetWidth, height: el.offsetHeight };
}
export function sameRects(a, b) {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length)
        return false;
    return ka.every((k) => {
        const x = a[k];
        const y = b[k];
        return y && Math.abs(x.x - y.x) < 0.5 && Math.abs(x.y - y.y) < 0.5 && Math.abs(x.width - y.width) < 0.5 && Math.abs(x.height - y.height) < 0.5;
    });
}
/** Places a Scroll's bar thumb for the element's current scroll position. */
export function thumb(el) {
    const wrap = el.parentElement;
    if (!wrap?.classList.contains('ss-scroller'))
        return;
    const h = el.clientHeight;
    const total = el.scrollHeight;
    const size = total > h ? Math.max(24, (h / total) * h) : 0;
    const y = total > h ? (el.scrollTop / (total - h)) * (h - size) : 0;
    wrap.style.setProperty('--ss-thumb-h', `${size}px`);
    wrap.style.setProperty('--ss-thumb-y', `${y}px`);
}
