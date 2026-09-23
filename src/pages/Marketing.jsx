import { useEffect, useState } from "react";
import MarketingCalendar from "../components/MarketingCalendar";
import MetaAdsPage from "../components/MetaAds/MetaAdsPage";
import { useAuth } from "../context/AuthContext";
import { marketingTabAllowed } from "../utils/permissions";
import { cn } from "../components/ui";

export default function Marketing() {
  const { profile } = useAuth();
  const canViewMetaAds = marketingTabAllowed(profile, "meta_ads");

  const [tab, setTab] = useState("calendar");

  // Permission can change under someone mid-session (role edited elsewhere,
  // or this is the first render before the profile has resolved) — bounce
  // back to Calendar rather than leaving a tab open that's no longer allowed.
  useEffect(() => {
    if (tab === "meta_ads" && !canViewMetaAds) setTab("calendar");
  }, [tab, canViewMetaAds]);

  if (!canViewMetaAds) return <MarketingCalendar />;

  return (
    <div className="kmkt-page">
      <div className="kmkt-tabs">
        <button
          type="button"
          className={cn("kmkt-tab", tab === "calendar" && "kmkt-tab--on")}
          onClick={() => setTab("calendar")}
        >
          Calendar
        </button>
        <button
          type="button"
          className={cn("kmkt-tab", tab === "meta_ads" && "kmkt-tab--on")}
          onClick={() => setTab("meta_ads")}
        >
          Meta Ads
        </button>
      </div>
      {tab === "calendar" ? <MarketingCalendar /> : <MetaAdsPage />}
    </div>
  );
}
