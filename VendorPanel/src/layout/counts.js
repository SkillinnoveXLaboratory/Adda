import { createContext, useContext } from 'react';

export const CountsContext = createContext({ counts: {}, refreshCounts: () => {} });
/** Pages call refreshCounts() after actions that change sidebar badges (new bookings, KYC, unread). */
export const useCounts = () => useContext(CountsContext);
