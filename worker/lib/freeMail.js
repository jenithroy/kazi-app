/**
 * Which mail domains are free, public mailboxes (Gmail, Yahoo, an internet provider's address): an address there is usually a person, not a
 * company, and needs more care than a company's before it is written to. Used by the email finder (worker/lib/contactFinder.js, to say
 * what kind an address is) and by the website (src/lib/redditLeads.js, so a download leaves such an address out even when it was saved
 * before this list grew). One list in one place: the two must never disagree.
 *
 * Pure data and one function; no imports.
 */

const EXACT = new Set([
  "gmail.com", "googlemail.com", "ymail.com", "rocketmail.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "protonmail.ch",
  "pm.me", "mail.com", "email.com", "web.de", "t-online.de", "freenet.de", "mail.ru", "bk.ru", "inbox.ru", "list.ru", "rambler.ru", "qq.com",
  "163.com", "126.com", "sina.com", "naver.com", "daum.net", "hanmail.net", "rediffmail.com", "zoho.com", "zohomail.com", "tutanota.com",
  "tuta.io", "fastmail.com", "fastmail.fm", "hey.com", "btinternet.com", "btopenworld.com", "sky.com", "virginmedia.com", "ntlworld.com",
  "talktalk.net", "blueyonder.co.uk", "tiscali.co.uk", "orange.fr", "wanadoo.fr", "free.fr", "laposte.net", "sfr.fr", "libero.it",
  "virgilio.it", "tin.it", "comcast.net", "verizon.net", "att.net", "sbcglobal.net", "bellsouth.net", "cox.net", "charter.net", "earthlink.net",
  "optonline.net", "shaw.ca", "rogers.com", "sympatico.ca", "bigpond.com", "optusnet.com.au", "wlink.com.np", "ntc.net.np", "mos.com.np",
  "gmx.com", "gmx.net", "gmx.de", "gmx.at", "gmx.ch",
]);

// the big providers keep one name and change the ending by country: yahoo.co.in, hotmail.fr, live.co.uk, outlook.de, gmx.es ...
const FAMILIES = /^(yahoo|hotmail|outlook|live|msn|aol|gmx|yandex)\.(com|net|org|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$/;

/** Whether a domain ("gmail.com") is a free public mailbox provider. Case-blind; anything that is not a string is not. */
export function isFreeMail(domain) {
  const d = String(domain ?? "").trim().toLowerCase().replace(/\.$/, "");
  return EXACT.has(d) || FAMILIES.test(d);
}

/** The same question for a whole address ("jane@gmail.com"). */
export const isFreeMailAddress = (email) => isFreeMail(String(email ?? "").split("@").pop());
