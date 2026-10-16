/**
 * The fashion designers: their own work, the floor, and what the floor is short
 * of, same as the mobile app's designer dashboard. They own the material side,
 * so low stock gets the room.
 *
 *   tasks    production        clock
 *   tasks    production        clock
 *   stock                      samples
 *   stock                      samples
 */
import { useAuth } from "../../context/AuthContext";
import { RegionSwitch } from "../../components/RegionSwitch";
import { BentoGrid, BentoPage, DashHead } from "../../components/bento/Bento";
import { lowStockItems, useDashData } from "./shared";
import { LoadError } from "./LoadError";
import { ClockRingTile, MyTasksTile, OrdersTile, SamplesTile, StockTile } from "./tiles";

const COLLECTIONS = { tasks: "tasks", orders: "orders", inventory: "inventory", samples: "samples" };
const LIVE = ["orders", "tasks", "samples"];

export default function DesignerDash() {
  const { profile } = useAuth();
  // `tasks.assignee` is a display name, so tasks are matched on it.
  const derive = ({ tasks, orders, inventory, samples }) => ({
    myTasks: tasks.filter((t) => (t.assignee || "").toLowerCase() === (profile?.name || "").toLowerCase()),
    orders,
    lowItems: lowStockItems(inventory),
    sampleCounts: samples.reduce((c, x) => ({ ...c, [x.status]: (c[x.status] || 0) + 1 }), {}),
    openSamples: samples
      .filter((x) => x.status === "Pending" || x.status === "In Revision")
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
      .slice(0, 8),
  });
  const { data, error, reload } = useDashData({ collections: COLLECTIONS, live: LIVE, derive });
  const loading = !data;
  const d = data || {};

  return (
    <BentoPage>
      <DashHead profile={profile}>
        <RegionSwitch hint={false} />
      </DashHead>

      {error && !data ? (
        <LoadError message={error} onRetry={reload} />
      ) : (
        <BentoGrid layout="designer">
          <MyTasksTile tasks={d.myTasks} loading={loading} />
          <OrdersTile orders={d.orders || []} loading={loading} />
          <ClockRingTile profile={profile} onClockChange={reload} />
          <StockTile area="stock" items={d.lowItems} loading={loading} />
          <SamplesTile data={d} loading={loading} />
        </BentoGrid>
      )}
    </BentoPage>
  );
}
