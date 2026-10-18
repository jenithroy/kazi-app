/**
 * Purchases, on the same glass frame as Finance: one screen, the table scrolls in its pane under a head that stays put, a purchase
 * is typed into and corrected in the card in the middle of the screen. It is the same pane as the Purchases section of Finance
 * (components/finance/tabs/PurchasesTab.jsx), so a purchase is entered and changed the same way from either; this page adds the
 * three numbers over it, where the spending went, and the way back to Finance.
 *
 * What it reads, who may change it, the numbering and every write are the old page's. (What is new: a purchase can be started here;
 * before, this page only listed and corrected them and the Finance page entered them.)
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BentoGrid, BentoPage, Figure, Money, Sub, Tile } from "../components/bento/Bento";
import { Icons } from "../components/ui";
import { RegionSwitch } from "../components/RegionSwitch";
import PeriodBar, { DateModeSwitch } from "../components/finance/PeriodBar";
import PurchasesTab from "../components/finance/tabs/PurchasesTab";
import CategoryRail from "../components/finance/CategoryRail";
import { FinanceProvider } from "../components/finance/FinanceContext";
import { plural, useShiftN } from "../components/finance/parts";
import "../components/finance/finance.css";
import usePurchasesData from "../hooks/usePurchasesData";
import useDateMode from "../hooks/useDateMode";
import { useAuth } from "../context/AuthContext";
import { useRegion } from "../context/RegionContext";
import { useCurrency } from "../context/CurrencyContext";
import { sectionCanEdit, financeTabAllowed, FINANCE_TAB_KEYS } from "../utils/permissions";
import { countUntagged, filterByRegion } from "../utils/region";
import { filterByDateRange, filterByFiscalYear, fiscalYearsIn, isDateRangeActive, isFiscalYearLabel } from "../utils/fiscalYear";
import { useFiscalYearFilter } from "../components/FiscalYearFilter";
import { useDateRangeFilter } from "../components/DateRangeFilter";
import { describePeriod } from "../lib/period";

const ico = { size: 14, sw: 1.8 };

export default function Purchases() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();
  const { region } = useRegion();
  const { ratesVersion } = useCurrency();
  const [dateMode, , show] = useDateMode();
  const data = usePurchasesData();
  const loading = data.status === "loading";

  const canEdit = sectionCanEdit(profile, "finance") && financeTabAllowed(profile, FINANCE_TAB_KEYS.purchases);
  const canEditTab = useCallback(() => canEdit, [canEdit]);
  // A position that cannot open the VAT bills cannot read them either, so "no bill filed" would be true of every VAT purchase: say nothing instead
  const canSeeBills = financeTabAllowed(profile, FINANCE_TAB_KEYS["vat bills"]);

  const [notice, setNotice] = useState(null);
  const timer = useRef(0);
  const notify = useCallback((text, tone = "bad") => {
    clearTimeout(timer.current);
    setNotice({ text, tone });
    timer.current = setTimeout(() => setNotice(null), 7000);
  }, []);

  // the region says whose purchases, the fiscal year which year of them, a From / To narrows that further
  const regionPurchases = useMemo(() => filterByRegion(data.purchases, region), [data.purchases, region]);
  const regionVatBills = useMemo(() => filterByRegion(data.vatBills, region), [data.vatBills, region]);
  const inventoryItems = useMemo(() => filterByRegion(data.inventoryItems, region), [data.inventoryItems, region]);
  const [fy] = useFiscalYearFilter();
  const fyActive = isFiscalYearLabel(fy);
  const [dateRange] = useDateRangeFilter();
  const purchases = useMemo(() => filterByDateRange(filterByFiscalYear(regionPurchases, fy), dateRange), [regionPurchases, fy, dateRange]);
  const yearsHere = useMemo(() => fiscalYearsIn(regionPurchases), [regionPurchases]);

  const total = useMemo(() => purchases.reduce((s, p) => s + Number(p.amountNPR || 0), 0), [purchases]);
  const vatIn = useMemo(() => purchases.reduce((s, p) => s + (p.vatBill === true ? Number(p.vatAmountNPR || 0) : 0), 0), [purchases]);
  const needs = useMemo(() => {
    if (!canSeeBills) return 0;
    const filed = new Set(regionVatBills.map((b) => b.purchaseId).filter(Boolean));
    return purchases.filter((p) => p.vatBill === true && !filed.has(p.id)).length;
  }, [purchases, regionVatBills, canSeeBills]);

  const newRef = useRef(null);
  useShiftN(canEdit ? () => newRef.current?.() : null);
  const ctx = {
    profile, region, show, status: data.status, loading, reload: data.reload, notify, newRef, canEditTab, canSeeBills,
    fy, fyActive, dateRange, periodActive: fyActive || isDateRangeActive(dateRange), ratesVersion, dateMode,
    purchases, regionPurchases, allPurchases: data.purchases, vatBills: regionVatBills, regionVatBills, inventoryItems,
    goToSource: (path, state) => navigate(path, { state }),
  };

  return (
    <FinanceProvider value={ctx}>
      <BentoPage className="fn-page fn-page--pur">
        <header className="kb-head">
          <div className="kb-head-l">
            <h1>Purchases</h1>
            <p className="kb-head-sub"><span>{describePeriod({ fy, range: dateRange, mode: dateMode })}</span></p>
          </div>
          <div className="kb-head-r fn-head-r">
            <button type="button" className="kb-pillbtn" onClick={() => navigate("/finance")}>
              <Icons.ChevronLeft size={14} sw={2} aria-hidden="true" /> Finance
            </button>
            <RegionSwitch untagged={countUntagged(data.purchases)} size="sm" />
            <DateModeSwitch />
            <PeriodBar years={yearsHere} />
          </div>
        </header>

        {notice && (
          <div className={`fn-banner fn-banner--${notice.tone}`} role={notice.tone === "bad" ? "alert" : "status"}>
            <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
            <span>{notice.text}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss"><Icons.X size={14} sw={2} aria-hidden="true" /></button>
          </div>
        )}
        {data.status === "ready" && data.failed.length > 0 && (
          <div className="fn-banner" role="status">
            <Icons.Alert size={16} sw={1.9} aria-hidden="true" />
            <span>Could not load {data.failed.map((c) => (c === "finance_purchases" ? "purchases" : c === "vat_bills" ? "VAT bills" : "stock items")).join(", ")}, so some figures may be missing or out of date.</span>
          </div>
        )}

        {data.status === "error" ? (
          <div className="kb-error" role="alert">
            <p>Purchases could not load. Check your connection and try again.</p>
            <button type="button" className="kb-btn kb-btn--ghost" onClick={data.reload}>Try again</button>
          </div>
        ) : (
          <BentoGrid layout="purchases">
            <Tile area="t1" icon={<Icons.Cart {...ico} />} title="Spent on purchases" loading={loading} className="fn-t">
              <Figure><Money npr={total} compact={Math.abs(total) >= 1e7} /></Figure>
              <Sub><b>{purchases.length}</b> {plural(purchases.length, "bill")}</Sub>
            </Tile>
            <Tile area="t2" icon={<Icons.File {...ico} />} title="VAT paid" loading={loading} className="fn-t">
              <Figure><Money npr={vatIn} compact={Math.abs(vatIn) >= 1e7} /></Figure>
              <Sub>on the purchases with a VAT bill</Sub>
            </Tile>
            <Tile area="t3" tone={needs > 0 ? "amber" : "default"} can={(p) => financeTabAllowed(p, FINANCE_TAB_KEYS["vat bills"])} icon={<Icons.Alert {...ico} />} title="VAT bills to file" loading={loading} className="fn-t">
              <Figure>{needs}</Figure>
              <Sub>{needs > 0 ? "purchases with no bill filed" : "every VAT purchase has its bill"}</Sub>
            </Tile>
            <CategoryRail purchases={purchases} loading={loading} />
            <PurchasesTab showRenumber initialQuery={location.state?.search || ""} labelledBy="" />
          </BentoGrid>
        )}
      </BentoPage>
    </FinanceProvider>
  );
}
