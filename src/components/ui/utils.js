import { roundAmount } from "../../utils/format";

export const cn = (...xs) => xs.filter(Boolean).join(" ");

export const fmt = {
  gbp: (n) => "£" + roundAmount(n).toLocaleString("en-GB"),
  npr: (n) => "₨ " + roundAmount(n).toLocaleString("en-IN"),
  int: (n) => roundAmount(n).toLocaleString("en-GB"),
  pct: (n, d = 1) => Number(n).toFixed(d) + "%",
};
