import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../firebase";
import { TEAM_MEMBERS } from "../constants";
import { DEFAULT_NEPAL_ADMIN_PERMISSIONS } from "../utils/permissions";

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

        // Check if this email belongs to a known team member
        const teamMember = TEAM_MEMBERS.find(
          m => m.email.toLowerCase() === (firebaseUser.email || "").toLowerCase()
        );

        if (teamMember) {
          // Build profile from TEAM_MEMBERS — always available even if Firestore is unreachable
          const profileData = {
            uid:     firebaseUser.uid,
            name:    teamMember.name,
            role:    teamMember.appRole,   // "nepal_admin" / "uk_admin" / "employee"
            jobRole: teamMember.role,      // job title e.g. "Operations Head"
            location: teamMember.location,
            email:   firebaseUser.email,
          };

          // Try to sync to Firestore — but don't block on failure
          try {
            await setDoc(profileRef, profileData, { merge: true });

            // Read permissions from Firestore for all roles (to support custom overrides like Monika)
            const snap = await getDoc(profileRef);
            const data = snap.data();

            if (teamMember.appRole === "nepal_admin") {
              if (!data?.permissions) {
                await updateDoc(profileRef, { permissions: DEFAULT_NEPAL_ADMIN_PERMISSIONS });
                profileData.permissions = DEFAULT_NEPAL_ADMIN_PERMISSIONS;
              } else {
                let existingPerms = data.permissions;
                // Force production: true for Wilson, Anmol, Anusha
                const nameLower = teamMember.name.toLowerCase();
                if (["wilson", "anmol", "anusha"].includes(nameLower)) {
                  if (existingPerms.production !== true) {
                    existingPerms = { ...existingPerms, production: true };
                    await updateDoc(profileRef, { "permissions.production": true });
                  }
                }
                profileData.permissions = existingPerms;
              }
            } else if (data?.permissions) {
              profileData.permissions = data.permissions;
            }
          } catch (syncErr) {
            console.warn("Firestore sync failed (rules may need deploying):", syncErr.message);
            // App still works with local TEAM_MEMBERS data
            if (teamMember.appRole === "nepal_admin") {
              profileData.permissions = DEFAULT_NEPAL_ADMIN_PERMISSIONS;
            }
          }

          setProfile(profileData);
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
