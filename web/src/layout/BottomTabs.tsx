import * as React from "react";
import { NavLink } from "react-router-dom";

export function BottomTabs() {
  const tabClass = ({ isActive }: { isActive: boolean }) =>
    `tab ${isActive ? "active" : ""}`;

  return (
    <nav className="bottomTabs" aria-label="Navigation">
      <NavLink to="/" end className={tabClass}>
        <div className="tabIcon">●</div>
        <div className="tabLabel">Lives</div>
      </NavLink>
      <NavLink to="/browse" className={tabClass}>
        <div className="tabIcon">◔</div>
        <div className="tabLabel">Browse</div>
      </NavLink>
    </nav>
  );
}
