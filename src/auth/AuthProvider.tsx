import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthContextValue {
  /** `undefined` while the initial session check is in flight. */
  session: Session | null | undefined;
  profile: Profile | null;
  /**
   * Advisory only — gates UI affordances (showing/hiding the
   * Settings nav item, an admin-only button), nothing else. RLS is
   * the real gate; the client must never treat this as authoritative
   * (docs/DATABASE_SCHEMA.md §6 / the old app's `UserRole` doc made the
   * same point).
   */
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  // TanStack Query rather than a hand-rolled useState/useEffect fetch —
  // this is the app's one data layer (ROADMAP.md's Decisions locked), and
  // using it here too gets cancellation/loading/error handling for free
  // instead of re-implementing it.
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  // Masked to null whenever there's no session (rather than trusting
  // profileQuery's own possibly-stale cached data from a previous user).
  const profile = session ? (profileQuery.data ?? null) : null;

  const value: AuthContextValue = {
    session,
    profile,
    isAdmin: profile?.role === "admin",
    loading: session === undefined || (session !== null && profileQuery.isPending && !!userId),
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the provider + its hook are the standard, deliberate co-location for this pattern; splitting them into separate files buys nothing here.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used inside <AuthProvider>");
  return ctx;
}
