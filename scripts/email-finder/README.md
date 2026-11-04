# Kazi contact finder (runs on your own computer)

The Contact Finder page (Marketing menu) finds companies' websites and reads their contact pages for email addresses and social links. By
default the website's server does that work. A server has two limits: a data-centre address is turned away by many sites (a home connection is
not), and a site that writes its address with JavaScript comes back empty.

This program is the other way to do it. You start it on your own computer; the page, open in your browser on that same computer, hands it the
work (**Sources → Run on this computer**). It finds each company's website and reads it from **your computer's own internet connection**, and a
site that shows no address, or turns that away, is read again with the **Chrome, Chromium or Edge already installed on your computer**, which also
runs the page's scripts. The results come back to the page and are shown and saved exactly like a server read.

## Start it

You need [Node.js](https://nodejs.org) 20 or newer, and Google Chrome, Chromium or Microsoft Edge.

The easy way: double-click **`start.bat`** (Windows) or **`start.sh`** (macOS, Linux). The first time it installs what it needs; after that it
just starts. The same by hand:

```
cd scripts/email-finder
npm install        # once
npm start
```

It prints which browser it found and "is running". Leave that window open.

Then, on the Contact Finder page, open **Sources**, turn on **Run on this computer** (it says whether it can reach this program), Save, and press
**Find emails**. The choice is remembered in that browser. The same program also serves the tick under **Add by hand → A website** and the finder on a
Reddit post's card. Chrome and Edge ask once whether the Kazi site may connect to apps on your computer: choose Allow. Stop the program with Ctrl+C.

If the program is not running (or this browser does not let the page reach it), the page says so and the server does the reading instead, so the
switch never leaves anyone with nothing. If it stops part-way through a run, the server takes over for the rest.

## What it can be asked

| Request | Does | Answers |
| --- | --- | --- |
| `GET /ping` | says it is running | `{ ok, app, version, browser }` |
| `POST /find { url, browser?, robots? }` | reads one site's contact pages: `browser: false` plainly through this computer's connection, otherwise (the default) in its browser | `{ ok, result }`, as `findContacts` in `worker/lib/contactFinder.js`, plus `via: "browser"` or `"computer"` |
| `POST /company { name, robots? }` | finds a company's own website from its name | `{ ok, result }`, as `findWebsiteFor` in `worker/lib/siteFinder.js` |

`robots: false` is the person's own choice (Sources → Respect robots.txt, off): the site's robots.txt is then not read. The default is to respect it.

## What it does, and does not do

The reading rules are not written again here. `worker/lib/contactFinder.js` and `worker/lib/siteFinder.js` are the finder; `plain.mjs` and
`browser.mjs` only hand them a `fetch`, so everything the server finder promises still holds:

- `robots.txt` is read first, and a page it keeps robots out of is not opened, unless the person switched that off in Sources;
- at most the home page and two contact or about pages, of that one site, with a pause between pages; a website is looked for from at most 12
  likely addresses, three at a time;
- a redirect, or a script that sends the page somewhere else, is stopped **before** the new address is asked for, and refused if it goes to
  another site or to anything that is not a public web address (so a brand that sends visitors to its Instagram is never taken there);
- only public web addresses: never an IP address, `localhost`, or a name inside a network, for the page or for anything the page loads. Because
  this program sits on someone's own network, which the server does not, `plain.mjs` also checks the address a name really points to when the
  connection is made, and connects only to a public one (a name that points at `192.168.0.1` is refused);
- it gives its own name, honestly: `KaziContactFinder/1.0 (+https://kazimfg.com.np; ...)`, with the browser's own name before it in a browser read.
  Nothing is done to hide that it is automated, so a site that refuses automated readers still refuses it, and it does not try to get past that;
- it never reads eBay, social networks (Instagram, Facebook, LinkedIn, TikTok, X, YouTube, Pinterest and the like) or search engines, **whatever
  robots.txt says and whatever the switch is set to**: they ask for a sign-in and block automated access, and reading them would mean hiding that
  it is a program or logging in, which it does not do. The finder says to use the company's own website instead. It never signs in anywhere,
  and keeps no cookies or history: every browser read starts from an empty profile (your own Chrome profile is never opened). Pictures, video and
  fonts are not fetched, pop-ups do not open.

It saves nothing itself. Saving to the email list is the page's job, with the signed-in person's own permissions.

## Who can talk to it

- Only this computer: it listens on `127.0.0.1:24781` and nothing else.
- Only pages from `https://kazimfg.com.np` and pages served from this computer (`localhost`, for working on the app). A page on any other
  site can make your browser send a request here; it is refused by its `Origin`, and a name that someone's DNS points at this computer is
  refused by its `Host`.
- One job at a time (a second is told to try again in a moment); a job still going after 75 seconds is stopped.

The port is also written in `src/lib/localFinder.js`; change both together.

## If something is wrong

| You see | Why, and what to do |
| --- | --- |
| "No Chrome, Chromium or Edge was found" | Install Google Chrome, or set `FINDER_BROWSER` to the full path of the browser's program. |
| "Port 24781 is already in use" | The finder is already running in another window. |
| The page says "The finder isn't running on this computer, or this browser didn't let the page reach it" | Check the window is still open. In Chrome or Edge, the site must be allowed to connect to apps on your computer (the browser asks the first time; a "Block" is remembered in the site's settings). Safari does not allow it at all: use Chrome, Edge or Firefox. Brave blocks it unless the site is allowed in Shields. |
| "The finder program on this computer is an older version" | Close its window, update the folder, and start it again (it needs version 1.1 or newer for `Run on this computer`). |
| "That site doesn't let automated readers in" | The site refuses automated readers, with this browser too. Look at its Instagram or Facebook by hand. |
| A site reads slowly | A browser loads each page's scripts, and a shop's home page can take 3 to 5 seconds just to start, so three pages cost 20 to 40 seconds. A plain read takes 4 to 8 and, on the clothing companies tried, found the same addresses, so the browser is only used for a site whose plain read showed no address or was turned away. |
| Websites are not found by name | Finding a website from a name tries a few likely addresses against a time limit; on a computer that is busy or has a slow connection it may run out of time (the row says so: "ran out of time after N of M"). Press Find emails again later, or put the website in the list with the name. |

## Files

- `server.mjs`: the small local web server the page calls, and the checks on who may call it.
- `plain.mjs`: the plain read from this computer's connection, and the check that it only connects to public addresses.
- `browser.mjs`: finds the browser, starts it, and provides the `fetch` that reads a page the way a person's browser does.
