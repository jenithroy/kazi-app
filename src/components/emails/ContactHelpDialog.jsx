/**
 * The "?" beside the Contact Finder's header opens this: how the page works, in plain words.
 *
 * Written for the people who use the page (a clothing business, not a website team), so it uses no technical words: no "server", "archive",
 * "database" or "API". ("robots.txt" is the one name kept, because it is the name of the switch they will see in Sources.) It uses the page's own
 * words for what is on the screen (Find emails, Sources, UK tenders, Reddit posts, My list, eBay stores, Web search, Respect robots.txt, Run on this
 * computer, Add by hand, Stop, Do not email, Download CSV), so a person can match what they read to what they see. When a button on the page is
 * renamed, rename it here.
 */
import Modal from "../Modal";

export default function ContactHelpDialog({ onClose }) {
  return (
    <Modal
      title="How this page works" subtitle="Contact Finder, in plain words" size="lg" glass className="kmodal--reddit" onClose={onClose}
      footer={<button type="button" className="primary-button" onClick={onClose}>Got it</button>}
    >
      <div className="rdl-help" tabIndex={0} role="region" aria-label="How this page works">
        <p className="rdl-help-lead">
          This page keeps the list of business email addresses, with the links to each company's social pages, and finds more by itself. Nothing is
          sent from here: you download the list and use your own email program.
        </p>

        <section className="rdl-help-sec">
          <h3>Finding contacts: Find emails</h3>
          <p>
            Press <b>Find emails</b>. It looks at the places you chose in <b>Sources</b>, one company after another, and shows what it does in a
            panel above the list: the company, its website, what it saved and its social links. What it saves is on the list straight away. Keep the
            Kazi site open in your browser while it works (you can move to other pages); <b>Stop</b> ends it. The last run stays on the page until you
            press <b>Clear</b>.
          </p>
          <p>
            For each company it works out the company's own website from its name (and checks that the page really is theirs), reads the home page and up
            to two contact pages, and saves the company's own addresses that look meant for selling to, like sales@ or enquiries@. It leaves out
            Gmail-type addresses, jobs@ and support@, and a person's own address (it says so, with a button to save one anyway), because those are
            personal. The links to the company's Instagram, Facebook, LinkedIn and so on are the ones its own website shows.
          </p>
        </section>

        <section className="rdl-help-sec">
          <h3>Sources: where it looks and how</h3>
          <ul>
            <li><b>UK tenders</b>: public bodies publish what they buy on a government website, Find a Tender. The companies that won clothing and textile contracts are looked up. Most give a phone number and no website, so the page finds the website from the name.</li>
            <li><b>Reddit posts</b>: the websites written on posts in Reddit Leads that have no address saved yet.</li>
            <li><b>My list</b>: companies or websites you type in, one on each line.</li>
            <li><b>eBay stores</b>: eBay's rules do not allow programs to read its pages, and it shows them a security check, so a store's page is never opened. Type the store's link or its company name and the page looks for that company's own website. A store's real company name works best.</li>
            <li><b>Web search</b>: finds the websites of businesses by searching Bing, and DuckDuckGo if Bing says no, in the browser on your computer, a few seconds apart. Bing's rules ask programs not to use its search: this does it slowly and never tries to get past a check by itself. It needs the finder program running on your computer (see Run on this computer) and no key. If a search engine asks for a person to check, one window opens for you to answer it; if nobody does, searching stops for that run. Directories, marketplaces and review sites are left out of the results.</li>
            <li><b>Respect robots.txt</b>: a website can ask robots to keep out. On, those sites are left alone. Off, they are read anyway. Either way, only a few public pages of each site are read, one site at a time.</li>
            <li><b>Run on this computer</b>: the websites are found and read from your own computer's internet connection, and its browser reads any that show no address, and does the searching (a company's website from its name when guessing the address fails, its Facebook and Instagram pages, and Web search), instead of the server doing it. This reaches websites that turn the server away, and it is what to use for a long list. It needs the Kazi finder program running on your computer: ask whoever looks after the website for its folder, double-click <b>start.bat</b> (Windows) or <b>start.sh</b> (Mac or Linux), leave its window open, then turn this on. Chrome or Edge will ask once whether the Kazi site may connect to apps on your computer: choose Allow.</li>
            <li><b>Look for Facebook and Instagram pages with a search</b>: for a company whose own website links none, the browser on your computer searches for its name and keeps the links it finds (the pages are never opened). Off by default: Bing and DuckDuckGo ask a person to prove they are one after a search or two, and this makes a search for every company.</li>
            <li><b>Let me answer a search engine's check</b>: when a search engine asks, one window opens on your computer for you to answer it, and asks again in the same window if it asks again. Nothing answers it for you: if nobody does, searching stops for that run.</li>
            <li><b>Also save a person's own address</b>: by default only company addresses are saved by themselves.</li>
          </ul>
          <p>Your Sources are kept in this browser, so everyone has their own. A company where nothing was found is left out of the next runs for two weeks; Sources has a button to look at them again.</p>
        </section>

        <section className="rdl-help-sec">
          <h3>What it does not read</h3>
          <p>
            Instagram, Facebook, LinkedIn, TikTok and the like do not let programs read their pages: they ask for a sign-in and block anything automatic,
            and they are not a mailing list. So their pages are never opened: the page only keeps the links to a company's Facebook and Instagram that its own
            website gives, or that a search for its name turns up. eBay's rules do not allow programs to read its pages either, and it shows them a security check. Bing and DuckDuckGo are searched, in your
            browser, a few seconds apart; if one asks for a person to check, nothing tries to get past it. Reading a company's own website is the
            way to its email: it shows the address and the links to the same social pages.
          </p>
        </section>

        <section className="rdl-help-sec">
          <h3>Add by hand</h3>
          <p>
            <b>Add by hand</b> is for looking at one thing yourself. <b>A website</b>: type a brand's own website and look at what it shows; tick the
            addresses you want and press Save. <b>UK tenders</b>: choose <b>Awarded contracts</b> (which companies won) or <b>Open tenders</b> (what
            is being bought now and when it closes) and press <b>Search</b>. A buyer's address is not ticked for you: it is published so that suppliers
            can ask about that one notice, so use it for that and not for a mailing list.
          </p>
        </section>

        <section className="rdl-help-sec">
          <h3>The list</h3>
          <p>
            Every saved address, where it came from (a Reddit post, a tender notice, or the website it was read from), and the links to the company's
            social pages. Addresses you save from a Reddit post's card land here too. <b>Do not email</b> is for anyone who asked to be left alone, or whom you decide not to write to.
            Those addresses stay on the list, so nobody saves them again, but they are never put in the download. <b>Download CSV</b> makes a
            spreadsheet file for your email program, with a column for each social network. Gmail-type addresses (Gmail, Yahoo and so on) are left out unless you switch them on,
            because they are often a person, not a company.
          </p>
        </section>

        <section className="rdl-help-sec rdl-help-note">
          <h3>Good to know</h3>
          <ul>
            <li>This page never sends any email. It only helps you find addresses and keep a list.</li>
            <li>
              Before you email anyone: say who you are, include a way to unsubscribe, and stop writing to anyone who asks. Writing to a person, or
              to a one-person business, has stricter rules than writing to a company. If you are not sure of the rules, ask whoever looks after
              them for your business.
            </li>
            <li>Only public pages and public notices are read. Keep where an address came from, so you can show it if you are asked.</li>
            <li>If you can look at the page but cannot change anything, you have view-only access. Ask an admin for Edit on Marketing.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
