import toast from "react-hot-toast";

/**
 * Short, passing messages: something saved, something failed. The <Toaster>
 * is already mounted by RewardProvider; this only gives every toast the kit's
 * look and a colour that matches what happened.
 *
 *   notify.success("Expense saved");
 *   notify.error("Could not save the expense. Check the connection and try again.");
 *   notify("Copied to clipboard");
 *
 * For a question that needs an answer use useConfirm; for a problem that stays
 * until it is fixed use a Banner. An error toast stays up longer, since it
 * usually needs reading.
 */
const base = {
  fontFamily: "var(--font)",
  fontSize: "13px",
  fontWeight: 600,
  lineHeight: 1.45,
  borderRadius: "var(--r-input)",
  padding: "10px 14px",
  boxShadow: "var(--shadow-pop)",
  maxWidth: "min(380px, calc(100vw - 32px))",
  color: "#fff",
};

const styled = (background, options = {}) => ({
  ...options,
  style: { ...base, background, ...options.style },
  iconTheme: { primary: "#fff", secondary: background },
});

export function notify(message, options) {
  return toast(message, { duration: 3500, ...styled("var(--dark)", options) });
}

notify.success = (message, options) => toast.success(message, { duration: 3500, ...styled("var(--mint-deep)", options) });
notify.error = (message, options) => toast.error(message, { duration: 6000, ...styled("var(--terra-ink)", options) });
notify.dismiss = (id) => toast.dismiss(id);
