import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import MarketingCalendar from "../components/MarketingCalendar";
import MetaAdsPage from "../components/MetaAds/MetaAdsPage";
import { useAuth } from "../context/AuthContext";
import { marketingTabAllowed } from "../utils/permissions";
import { cn } from "../components/ui";

export default function Marketing() {
  const { profile } = useAuth();
  const canViewMetaAds = marketingTabAllowed(profile, "meta_ads");
  const [searchParams, setSearchParams] = useSearchParams();

  const urlTab = searchParams.get("tab");
  const tab = urlTab === "meta-ads" || urlTab === "meta_ads" ? "meta_ads" : "calendar";

  const setTab = (nextTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (nextTab === "calendar") {
        next.delete("tab");
        next.delete("view");
        next.delete("from");
        next.delete("to");
      } else {
        next.set("tab", "meta-ads");
      }
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    if (tab === "meta_ads" && !canViewMetaAds) {
      setTab("calendar");
    }
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
