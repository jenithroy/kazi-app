import { Tile } from "../bento/Bento";
import ClockInCard from "../ClockInCard";
import { Icons } from "../ui";

/**
 * The signed-in person's own clock-in: one circle with the time in it, pressed once. It is not a
 * link (this is already the attendance page), so the whole tile is just the ring and what it says.
 */
export default function ClockTile({ profile, onClockChange }) {
  return (
    <Tile area="clock" icon={<Icons.Clock size={14} sw={1.8} />} title="Clock in" align="top" className="at-clock">
      <ClockInCard variant="ring" showTime profile={profile} onClockChange={onClockChange} />
    </Tile>
  );
}
