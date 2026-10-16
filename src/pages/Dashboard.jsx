import { useAuth } from "../context/AuthContext";
import { dashFor } from "./dash/roles";
import OwnerDash from "./dash/OwnerDash";
import OpsDash from "./dash/OpsDash";
import AccountantDash from "./dash/AccountantDash";
import DesignerDash from "./dash/DesignerDash";
import MarketingDash from "./dash/MarketingDash";
import StaffDash from "./dash/StaffDash";

const DASHES = {
  owner: OwnerDash,
  ops: OpsDash,
  accountant: AccountantDash,
  designer: DesignerDash,
  marketing: MarketingDash,
  staff: StaffDash,
};

/**
 * The Dashboard: a bento of tiles that fits one screen, each tile a way into
 * the page that has the rest of it. Everyone gets the one built for their
 * position (see dash/roles.js; the same six as the mobile app), and the frame,
 * the tiles and the light / dark theme live in components/bento.
 *
 * The theme itself is applied by the shell (AppLayout); this page is the only
 * one that darkens its content so far, through the `.kb` tokens in bento.css.
 */
function Dashboard() {
  const { profile } = useAuth();

  const Dash = DASHES[dashFor(profile)];
  return <Dash />;
}

export default Dashboard;
