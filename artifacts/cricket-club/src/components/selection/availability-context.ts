import { createContext, useContext } from "react";

/**
 * Whether the club uses availability requests. Off, the Selection Hub stands
 * alone: no status marks, reply groups, reminders or round steps.
 */
export const AvailabilityContext = createContext(true);

export const useAvailability = () => useContext(AvailabilityContext);
