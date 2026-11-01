import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Bar } from '../window';
import './Row.css';
/**
 * One row of a list: an inbox conversation, a sidebar item, a table line. The
 * anatomy is fixed so a list reads as a product and not a wireframe: the lead
 * centered on the two lines, the title 4 to 6px above its subtitle (the air
 * comes from the row's padding, not the gap), the meta on the first line, and
 * an unread dot hanging in the margin, so the row never moves. A lead and the dot
 * sit on the name's two lines, not the middle of a taller row; anything
 * passed as children (a toggle, a chevron) trails at the end of that line.
 * A title with no subtitle is a one-line row: the title plus the padding, no
 * second line reserved, so a file or settings list stays slim.
 * More lines under the subtitle (preview bars) go inside `subtitle`. Selected and hovered
 * rows take an inset, rounded fill. Build lists out of it instead of by hand.
 */
export function Row({ lead, title, subtitle, meta, preview, unread, selected, pad = 12, className, style, children, ...rest }) {
    return (_jsxs("div", { ...rest, className: `ss-row${className ? ` ${className}` : ''}`, "data-selected": selected || undefined, "data-unread": unread || undefined, "data-lead": lead ? '' : undefined, style: { '--ss-row-pad': `${pad}px`, ...style }, children: [unread && _jsx("span", { className: "ss-row__dot", "aria-hidden": true }), lead && _jsx("span", { className: "ss-row__lead", children: lead }), _jsxs("span", { className: "ss-row__body", children: [_jsxs("span", { className: "ss-row__head", children: [_jsx("span", { className: "ss-row__title", children: title }), meta && _jsx("span", { className: "ss-row__meta", children: meta })] }), subtitle && _jsx("span", { className: "ss-row__subtitle", children: subtitle })] }), preview && (Array.isArray(preview) && preview.every((w) => typeof w === 'number') ? (_jsx("span", { className: "ss-row__preview", "aria-hidden": true, children: preview.map((w, i) => _jsx(Bar, { w: w, h: 6, tone: 2 }, i)) })) : (_jsx("span", { className: "ss-row__preview", "data-text": true, children: preview }))), children] }));
}
