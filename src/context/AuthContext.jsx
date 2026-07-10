import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { TEAM_MEMBERS } from "../constants";
import { DEFAULT_NEPAL_ADMIN_PERMISSIONS } from "../utils/permissions";
import { initPushNotifications } from "../utils/native";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        const profileRef = doc(db, "users", firebaseUser.uid);

        // 1. Try to find in firestore employees collection first
        let dbEmployee = null;
        try {
          const empQuery = query(
            collection(db, "employees"),
            where("email", "==", (firebaseUser.email || "").toLowerCase())
          );
          const empSnap = await getDocs(empQuery);
          if (!empSnap.empty) {
            dbEmployee = empSnap.docs[0].data();
          }
        } catch (err) {
          console.warn("Failed to fetch employee record from firestore:", err);
        }

        // Check if this email belongs to a known team member
        const teamMember = TEAM_MEMBERS.find(
          m => m.email.toLowerCase() === (firebaseUser.email || "").toLowerCase()
        );

        if (dbEmployee || teamMember) {
          const name = dbEmployee?.name || teamMember?.name || firebaseUser.displayName || firebaseUser.email;
          const status = dbEmployee?.status || "Active";
          
          // If status is Inactive, assign role "inactive", else resolve appRole
          // Safety fail-safe: admin@kazi.com must always have super_admin access to avoid lockout.
          const role = (firebaseUser.email || "").toLowerCase() === "admin@kazi.com"
            ? "super_admin"
            : (status === "Inactive" ? "inactive" : (dbEmployee?.appRole || teamMember?.appRole || "employee"));
          const jobRole = dbEmployee?.role || teamMember?.role || "";
          const location = dbEmployee?.location || teamMember?.location || "nepal";

          // Build profile from DB/TEAM_MEMBERS
          const profileData = {
            uid:     firebaseUser.uid,
            name,
            role,   // "nepal_admin" / "uk_admin" / "employee" / "inactive"
            jobRole,      // job title e.g. "Operations Head"
            location,
            email:   firebaseUser.email,
          };

          // Try to sync to Firestore — but don't block on failure
          try {
            await setDoc(profileRef, profileData, { merge: true });

            // Read permissions from Firestore for all roles (to support custom overrides like Monika)
            const snap = await getDoc(profileRef);
            const data = snap.data();

            if (role === "nepal_admin") {
              if (!data?.permissions) {
                await updateDoc(profileRef, { permissions: DEFAULT_NEPAL_ADMIN_PERMISSIONS });
                profileData.permissions = DEFAULT_NEPAL_ADMIN_PERMISSIONS;
              } else {
                let existingPerms = data.permissions;
                let needsUpdate = false;
                const updatedPerms = { ...existingPerms };

                // Merge default permissions if they are missing
                Object.keys(DEFAULT_NEPAL_ADMIN_PERMISSIONS).forEach(key => {
                  if (key === "finance") {
                    updatedPerms.finance = {
                      ...DEFAULT_NEPAL_ADMIN_PERMISSIONS.finance,
                      ...(existingPerms.finance || {})
                    };
                    if (JSON.stringify(updatedPerms.finance) !== JSON.stringify(existingPerms.finance || {})) {
                      needsUpdate = true;
                    }
                  } else if (existingPerms[key] === undefined) {
                    updatedPerms[key] = DEFAULT_NEPAL_ADMIN_PERMISSIONS[key];
                    needsUpdate = true;
                  }
                });

                // Force production: true for Wilson, Anmol, Anusha
                const emailLower = (firebaseUser.email || "").toLowerCase();
                if (["wilsonshah98765@gmail.com", "basnetanamol21@gmail.com", "anushapantaa@gmail.com"].includes(emailLower)) {
                  if (updatedPerms.production !== true) {
                    updatedPerms.production = true;
                    needsUpdate = true;
                  }
                }

                // Force tasks, library, inventory: true for Anusha
                if (emailLower === "anushapantaa@gmail.com") {
                  if (updatedPerms.tasks !== true) {
                    updatedPerms.tasks = true;
                    needsUpdate = true;
                  }
                  if (updatedPerms.library !== true) {
                    updatedPerms.library = true;
                    needsUpdate = true;
                  }
                  if (updatedPerms.inventory !== true) {
                    updatedPerms.inventory = true;
                    needsUpdate = true;
                  }
                }

                if (needsUpdate) {
                  await updateDoc(profileRef, { permissions: updatedPerms });
                }
                profileData.permissions = updatedPerms;
              }
            } else if ((firebaseUser.email || "").toLowerCase() === "sarbagyakarkig8@gmail.com") {
              let existingPerms = data?.permissions || {};
              if (existingPerms.marketing !== true) {
                const updatedPerms = { ...existingPerms, marketing: true };
                await updateDoc(profileRef, { permissions: updatedPerms });
                profileData.permissions = updatedPerms;
              } else {
                profileData.permissions = existingPerms;
              }
            } else if (data?.permissions) {
              profileData.permissions = data.permissions;
            }
          } catch (syncErr) {
            console.warn("Firestore sync failed (rules may need deploying):", syncErr.message);
            // App still works with local data
            if (role === "nepal_admin") {
              profileData.permissions = DEFAULT_NEPAL_ADMIN_PERMISSIONS;
            }
          }

          setProfile(profileData);
          initPushNotifications(async (token) => {
            if (token && firebaseUser?.uid) {
              await setDoc(doc(db, "users", firebaseUser.uid), { fcmToken: token }, { merge: true });
            }
          });
        } else {
          // Unknown user — load existing profile or create minimal default
          let loadedProfile = null;
          try {
            const profileSnap = await getDoc(profileRef);
            if (profileSnap.exists()) {
              loadedProfile = profileSnap.data();
            } else {
              const defaultProfile = {
                uid:      firebaseUser.uid,
                name:     firebaseUser.displayName || firebaseUser.email,
                role:     "employee",
                location: "nepal",
                email:    firebaseUser.email,
              };
              await setDoc(profileRef, defaultProfile);
              loadedProfile = defaultProfile;
            }
          } catch (syncErr) {
            console.warn("Firestore profile load failed:", syncErr.message);
            loadedProfile = {
              uid:   firebaseUser.uid,
              name:  firebaseUser.displayName || firebaseUser.email,
              role:  "employee",
              email: firebaseUser.email,
            };
          }
          setProfile(loadedProfile);
          initPushNotifications(async (token) => {
            if (token && firebaseUser?.uid) {
              await setDoc(doc(db, "users", firebaseUser.uid), { fcmToken: token }, { merge: true });
            }
          });
        }
      } catch (error) {
        console.error("Auth state error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const value = useMemo(
    () => ({
      user,
      profile,
      role: profile?.role,
      loading,
      logout: () => signOut(auth),
    }),
    [user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
