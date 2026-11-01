import { createContext, useContext } from 'react';
export const LookContext = createContext({
    theme: 'light',
    palette: 'accent',
    fidelity: 'standard',
    layout: 'wide',
});
export const useLook = () => useContext(LookContext);
