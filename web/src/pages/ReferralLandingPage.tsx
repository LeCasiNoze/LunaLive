import * as React from "react";
import { useNavigate, useParams } from "react-router-dom";

const REF_KEY = "ref_slug";

export default function ReferralLandingPage() {
  const nav = useNavigate();
  const { slug } = useParams();

  React.useEffect(() => {
    const s = String(slug || "").trim();
    if (s) {
      sessionStorage.setItem(REF_KEY, s);
      sessionStorage.setItem("force_register", "1");
      nav(`/s/${encodeURIComponent(s)}`, { replace: true });
    } else {
      nav("/", { replace: true });
    }
  }, [slug, nav]);

  return null;
}
