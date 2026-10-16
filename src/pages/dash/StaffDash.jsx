/**
 * Everyone whose position has no dashboard of its own (floor staff, interns):
 * just their own day, same as the mobile app's "my day".
 *
 *   clock    tasks   attendance
 *   clock    tasks   attendance
 *   tickets  tasks   attendance
 *   tickets  tasks   attendance
 */
import { useAuth } from "../../context/AuthContext";
import { BentoGrid, BentoPage, DashHead } from "../../components/bento/Bento";
import { useAttendanceMonth, useDashData } from "./shared";
import { LoadError } from "./LoadError";
import { ClockRingTile, MyAttendanceTile, MyTasksTile, TicketTile } from "./tiles";

const COLLECTIONS = { tasks: "tasks" };
const LIVE = ["tasks"];
const PERSONAL_TARGET = 10; // tickets per person per month

export default function StaffDash() {
  const { profile } = useAuth();
  const name = profile?.name || "";

  // This month's attendance is read for this person alone, not the whole table,
  // so it is fetched here rather than through the shared collections.
  const derive = ({ tasks }) => {
    const myTasks = tasks.filter((t) => (t.assignee || "").toLowerCase() === name.toLowerCase());
    return { myTasks, myDone: myTasks.filter((t) => t.status === "Done").length };
  };
  const { data, error, reload } = useDashData({ collections: COLLECTIONS, live: LIVE, derive, regional: false });
  const [att, reloadAtt] = useAttendanceMonth(profile?.personId);

  const loading = !data;
  const d = data || {};

  return (
    <BentoPage>
      <DashHead profile={profile} />

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : (
        <BentoGrid layout="staff">
          <ClockRingTile profile={profile} onClockChange={() => { reload(); reloadAtt(); }} />
          <MyTasksTile tasks={d.myTasks} loading={loading} />
          <MyAttendanceTile counts={att.counts} monthAtt={att.monthAtt} loading={att.loading} />
          <TicketTile done={d.myDone} target={PERSONAL_TARGET} loading={loading} />
        </BentoGrid>
      )}
    </BentoPage>
  );
}
