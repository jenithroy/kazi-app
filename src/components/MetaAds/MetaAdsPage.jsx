import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { marketingTabCanEdit } from "../../utils/permissions";
import { cn } from "../ui";
import Overview from "./Overview";
import Campaigns from "./Campaigns";
import Attribution from "./Attribution";
import Settings from "./Settings";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "attribution", label: "Attribution" },
  { id: "settings", label: "Settings" },
];

export default function MetaAdsPage() {
  const { profile } = useAuth();
  const canEdit = marketingTabCanEdit(profile, "meta_ads");
  const [tab, setTab] = useState("overview");

  return (
    <div className="kmkt-metaads">
      <div className="kmkt-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn("kmkt-tab", "kmkt-tab--sub", tab === t.id && "kmkt-tab--on")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="kmkt-metaads-body">
        {tab === "overview" && <Overview />}
        {tab === "campaigns" && <Campaigns canEdit={canEdit} />}
        {tab === "attribution" && <Attribution />}
        {tab === "settings" && <Settings canEdit={canEdit} />}
      </div>
    </div>
  );
}
