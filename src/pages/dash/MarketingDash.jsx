/**
 * The marketing co-ordinator and the content co-ordinators: the content
 * calendar is the job, so what is booked next leads (as on the mobile app's
 * marketing dashboard).
 *
 *   coming up      tasks    clock
 *   coming up      tasks    clock
 *   coming up      tasks    meta leads
 *   coming up      tasks    meta leads
 *
 * Meta leads, for someone who may not open Meta Ads, is their own month of attendance.
 */
import { useAuth } from "../../context/AuthContext";
import { BentoGrid, BentoPage, DashHead } from "../../components/bento/Bento";
import { sectionVisible, marketingTabAllowed } from "../../utils/permissions";
import { upcomingEntries, useAttendanceMonth, useDashData } from "./shared";
import { LoadError } from "./LoadError";
import { ClockRingTile, LeadsTile, MyAttendanceTile, MyTasksTile, UpcomingTile } from "./tiles";

const COLLECTIONS = { tasks: "tasks", calendar: "content_calendar", leads: "meta_leads" };
const LIVE = ["tasks", "content_calendar", "meta_leads"];

export default function MarketingDash() {
  const { profile } = useAuth();
  const derive = ({ tasks, calendar, leads }) => {
    const thisMonth = new Date().toISOString().slice(0, 7);
    return {
      myTasks: tasks.filter((t) => (t.assignee || "").toLowerCase() === (profile?.name || "").toLowerCase()),
      upcoming: upcomingEntries(calendar, 7),
      leads,
      monthCount: calendar.filter((e) => String(e.scheduledDate || "").slice(0, 7) === thisMonth).length,
    };
  };
  // The calendar and a person's own tasks are not split by region.
  const { data, error, reload } = useDashData({ collections: COLLECTIONS, live: LIVE, derive, regional: false });
  const [att, reloadAtt] = useAttendanceMonth(profile?.personId);
  const canLeads = sectionVisible(profile, "marketing") && marketingTabAllowed(profile, "meta_ads");
  const loading = !data;
  const d = data || {};

  return (
    <BentoPage>
      <DashHead profile={profile} />

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : (
        <BentoGrid layout="marketing">
          <UpcomingTile items={d.upcoming} monthCount={d.monthCount} loading={loading} />
          <MyTasksTile tasks={d.myTasks} loading={loading} />
          <ClockRingTile profile={profile} onClockChange={() => { reload(); reloadAtt(); }} />
          {canLeads
            ? <LeadsTile leads={d.leads} loading={loading} />
            : <MyAttendanceTile area="leads" counts={att.counts} monthAtt={att.monthAtt} loading={att.loading} />}
        </BentoGrid>
      )}
    </BentoPage>
  );
}
