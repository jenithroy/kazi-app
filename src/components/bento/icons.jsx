/**
 * Icons the bento dashboard needs that the shared set doesn't have yet.
 * Same `Ico` base, so size, stroke weight and colour behave like `Icons.*`.
 */
import { Ico } from "../ui";

export const ArrowUpRight = (p) => <Ico {...p} d="M7 17L17 7M8.5 7H17v8.5" />;

export const Sun = (p) => (
  <Ico {...p} s={<><circle cx="12" cy="12" r="3.8" /><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5L7 7M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5" /></>} />
);

export const Moon = (p) => <Ico {...p} d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" />;

export const Lock = (p) => (
  <Ico {...p} s={<><rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" /></>} />
);

export const Bank = (p) => (
  <Ico {...p} s={<><path d="M3 9.5L12 4l9 5.5" /><path d="M5.5 11v6.5M9.8 11v6.5M14.2 11v6.5M18.5 11v6.5M3.5 20h17" /></>} />
);

export const Star = (p) => <Ico {...p} d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9L3.5 9.4l5.9-.8L12 3.2z" />;

export const Layers = (p) => (
  <Ico {...p} s={<><path d="M12 3.5l8.5 4.6L12 12.7 3.5 8.1 12 3.5z" /><path d="M3.5 12.2L12 16.8l8.5-4.6M3.5 16.2L12 20.8l8.5-4.6" /></>} />
);

export const TrendUp = (p) => <Ico {...p} d="M3.5 16.5l5.5-5.5 4 4 7.5-8M15 7h5.5v5.5" />;

export const Package = (p) => (
  <Ico {...p} s={<><path d="M3.5 7.8L12 3.5l8.5 4.3v8.4L12 20.5l-8.5-4.3V7.8z" /><path d="M3.8 8l8.2 4.2L20.2 8M12 12.2v8" /></>} />
);
