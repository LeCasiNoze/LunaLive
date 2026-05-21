// M15Cyclope — wrapper V3 du landing Lovable Cyclope l'Heritier.
// Accepte les props V3 mais les ignore : le landing est livre tel quel.

import CyclopeLandingPage from "../pages/CyclopeLandingPage";

export type M15CyclopeProps = {
  pseudo?: string;
  profileImageUrl?: string;
  affiLink: string;
  depositAmount?: number | null;
  bonusAmount?: number | null;
  theme?: any;
  pseudoStyle?: any;
  pseudoSub?: string;
};

export function M15Cyclope(_props: M15CyclopeProps) {
  return <CyclopeLandingPage />;
}

export default M15Cyclope;
