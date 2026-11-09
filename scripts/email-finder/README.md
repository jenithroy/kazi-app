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
| `GET /ping` | says it is running | `{ ok, app, version, browser, search }` (`search: true` from version 1.2) |
| `POST /find { url, browser?, robots? }` | reads one site's contact pages: `browser: false` plainly through this computer's connection, otherwise (the default) in its browser | `{ ok, result }`, as `findContacts` in `worker/lib/contactFinder.js`, plus `via: "browser"` or `"computer"` |
| `POST /company { name, robots?, search?, help? }` | finds a company's own website from its name: by trying the likely addresses, and, when that finds nothing sure, by a search for the name (`search: false` leaves that out) | `{ ok, result }`, as `findWebsiteFor` in `worker/lib/siteFinder.js`, plus `via: "search"` when a search found it, and `searchBlocked` when the engines turned it away |
| `POST /search { queries, help? }` | the page's Web search: each phrase (up to 5) searched in the browser here | `{ ok, result: { searched, sites: [{ website, title, query }], engine, blocked, limited, timeUp } }` |
| `POST /socials { name, help? }` | a company's Facebook and Instagram pages, from a search for its name (the links only) | `{ ok, result: { facebook?, instagram?, blocked, limited } }` |

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
- it never READS eBay, social networks (Instagram, Facebook, LinkedIn, TikTok, X, YouTube, Pinterest and the like) or search engines as a company's
  website, **whatever robots.txt says and whatever the switch is set to**: they ask for a sign-in and block automated access. A social network's page is
  never opened at all. A search engine is only ever SEARCHED, in the way described below. It never signs in anywhere, and keeps no cookies or history:
  every browser read starts from an empty profile (your own Chrome profile is never opened; the searches share one empty window that is forgotten when
  the program stops). Pictures, video and fonts are not fetched, pop-ups do not open.

It saves nothing itself. Saving to the email list is the page's job, with the signed-in person's own permissions.

## Searching (`search.mjs`)

The way `email-hunter` finds a business with no website: search for it. Here the browser that is already running searches **Bing, then DuckDuckGo**, and
reads the result links off the page. No search service and no key. It is used for the page's **Web search** source, for **a company's website from its
name** when guessing the address found nothing sure, and, if switched on in Sources, for **a company's Facebook and Instagram pages** (the links in the
results; the pages themselves are never opened). One search at a time, 8 seconds apart, at most 60 in an hour.

Bing's own robots.txt says `Disallow: /search` for programs, and its terms ask for permission before automated queries: the search is made anyway, because it was asked for the way `email-hunter` does it, but slowly, honestly named, and it never tries to get past a check by itself. (DuckDuckGo's `html.duckduckgo.com` says `Allow: /`.) What it does not do, on purpose, and what that costs. It does not hide that the browser is automated (no hiding the automation flag, no fake plugins, no
rotating browser names), it does not sign in, and it does not get past a check that asks for a person. Search engines notice an automated browser quickly:
in a test with this program's honest Chromium, **Bing answered the first search and then turned the second away with a check ("One last step, please
solve the challenge")**, whether the browser was headless or in a visible window, and sometimes answered with an empty page; **DuckDuckGo answered with
HTTP 202, its check, every time**. So expect checks after a search or two. What happens then:

1. the engine that turned a search away is left alone for 15 minutes and the next is tried;
2. when both turned it away and Sources has *Let me answer a search engine's check* on (the default), **one visible window opens** on Bing for you to answer
   the check yourself, and the run goes on from the results that appear. The window stays; if the engine asks again, you are asked again in the same window
   (up to 6 times). Nothing answers a check for you;
3. if nobody answers within two minutes, searching stops for the rest of the run (the page says so) and the websites are still read.

The Facebook and Instagram search is **off by default** because it makes a search for every company; turn it on in Sources if you want it and will
answer the checks. The Worker's paid Brave route still exists as a fallback for the Web search when this program is not running, if the server has its key.
Not measured: how often the checks come for a person who keeps answering them, and how long an answered window stays trusted.

