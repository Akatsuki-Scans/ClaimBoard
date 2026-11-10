export type CalendarEventColor =
  | 'gray'
  | 'brand'
  | 'green'
  | 'blue'
  | 'indigo'
  | 'purple'
  | 'pink'
  | 'orange'
  | 'yellow';

export interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  color?: CalendarEventColor;
  dot?: boolean;
  meta?: Record<string, any>;
}

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

