/** A lead's real Instagram profile picture, falling back to the initials
 * avatar used everywhere else in chat when there isn't one (or it's expired
 * — Meta's picture URLs only last a few days, so a load failure is routine,
 * not exceptional). */

import { useState } from "react";
import { Avatar } from "../ui";
import { hueFor } from "../../lib/chatFormat";

export default function LeadAvatar({ convo, name, profilePic, size = 40 }) {
  const [broken, setBroken] = useState(false);
  const title = name || "Instagram user";

  if (profilePic && !broken) {
    return (
      <span className="kchat-av" style={{ width: size, height: size }}>
        <img
          src={profilePic}
          alt=""
          onError={() => setBroken(true)}
          style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }}
        />
      </span>
    );
  }

  return (
    <span className="kchat-av" style={{ width: size, height: size }}>
      <Avatar name={title} hue={hueFor(convo)} size={size} />
    </span>
  );
}
