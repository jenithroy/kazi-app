/**
 * The "?" beside the header buttons opens this: how Reddit Leads works, in plain words.
 *
 * Written for the people who use the page (a clothing business, not a website team), so it uses no technical words: no "server", "archive",
 * "robots", "database" or "API". It uses the page's own words for what is on the screen (Posts, Email list, Check now, What to look for,
 * Find emails, Add as customer, Do not email, Download CSV), so a person can match what they read to what they see. When a button on the
 * page is renamed, rename it here (test-help.mjs checks that every button named below is on the page, and that no technical word has crept in).
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
          People on Reddit sometimes ask for someone to make their clothes. This page finds those posts for you, so you can reply to them
          and, if you like, keep the brand's email address.
        </p>

        <section className="rdl-help-sec">
          <h3>The page finds posts by itself</h3>
          <p>
            Every 30 minutes it reads the newest posts in the Reddit groups listed under <b>What to look for</b> (Reddit calls these groups
            "subreddits"). It keeps the posts that sound like someone who needs a manufacturer and shows them in the <b>Posts</b> tab.
            In a hurry? Press <b>Check now</b> to look straight away.
          </p>
        </section>

        <section className="rdl-help-sec">
          <h3>Reading the Posts tab</h3>
          <ul>
            <li><b>Strong</b>, <b>Likely</b> and <b>Maybe</b> say how much a post sounds like a real buyer. Strong is very likely. Maybe is worth a quick look.</li>
            <li>The four small boxes at the top count the new posts, the posts from the last day, the ones you are following up, and the ones that became customers.</li>
            <li>Use the search box and the <b>Filters</b> button to find a post.</li>
          </ul>
        </section>

        <section className="rdl-help-sec">
          <h3>Working on a post</h3>
          <p>
            Click a post to open it. <b>Read it on Reddit</b> opens the real post, so you can reply there. Then keep track here: choose a
            status (New, Contacted, Replied, Not a fit or Customer), and write the brand's name, its website and your notes. Everyone on the
            team can see what you wrote. Posts are never deleted. If one is no use, choose <b>Not a fit</b> and it moves out of the way.
          </p>
        </section>

        <section className="rdl-help-sec">
          <h3>Finding an email address</h3>
          <p>
            If the brand has a website, type it in and press <b>Find emails</b>. The page looks at that one website only: its home page and
            up to two contact pages, the same pages anyone can open. It shows the email addresses written there. Tick the ones you want and
            press Save, and they join the Email list. It never searches Google, Instagram or Facebook.
          </p>
        </section>

        <section className="rdl-help-sec">
          <h3>Turning a post into a customer</h3>
          <p>
            When a brand becomes a real customer, type its name, save, then press <b>Add as customer</b>. It adds them to the Customers
            page and marks the post as a customer. You need access to Customers for this.
          </p>
        </section>

        <section className="rdl-help-sec">
          <h3>The Email list tab</h3>
          <p>
            Every saved address, and where it was found. Use <b>Find from a website</b> to add more. <b>Do not email</b> is for anyone who
            asked to be left alone, or whom you decide not to write to. Those addresses stay on the list, so nobody saves them again, but
            they are never put in the download. <b>Download CSV</b> makes a spreadsheet file for your email program. Gmail-type addresses
            (Gmail, Yahoo and so on) are left out unless you switch them on, because they are often a person, not a company.
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
            <li>This page never sends any email. It only helps you find people and keep a list.</li>
            <li>
              Before you email anyone: say who you are, include a way to unsubscribe, and stop writing to anyone who asks. If you are not
              sure of the rules, ask whoever looks after them for your business.
            </li>
            <li>The posts come from a free copy of Reddit that is sometimes a little late. If a check fails, a message at the top says so, and it tries again 30 minutes later.</li>
            <li>If you can look at the page but cannot change anything, you have view-only access. Ask an admin for Edit on Marketing.</li>
          </ul>
        </section>
      </div>
    </Modal>
  );
}
