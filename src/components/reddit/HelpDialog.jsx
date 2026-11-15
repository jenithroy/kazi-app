/**
 * The "?" beside the header buttons opens this: how Reddit Leads works, in plain words.
 *
 * Written for the people who use the page (a clothing business, not a website team), so it uses no technical words: no "server", "archive",
 * "robots", "database" or "API". It uses the page's own words for what is on the screen (Check now, What to look for, Filters), so a person
 * can match what they read to what they see. When a button on the page is renamed, rename it here (test-help.mjs checks that every button named below is on the page, and that no technical word has crept in).
 *
 * A post in the list opens on Reddit and nothing else (the card with a status, brand, website, notes, the email finder and "Add as customer" went on
 * 2026-11-14, with the Status column, the Following up and Customers boxes and the status / website / email / note filters), so none of that is
 * described here.
 */
import Modal from "../Modal";

export default function HelpDialog({ onClose }) {
  return (
    <Modal
      title="How this page works" subtitle="Reddit Leads, in plain words" size="lg" glass className="kmodal--reddit" onClose={onClose}
      footer={<button type="button" className="primary-button" onClick={onClose}>Got it</button>}
    >
      <div className="rdl-help" tabIndex={0} role="region" aria-label="How this page works">
        <p className="rdl-help-lead">
          People on Reddit sometimes ask for someone to make their clothes. This page finds those posts for you, so you can reply to them.
        </p>

        <section className="rdl-help-sec">
          <h3>The page finds posts by itself</h3>
          <p>
            Every 30 minutes it reads the newest posts in the Reddit groups listed under <b>What to look for</b> (Reddit calls these groups
            "subreddits"). It keeps the posts that sound like someone who needs a manufacturer and lists them on this page.
            In a hurry? Press <b>Check now</b> to look straight away.
          </p>
        </section>

        <section className="rdl-help-sec">
          <h3>Reading the list of posts</h3>
          <ul>
            <li><b>Strong</b>, <b>Likely</b> and <b>Maybe</b> say how much a post sounds like a real buyer. Strong is very likely. Maybe is worth a quick look.</li>
            <li>The two small boxes at the top count the posts from the last day and from the last week.</li>
            <li>Use the search box and the <b>Filters</b> button (which group, how strong a match, the day it was posted) to find a post.</li>
          </ul>
        </section>

        <section className="rdl-help-sec">
          <h3>Opening a post</h3>
          <p>
            Click or tap a post and the real post opens on Reddit, in a new tab, so you can read all of it and reply there.
          </p>
        </section>

        <section className="rdl-help-sec">
          <h3>Changing what it looks for</h3>
          <p>
            <b>What to look for</b> lets you choose which Reddit groups to read and which words and phrases count. A change applies from
            the next check. Posts already on the list stay as they are.
          </p>
        </section>

        <section className="rdl-help-sec rdl-help-note">
          <h3>Good to know</h3>
          <ul>
            <li>The posts come from a free copy of Reddit that is sometimes a little late. If a check fails, a message at the top says so, and it tries again 30 minutes later.</li>
            <li>If a Strong match links to the poster's own shop, its company email address is found by itself and put on the Contact Finder page in the Marketing menu. Nothing is sent from here.</li>
            <li>If you can look at the page but cannot press <b>Check now</b> or change <b>What to look for</b>, you have view-only access. Ask an admin for Edit on Marketing.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
