import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { MacCrosshair, MacGrab, MacIbeam, MacOpenHand, MacPointer, MacPointingHand, MacResizeEW, MacResizeNESW, MacResizeNS, MacResizeNWSE, MacWait } from './cursors';
import './cursor.css';
const GLYPHS = {
    pointer: MacPointer,
    ibeam: MacIbeam,
    crosshair: MacCrosshair,
    hand: MacPointingHand,
    open: MacOpenHand,
    grab: MacGrab,
    wait: MacWait,
    'resize-ns': MacResizeNS,
    'resize-ew': MacResizeEW,
    'resize-nwse': MacResizeNWSE,
    'resize-nesw': MacResizeNESW,
};
// Where each glyph's hotspot sits inside its box, so the point is the click.
const HOTSPOT = {
    pointer: { x: 7.5, y: 5.25 },
    ibeam: { x: 5, y: 8 },
    crosshair: { x: 8.5, y: 8.5 },
    hand: { x: 9.75, y: 3.25 },
    open: { x: 11.7, y: 10.4 },
    grab: { x: 12, y: 12 },
    wait: { x: 8, y: 8 },
    'resize-ns': { x: 10.5, y: 10.5 },
    'resize-ew': { x: 10.5, y: 10.5 },
    'resize-nwse': { x: 10.5, y: 10.5 },
    'resize-nesw': { x: 10.5, y: 10.5 },
};
// The arrow style's pointer: one solid, rounded arrowhead, tip at the hotspot
const ARROW_HOTSPOT = { x: 4, y: 3 };
function SolidArrow() {
    return (_jsx("svg", { width: "22", height: "22", viewBox: "0 0 22 22", className: "ss-cursor__arrow", "aria-hidden": true, children: _jsx("path", { d: "M4 3 18.5 9.6 11.8 11.8 9.6 18.5Z" }) }));
}
/** The cursor element. The stage moves it (a transform on cursorRef) and marks it pressed or idle. */
export function Cursor({ cursorRef, style = 'real', kind }) {
    return (_jsxs("div", { ref: cursorRef, className: "ss-cursor", "data-style": style, "data-kind": kind, "aria-hidden": true, children: [style === 'touch' && _jsx("span", { className: "ss-cursor__streak" }), _jsxs("div", { className: "ss-cursor__press", children: [(style === 'circle' || style === 'touch') && _jsx("span", { className: "ss-cursor__dot" }), style !== 'circle' && style !== 'touch' && Object.keys(GLYPHS).map((k) => {
                        const arrow = style === 'arrow';
                        // The arrow style has two glyphs: the arrow, and the I-beam over text
                        if (arrow && k !== 'pointer' && k !== 'ibeam')
                            return null;
                        const Glyph = arrow && k === 'pointer' ? SolidArrow : GLYPHS[k];
                        const hot = arrow && k === 'pointer' ? ARROW_HOTSPOT : HOTSPOT[k];
                        const shown = arrow && kind !== 'ibeam' ? 'pointer' : kind;
                        return (_jsx("div", { className: "ss-cursor__glyph", "data-glyph": k, "data-active": k === shown, style: { marginLeft: -hot.x, marginTop: -hot.y, transformOrigin: `${hot.x}px ${hot.y}px` }, children: _jsx(Glyph, {}) }, k));
                    })] })] }));
}
/** A ring that spreads from the click point and fades, drawn under the cursor. */
export function ripple(root, at) {
    const r = document.createElement('span');
    r.className = 'ss-ripple';
    r.style.left = `${at.x}px`;
    r.style.top = `${at.y}px`;
    root.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
}