`node selftest.mjs` in this folder checks it (the helpers on their own, and the searcher in this computer's browser against stand-in search engines on this
computer: a check, an empty page, an answered check, an unanswered one, asking again in the same window; nothing is sent to Bing or DuckDuckGo).

## Who can talk to it

- Only this computer: it listens on `127.0.0.1:24781` and nothing else.
- Only pages from `https://kazimfg.com.np` and pages served from this computer (`localhost`, for working on the app). A page on any other
  site can make your browser send a request here; it is refused by its `Origin`, and a name that someone's DNS points at this computer is
  refused by its `Host`.
- One job at a time (a second is told to try again in a moment); a job still going after 75 seconds is stopped (a search or a website lookup that may wait
  for a person to answer a check: after 4 minutes and 15 seconds; the searches stop themselves a little before that and answer with what they have found
  so far, saying `timeUp: true` and `blocked: true`, instead of being cut off with nothing).

The port is also written in `src/lib/localFinder.js`; change both together.

## If something is wrong

| You see | Why, and what to do |
| --- | --- |
| "No Chrome, Chromium or Edge was found" | Install Google Chrome, or set `FINDER_BROWSER` to the full path of the browser's program. |
| "Port 24781 is already in use" | The finder is already running in another window. |
| The page says "Can't reach the finder program on this computer" (or, in a run, "the page couldn't reach the finder program here") | It means the page's check of `http://127.0.0.1:24781/ping` got no answer: either the program was never started or its window was closed (start `start.bat` / `start.sh` and leave the window open), or the browser blocked the page from reaching it. Until it answers, the server does the reading, which finds fewer addresses and cannot do the Bing and DuckDuckGo searches. Check the window is still open. In Chrome or Edge, the site must be allowed to connect to apps on your computer (the browser asks the first time; a "Block" is remembered in the site's settings). Safari does not allow it at all: use Chrome, Edge or Firefox. Brave blocks it unless the site is allowed in Shields. |
| "The finder program on this computer is an older version" | Close its window, update the folder, and start it again (it needs version 1.1 or newer for `Run on this computer`, 1.2 for searching). |
| "A search engine asked for a person to check and nobody answered" | Bing or DuckDuckGo wanted proof of a person. Leave *Let me answer a search engine's check* on in Sources and answer it in the window that opens, or try again in a while. The window the program opens is the only place a check is ever answered. |
| "The hour's searches on this computer are used up" | At most 60 searches an hour are made, as a person might. Try again later. |
| The program's window says `Bing: 0 result(s) ... [HTTP 200, ...]` | Bing answered with a page that has no result links. The text in the brackets is what the page said; the program then asks DuckDuckGo. |
| "That site doesn't let automated readers in" | The site refuses automated readers, with this browser too. Look at its Instagram or Facebook by hand. |
| A site reads slowly | A browser loads each page's scripts, and a shop's home page can take 3 to 5 seconds just to start, so three pages cost 20 to 40 seconds. A plain read takes 4 to 8 and, on the clothing companies tried, found the same addresses, so the browser is only used for a site whose plain read showed no address or was turned away. |
| Websites are not found by name | Finding a website from a name tries a few likely addresses against a time limit; on a computer that is busy or has a slow connection it may run out of time (the row says so: "ran out of time after N of M"). Press Find emails again later, or put the website in the list with the name. |

## Files

- `server.mjs`: the small local web server the page calls, and the checks on who may call it.
- `plain.mjs`: the plain read from this computer's connection, and the check that it only connects to public addresses.
- `browser.mjs`: finds the browser, starts it, and provides the `fetch` that reads a page the way a person's browser does.
- `search.mjs`: searching with the browser (Bing, then DuckDuckGo), telling a check from no results, the window for a person to answer a check, and picking a
  company's website and its Facebook and Instagram pages out of the results.
- `selftest.mjs`: the checks for `search.mjs` (see Searching).
