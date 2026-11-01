import { jsx as _jsx } from "react/jsx-runtime";
import { useReducedMotion } from '../reduced-motion';
import './States.css';
/**
 * The states of one control stacked in one place and crossfaded: a button's
 * "Deploy", spinner and "Deployed"; a status's "Building" and "Ready". The
 * outgoing state is gone before the incoming one arrives, so they never
 * overlap, and the box holds the largest state, so nothing around it shifts.
 * Each state keeps the line box a plain label would have in that spot, so a
 * `Roll` or `Count` inside a state shows whole; give a small line under a
 * name its own line-height, as a subtitle would.
 *
 * Not for a label centered with an icon in a box that keeps its width (a
 * button's "Sending" then "Sent"): the held box leaves the shorter word off
 * center. Use `Swap` there, so the group re-centers as the label changes.
 */
export function States({ value, states, align = 'center', className, style, ...rest }) {
    const reduced = useReducedMotion();
    return (_jsx("span", { ...rest, className: `ss-states${className ? ` ${className}` : ''}`, "data-align": align, "data-reduced": reduced || undefined, style: style, children: Object.keys(states).map((k) => (_jsx("span", { className: "ss-states__item", "data-on": k === value || undefined, "aria-hidden": k !== value || undefined, children: states[k] }, k))) }));
}
