/**
 * Every page's stylesheet, in one place, in a fixed order.
 *
 * The pages are loaded on demand (lib/lazyPages.js), but their CSS is not: it still ships as ONE stylesheet, and this
 * list is the order it was always joined in. The order matters because where two rules weigh the same the later one wins,
 * so a different order could change how a page looks. (vite.config.js sets build.cssCodeSplit to false for the same
 * reason.) src/styles.css is imported last, from main.jsx, as it always was.
 *
 * A new page that brings its own .css file just imports it from the page as usual: it is added to the end of the same
 * stylesheet. Add it here only if it must sit before one of these.
 */
import "./components/bento/bento.css";
import "./components/modal-glass.css";
import "./components/tasks/tasks.css";
import "./components/controls.css";
import "./components/attendance/attendance.css";
import "./components/production/production-dialogs.css";
import "./components/production/production.css";
import "./components/table/table.css";
import "./components/edit-card.css";
import "./components/inventory/inventory.css";
import "./components/finance/finance.css";
import "./components/filters/filters.css";
import "./components/budget/budget.css";
import "./components/billing/billing.css";
import "./components/viewer/viewer.css";
import "./components/salary-slip.css";
import "./components/employees/employees.css";
import "./components/roles/roles.css";
import "./components/leaderboard/leaderboard.css";
import "./components/sales/sales.css";
import "./components/customers/customers.css";
import "./components/chat/chat.css";
import "./components/marketing/marketing.css";
import "./components/meta/meta.css";
import "./components/photo-cropper.css";
import "./components/points.css";
import "./components/profile-theme.css";
import "./components/profile/profile.css";
import "./components/glass.css";
import "./components/nav-theme.css";
import "./components/system/system.css";
