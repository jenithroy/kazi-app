/**
 * The open role: its name and where it sits, who holds it, and what it is expected to log. Under 1100px the rail is not drawn,
 * so the card carries a dropdown to choose the role. The body scrolls inside the card; on a phone the page scrolls instead.
 */
import Select from "../Select";
import { EmptyNote } from "../bento/Bento";
import { Icons } from "../ui";
import { dutiesFor } from "../../lib/roles";
import { countLabel, dutyNote, locationOf } from "../../lib/rolesPage";
import { Duty, Member } from "./parts";

const WHERE = { uk: "UK", nepal: "Nepal" };

export default function RoleCard({ role, roleOptions, onPick, holders, directoryVisible, myId, loading }) {
  if (loading) {
    return (
      <section className="kb-tile rl-detail" style={{ gridArea: "detail" }} data-tile="detail" id="rl-pane" aria-busy="true">
        <div className="rl-dh" aria-hidden="true"><span className="kb-skel kb-skel--lg" /></div>
        <div className="rl-body" aria-hidden="true">
          <span className="kb-skel" /><span className="kb-skel" style={{ width: "48%" }} /><span className="kb-skel" style={{ width: "70%" }} />
        </div>
      </section>
    );
  }
  if (!role) {
    return (
      <section className="kb-tile rl-detail" style={{ gridArea: "detail" }} data-tile="detail" id="rl-pane">
        <EmptyNote icon={<Icons.Directors size={24} sw={1.5} aria-hidden="true" />}>No roles are set up yet.</EmptyNote>
      </section>
    );
  }

  const duties = dutiesFor(role);
  const where = directoryVisible ? WHERE[locationOf(holders)] : null;
  const mine = holders.some((p) => p.id === myId);
  const note = dutyNote(duties);

  return (
    <section className="kb-tile rl-detail" style={{ gridArea: "detail" }} data-tile="detail" id="rl-pane" role="tabpanel" aria-labelledby={`rl-tab-${role.id}`}>
      <div className="rl-pick">
        <Select variant="pill" label="Role" value={role.id} onChange={onPick} options={roleOptions} searchable={false} on={false} />
      </div>
      <header className="rl-dh">
        <div className="rl-dh-t">
          <h2>{role.label}</h2>
          {where && <span className="kb-tag">{where}</span>}
          {directoryVisible && <span className="kb-tag">{countLabel(holders.length)}</span>}
          {mine && <span className="kb-tag kb-tag--good">Your role</span>}
        </div>
        {role.description && <p>{role.description}</p>}
      </header>

      <div className="rl-body">
        <section aria-labelledby="rl-h-people">
          <h3 className="rl-sec-h" id="rl-h-people">People{directoryVisible && <i>{holders.length}</i>}</h3>
          {!directoryVisible ? (
            <p className="rl-note">Who holds this role is not shown to your position.</p>
          ) : holders.length === 0 ? (
            <p className="rl-note">No one currently in this role.</p>
          ) : (
            <ul className="rl-mems">
              {holders.map((m) => <Member key={m.id} m={m} isYou={m.id === myId} />)}
            </ul>
          )}
        </section>

        <section className="rl-grow" aria-labelledby="rl-h-duties">
          <h3 className="rl-sec-h" id="rl-h-duties">What this role logs{duties?.length > 0 && <i>{duties.length}</i>}</h3>
          {note ? (
            <div className="kb-empty rl-empty">
              {duties === undefined ? <Icons.Info size={22} sw={1.5} aria-hidden="true" /> : <Icons.Directors size={22} sw={1.5} aria-hidden="true" />}
              <span>{note}</span>
            </div>
          ) : (
            <ol className="rl-duties">
              {duties.map((d) => <Duty key={d.what} d={d} />)}
            </ol>
          )}
        </section>
      </div>
    </section>
  );
}
