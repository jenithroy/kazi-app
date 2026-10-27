/**
 * The file types the page offers, in the order a factory is likely to want them. The writers themselves load on demand
 * (lib/embroidery/formats); this is only what the buttons say. DST is the one nearly every industrial machine reads.
 */
export const FORMAT_CHOICES = [
  { id: "dst", label: "DST", who: "Tajima, Barudan, ZSK, SWF, Happy, Feiya and most industrial machines", main: true },
  { id: "pes", label: "PES", who: "Brother and Babylock" },
  { id: "exp", label: "EXP", who: "Melco and Bernina" },
  { id: "jef", label: "JEF", who: "Janome" },
  { id: "vp3", label: "VP3", who: "Husqvarna Viking and Pfaff" },
  { id: "xxx", label: "XXX", who: "Singer and Compucon" },
];
