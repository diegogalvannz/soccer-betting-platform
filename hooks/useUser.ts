"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useUser() {
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        localStorage.setItem("userId", data.user.id);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        localStorage.setItem("userId", session.user.id);
      } else {
        setUserId(null);
        localStorage.removeItem("userId");
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return { userId };
}
