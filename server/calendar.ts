import { calendarEntries as entries, calendarEntry as entry } from '../shared/calendar.js';
import { graph } from './graph.js';
export const calendarEntries = (id: string, read = graph) => entries(id, read);
export const calendarEntry = (id: string, event: string, read = graph) => entry(id, event, read);
