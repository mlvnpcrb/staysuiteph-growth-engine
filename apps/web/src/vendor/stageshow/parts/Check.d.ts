import type { HTMLAttributes } from 'react';
import './Check.css';
/**
 * A status circle. `pending` turns an arc inside the ring; `on` fills the
 * circle from its center and then draws the tick. Pending hands over to done
 * in one mark, never a spinner fading out over a fill fading in. The tick
 * fades out intact rather than undrawing.
 */
export declare function Check({ on, pending, size, className, ...rest }: HTMLAttributes<HTMLSpanElement> & {
    on: boolean;
    pending?: boolean;
    size?: number;
}): import("react/jsx-runtime").JSX.Element;
