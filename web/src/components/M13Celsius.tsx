// M13Celsius — wrapper V3 du landing S1 Celsius
// Mappe les props V3 (pseudo / profileImageUrl / pseudoSub / affiLink) vers
// le landing standalone defini dans pages/S1CelsiusLanding.tsx

import * as React from "react";
import S1CelsiusLanding from "../pages/S1CelsiusLanding";

export type M13CelsiusProps = {
  pseudo?: string;
  profileImageUrl?: string;
  affiLink: string;
  // V3 props non utilisees par S1 mais acceptees pour compat avec le switch
  depositAmount?: number | null;
  bonusAmount?: number | null;
  theme?: any;
  pseudoStyle?: any;
  pseudoSub?: string;
};

export function M13Celsius(props: M13CelsiusProps) {
  return (
    <S1CelsiusLanding
      affiLink={props.affiLink}
      pseudo={props.pseudo}
      pseudoSub={props.pseudoSub}
      profileImageUrl={props.profileImageUrl}
    />
  );
}

export default M13Celsius;
