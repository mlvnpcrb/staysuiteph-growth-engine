import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import './keys.css';
const KEYCAPS = { cmd: '⌘', shift: '⇧', alt: '⌥', option: '⌥', ctrl: '⌃', enter: '↵', return: '↵', esc: 'esc', tab: '⇥', up: '↑', down: '↓', left: '←', right: '→', backspace: '⌫' };
/** 'cmd+k' as caps: ['⌘', 'K']. */
export const capsOf = (combo) => combo.split('+').map((k) => KEYCAPS[k.trim().toLowerCase()] ?? k.trim().toUpperCase());
/** The last row (fading out) and the current one. */
export function Keycaps({ rows, at }) {
    return (_jsx(_Fragment, { children: rows.map((row) => row && (_jsx("div", { className: "ss-keys", "data-show": row.show, "data-at": at, "aria-hidden": true, children: row.caps.map((c, i) => (_jsx("kbd", { className: "ss-key", "data-down": row.down, children: c }, i))) }, row.id))) }));
}
