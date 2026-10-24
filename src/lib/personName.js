/** How the profile cards and links say a person's name in a sentence. No imports: it is in the app's first download. */

/** The first name, for a line that talks about the person ("Anmol's points"). */
export const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";

/** "Anmol's" / "James'": the way the card names whose things these are. */
export const possessive = (name) => {
  const n = firstName(name);
  return n ? (/s$/i.test(n) ? `${n}'` : `${n}'s`) : "Their";
};
