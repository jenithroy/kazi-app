import { createContext, useContext } from "react";
import toast, { Toaster } from "react-hot-toast";

const RewardContext = createContext(null);

// ---------------------------------------------------------------------------
// RewardProvider
// Wrap the app (or a subtree) with this to get toast notifications for points
// and badge awards. Renders the react-hot-toast <Toaster /> positioned
// bottom-right with the app's mint-green palette.
// ---------------------------------------------------------------------------
export function RewardProvider({ children }) {
  return (
    <RewardContext.Provider value={null}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--mint-deep, #2d7a4f)",
            color: "#fff",
            fontWeight: 600,
          },
        }}
      />
    </RewardContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// useReward
// Returns helpers to fire point and badge toast notifications.
// ---------------------------------------------------------------------------
export function useReward() {
  // No context value needed — toast is module-level. The hook exists so
  // consumers have a single, stable import path that can be extended later.
  useContext(RewardContext); // keeps the context wiring in place

  function showPointsToast(points, reason) {
    toast.success(`+${points} pts · ${reason}`, {
      duration: 3500,
      style: {
        background: "var(--mint-deep, #2d7a4f)",
        color: "#fff",
        fontWeight: 600,
      },
    });
  }

  function showBadgeToast(badgeName, icon) {
    toast(`${icon} Badge earned: ${badgeName}`, {
      duration: 5000,
      style: {
        background: "#2d5a3d",
        color: "#fff",
        fontWeight: 700,
        fontSize: 15,
      },
    });
  }

  return { showPointsToast, showBadgeToast };
}
