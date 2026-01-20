import * as React from "react";
import { useLocation } from "react-router-dom";
import { saveToken } from "../lib/storage";

function useQuery() {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

export default function ImpersonatePage() {
  const q = useQuery();

  React.useEffect(() => {
    const token = String(q.get("token") || "").trim();

    // mini check JWT
    if (token && token.split(".").length === 3) {
      saveToken(token);
    }

    // reload complet => AuthProvider relit loadToken() + refreshMe()
    window.location.replace("/");
  }, [q]);

  return null; // invisible (redirige direct)
}
