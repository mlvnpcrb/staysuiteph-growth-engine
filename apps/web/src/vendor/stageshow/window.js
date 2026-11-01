import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useLook } from './looks';
import './window.css';
/** The traffic lights. Every chrome puts them in the same spot: centered in the top 38px, 12px in. */
function Lights() {
    return (_jsxs("span", { className: "ss-window__lights", children: [_jsx("span", { className: "ss-window__dot" }), _jsx("span", { className: "ss-window__dot" }), _jsx("span", { className: "ss-window__dot" })] }));
}
function Lock() {
    return (_jsxs("svg", { className: "ss-window__lock", width: "7", height: "8", viewBox: "0 0 7 8", "aria-hidden": true, children: [_jsx("path", { d: "M1.5 3.3V2.4a2 2 0 0 1 4 0v.9", fill: "none", stroke: "currentColor", strokeWidth: "1.1" }), _jsx("rect", { x: "0", y: "3.3", width: "7", height: "4.7", rx: "1.2", fill: "currentColor" })] }));
}
function Chevron({ back }) {
    return (_jsx("svg", { className: "ss-window__chev", width: "10", height: "10", viewBox: "0 0 10 10", "aria-hidden": true, children: _jsx("path", { d: back ? 'M6.5 1.5 3 5l3.5 3.5' : 'M3.5 1.5 7 5 3.5 8.5', fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }) }));
}
/**
 * Window chrome. Three kinds, chosen by props:
 * - browser (`url`): address bar, optional `nav` arrows and `tabs` strip
 * - app (`title`): a plain title bar with a centered title
 * - sidebar app (`sidebar`): the sidebar runs to the top and holds the lights; the content column gets its own toolbar
 */
export function Window({ url, urlShape, tabs, nav, title, sidebar, sidebarWidth = 180, sidebarStyle, toolbar, lead, body, className, receded, chrome, lights, lightsSize, barSize, children, ...rest }) {
    const cls = `ss-window ss-recede${className ? ` ${className}` : ''}`;
    const large = lightsSize === 'large' ? 'large' : undefined;
    const tall = barSize === 'tall' ? 'tall' : undefined;
    if (chrome === 'terminal') {
        return (_jsxs("div", { ...rest, className: cls, "data-chrome": "terminal", "data-lights": lights === 'grey' ? 'grey' : undefined, "data-lights-size": large, "data-receded": receded || undefined, children: [_jsxs("div", { className: "ss-window__bar", children: [_jsx(Lights, {}), title !== undefined && _jsx("span", { className: "ss-term__title", children: title })] }), _jsx("div", { ...body, className: `ss-window__body ss-term${body?.className ? ` ${body.className}` : ''}`, children: children })] }));
    }
    if (chrome === 'glass' || chrome === 'card' || chrome === 'hairline') {
        return (_jsxs("div", { ...rest, className: cls, "data-chrome": chrome, "data-lights": lights === 'color' || lights === 'white' ? lights : chrome === 'glass' ? 'grey' : undefined, "data-receded": receded || undefined, children: [_jsxs("div", { className: "ss-window__bar", children: [_jsx(Lights, {}), url !== undefined && (_jsxs("span", { className: "ss-window__url", children: [chrome === 'glass' && _jsx(Lock, {}), _jsx("span", { className: "ss-window__url-text", children: url })] })), _jsx("span", { className: "ss-window__end", children: toolbar })] }), _jsx("div", { ...body, className: `ss-window__body${body?.className ? ` ${body.className}` : ''}`, children: children })] }));
    }
    const address = url !== undefined && (_jsxs(_Fragment, { children: [nav && (_jsxs("span", { className: "ss-window__nav", children: [_jsx(Chevron, { back: true }), _jsx(Chevron, {})] })), _jsx("span", { className: "ss-window__url", children: url })] }));
    if (sidebar !== undefined) {
        return (_jsxs("div", { ...rest, className: cls, "data-kind": "sidebar", "data-side": sidebarStyle === 'floating' ? 'floating' : undefined, "data-lights": lights === 'grey' ? 'grey' : undefined, "data-lights-size": large, "data-bar": tall, "data-receded": receded || undefined, "data-url-shape": urlShape, children: [_jsxs("aside", { className: "ss-window__side", style: { width: sidebarWidth }, children: [_jsx("div", { className: "ss-window__side-top", children: _jsx(Lights, {}) }), sidebar] }), _jsxs("div", { className: "ss-window__main", children: [_jsxs("div", { className: "ss-window__bar", children: [title !== undefined && _jsx("span", { className: "ss-window__heading", children: title }), lead, address, _jsx("span", { className: "ss-window__spacer" }), toolbar] }), _jsx("div", { ...body, className: `ss-window__body${body?.className ? ` ${body.className}` : ''}`, children: children })] })] }));
    }
    if (tabs?.length) {
        return (_jsxs("div", { ...rest, className: cls, "data-kind": "tabs", "data-lights": lights === 'grey' ? 'grey' : undefined, "data-lights-size": large, "data-receded": receded || undefined, "data-url-shape": urlShape, children: [_jsxs("div", { className: "ss-window__tabs", children: [_jsx(Lights, {}), tabs.map((t, i) => (_jsxs("span", { className: "ss-window__tab", "data-active": i === 0 || undefined, children: [_jsx("span", { className: "ss-window__favicon" }), _jsx("span", { className: "ss-window__tab-label", children: t })] }, i)))] }), _jsxs("div", { className: "ss-window__bar", children: [address, toolbar] }), _jsx("div", { ...body, className: `ss-window__body${body?.className ? ` ${body.className}` : ''}`, children: children })] }));
    }
    return (_jsxs("div", { ...rest, className: cls, "data-receded": receded || undefined, "data-url-shape": urlShape, "data-lights": lights === 'grey' ? 'grey' : undefined, "data-lights-size": large, "data-bar": tall, children: [_jsxs("div", { className: "ss-window__bar", children: [_jsx(Lights, {}), address, title !== undefined && _jsx("span", { className: "ss-window__title", "data-toolbar": toolbar ? true : undefined, children: title }), lead, url === undefined && title === undefined && _jsx("span", { className: "ss-window__spacer" }), toolbar] }), _jsx("div", { ...body, className: `ss-window__body${body?.className ? ` ${body.className}` : ''}`, children: children })] }));
}
const INK = ['var(--ss-ink-1)', 'var(--ss-ink-2)', 'var(--ss-ink-3)', 'var(--ss-ink-4)', 'var(--ss-ink-5)'];
/** A placeholder: a line of text, a value, an icon slot or a pill. A line
 * gives way in a narrow row as text would; where it fits, it is exactly `w`. */
