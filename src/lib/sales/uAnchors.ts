import { SOLUTION_CATALOG } from "@/lib/solutions/solutionCatalog";

// U-Anchor product options for the commission-claim section. Shared by the
// Commission form and the Lead form's optional "also file a commission claim"
// section so the two never drift apart.
export const U_ANCHOR_OPTIONS = [
  "U2000 KEE",
  "U2000 PVC",
  "U2000 TPO",
  "U2200 Plate",
  "U2400 EPDM",
  "U2400 KEE",
  "U2400 PVC",
  "U2400 TPO",
  "U2600 APP",
  "U2600 SBS",
  "U2600 SBS Torch",
  "U2800 Coatings",
  "U3200 Plate",
  "U3400 EPDM",
  "U3400 KEE",
  "U3400 PVC",
  "U3400 TPO",
  "U3600 APP",
  "U3600 SBS",
  "U3600 SBS Torch",
  "U3800 Coatings",
];

// "Other items" for the commission claim = every solution label.
export const OTHER_ITEMS = SOLUTION_CATALOG.map((s) => s.label);
