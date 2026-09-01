import { useEffect, useState } from "react";
import { fetchAll, subscribe } from "../lib/db";
import { useCurrency } from "../context/CurrencyContext";
import { Card, Icons } from "./ui";
import { useAuth } from "../context/AuthContext";

export default function BankBalanceWidget() {
  const { profile } = useAuth();
  const [txn, setTxn] = useState(null);
  const [loading, setLoading] = useState(true);
  const { fmt: fmtC } = useCurrency();

  useEffect(() => {
    if (!profile) return;
    const name = (profile.name || "").toLowerCase();
    const allowedNames = ["zen", "finn", "wilson", "admin"];
    if (!allowedNames.includes(name)) {
      setLoading(false);
      return;
    }

    let active = true;

    // Most recent transaction wins — its running `balance` is the bank balance.
    async function load() {
      try {
        const rows = await fetchAll("bank_transactions", {
          orderBy: "timestamp", orderDir: "desc", limit: 1,
        });
        if (!active) return;
        setTxn(rows[0] || null);
      } catch (error) {
        console.error("Error fetching bank balance:", error);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    // The n8n importer writes these in the background, so keep watching rather
    // than showing a balance that quietly goes stale.
    const unsubscribe = subscribe("bank_transactions", load);

    return () => { active = false; unsubscribe(); };
  }, [profile]);

  if (!profile) return null;
  const name = (profile.name || "").toLowerCase();
  const allowedNames = ["zen", "finn", "wilson", "admin"];
  if (!allowedNames.includes(name)) return null;

  if (loading) {
    return (
      <Card title="Cash at Bank" accent="var(--blue)">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", color: "var(--ink-4)", fontSize: 13 }}>
          <span className="kskel" style={{ width: "100%", height: 32 }} />
        </div>
      </Card>
    );
  }

  if (!txn) {
    return (
      <Card title="Cash at Bank" accent="var(--blue)">
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "12px 0", color: "var(--ink-4)", fontSize: 13, textAlign: "center" }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>🏦</div>
          <div style={{ fontWeight: 500, color: "var(--ink-3)" }}>No bank data available</div>
          <div style={{ fontSize: 11, color: "var(--ink-4)" }}>Waiting for incoming webhook transaction...</div>
        </div>
      </Card>
    );
  }

  const isDebit = txn.type?.toLowerCase() === "debit";

  return (
    <Card 
      title="Cash at Bank" 
      sub={`Last updated: ${txn.date || txn.timestamp}`} 
      accent="var(--blue)"
      className="kbank-balance-card"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "4px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <span className="num-xl" style={{ fontSize: 28, fontWeight: 800, color: "var(--blue)" }}>
            {fmtC(txn.balance)}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              padding: "2px 8px",
              borderRadius: "4px",
              background: isDebit ? "var(--terra-soft, #fff5f5)" : "var(--mint-soft, #f0fdf4)",
              color: isDebit ? "var(--terra, #9b1c1c)" : "var(--mint-deep, #166534)",
            }}>
              {isDebit ? "Debit" : "Credit"}
            </span>
            <span className="mono" style={{ fontSize: 12, fontWeight: 600, color: isDebit ? "var(--terra)" : "var(--mint-deep)" }}>
              {isDebit ? "-" : "+"} {fmtC(txn.amount)}
            </span>
          </div>
        </div>

        {txn.remarks && (
          <div 
            style={{ 
              fontSize: 11, 
              color: "var(--ink-4)", 
              background: "var(--bg-2, #f8fafc)",
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1.5px solid var(--line, #dde8dd)",
              whiteSpace: "nowrap", 
              overflow: "hidden", 
              textOverflow: "ellipsis",
              marginTop: 4
            }} 
            title={txn.remarks}
          >
            <span style={{ fontWeight: 600, color: "var(--ink-3)", marginRight: 4 }}>Remarks:</span>
            {txn.remarks}
          </div>
        )}
      </div>
    </Card>
  );
}
