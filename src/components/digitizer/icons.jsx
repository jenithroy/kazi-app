/**
 * The digitizer's icons, drawn in the app's own stroke style (the shared `Ico`). They carry the names of the icons the website's digitizer uses
 * (Phosphor), so the screens ported from there read the same; `weight` is accepted and ignored.
 */
import { Ico } from "../ui";

const make = (shape) => function DzIcon({ weight, ...p }) { return <Ico sw={1.7} {...p} s={shape} />; };

export const Needle = make(<><path d="M5 19.5L17 7.5" /><ellipse cx="18.6" cy="5.4" rx="1.1" ry="2.6" transform="rotate(45 18.6 5.4)" /><path d="M3.5 20.8c2.4.9 3.4-1.4 5.6-1 2.2.4 2.6 1.6 5.2 1" /></>);
export const Question = make(<><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 114 2c-.9.6-1.6 1.1-1.6 2.2" /><path d="M12 17h.01" /></>);
export const X = make(<path d="M6 6l12 12M18 6L6 18" />);
export const Plus = make(<path d="M12 5v14M5 12h14" />);
export const Trash = make(<><path d="M4 7h16" /><path d="M9 7V4.5h6V7" /><path d="M6.5 7l.8 12.5h9.4L17.5 7" /><path d="M10 11v5M14 11v5" /></>);
export const Play = make(<path d="M8 5l11 7-11 7z" fill="currentColor" />);
export const Pause = make(<><path d="M8 5v14" strokeWidth="3.4" /><path d="M16 5v14" strokeWidth="3.4" /></>);
export const ArrowUUpLeft = make(<><path d="M9 14L4 9l5-5" /><path d="M4 9h9a7 7 0 010 14h-3" /></>);
export const ArrowUUpRight = make(<><path d="M15 14l5-5-5-5" /><path d="M20 9h-9a7 7 0 000 14h3" /></>);
export const FolderOpen = make(<><path d="M3.5 18.5V6.5h5l2 2.5h8v3" /><path d="M3.5 18.5l2.6-6.5H21l-2.6 6.5z" /></>);
export const FloppyDisk = make(<><path d="M5 4h11l3 3v13H5z" /><path d="M8 4v5h7V4" /><rect x="8" y="14" width="8" height="6" /></>);
export const FilePlus = make(<><path d="M14 3.5H7a1.5 1.5 0 00-1.5 1.5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8z" /><path d="M14 3.5V8h4.5" /><path d="M12 11.5v6M9 14.5h6" /></>);
export const Stack = make(<><path d="M12 4l9 5-9 5-9-5z" /><path d="M3 13.5l9 5 9-5" /></>);
export const MagnifyingGlassPlus = make(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /><path d="M10.5 8v5M8 10.5h5" /></>);
export const MagnifyingGlassMinus = make(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /><path d="M8 10.5h5" /></>);
export const GridFour = make(<><rect x="4" y="4" width="16" height="16" rx="1.5" /><path d="M4 12h16M12 4v16" /></>);
export const Ruler = make(<><path d="M3.5 16.5L16.5 3.5l4 4-13 13z" /><path d="M7.5 12.5l2 2M10.5 9.5l1.5 1.5M13.5 6.5l2 2" /></>);