export function Bar({ w, h = 6, tone = 3, r = 2, shrink, className, style, ...rest }) {
    const gives = shrink ?? (typeof w === 'number' && w > h * 3);
    return _jsx("span", { ...rest, className: `ss-bar${className ? ` ${className}` : ''}`, "data-shrink": gives || undefined, style: { width: w, height: h, borderRadius: r, background: INK[tone - 1], ...style } });
}
/**
 * Text that knows the stage's fidelity: real words normally, a bar of about
 * the same width in minimal. Write real copy once and every look follows.
 */
export function Text({ children, w, h = 6, tone = 3, wrap, filler, className, style, ...rest }) {
    const { fidelity } = useLook();
    if (fidelity === 'minimal' || (filler && fidelity !== 'realistic')) {
        const size = typeof style?.fontSize === 'number' ? style.fontSize : 11;
        return _jsx(Bar, { ...rest, w: w ?? Math.round(children.length * size * 0.52), h: h, tone: tone, className: className });
    }
    return (_jsx("span", { ...rest, className: `ss-text${className ? ` ${className}` : ''}`, "data-wrap": wrap || undefined, style: style, children: children }));
}
/** A terminal command line: a dim path, the prompt mark, and the command
 * bright. Recolor the path and mark with `--ss-term-path` and
 * `--ss-term-sigil` (set on the window, the stage or any parent). */
export function Prompt({ path = '~', children, className, ...rest }) {
    return (_jsxs("div", { ...rest, className: `ss-term__line ss-term__prompt${className ? ` ${className}` : ''}`, children: [_jsx("span", { className: "ss-term__path", children: path }), _jsx("span", { className: "ss-term__sigil", children: "\u276F" }), _jsx("span", { className: "ss-term__cmd", children: children })] }));
}
/** A terminal's block cursor. Blinks unless `still` (while typing, a real one holds solid). */
export function Caret({ still }) {
    return _jsx("span", { className: "ss-term__caret", "data-still": still || undefined, "aria-hidden": true });
}
