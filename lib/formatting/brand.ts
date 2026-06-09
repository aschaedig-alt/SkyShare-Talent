export const brandColors = {
  red: "#ba0c2f",
  cloudDancer: "#f0eee9",
  gold: "#eaaa00",
  sweet: "#a6c9e7",
  eden: "#466481",
  lea: "#0d2c43",
  grey: "#76787b",
  black: "#302f31"
} as const;

export const colorTokens = [
  { key: "lea", label: "Lea", value: brandColors.lea, use: "Primary nav, headers" },
  { key: "eden", label: "Eden", value: brandColors.eden, use: "Secondary blue-grey accents" },
  { key: "sweet", label: "Sweet", value: brandColors.sweet, use: "Soft highlights" },
  { key: "gold", label: "Gold", value: brandColors.gold, use: "Locked, warning, status" },
  { key: "cloudDancer", label: "Cloud Dancer", value: brandColors.cloudDancer, use: "Page background" },
  { key: "grey", label: "Grey", value: brandColors.grey, use: "Metadata" },
  { key: "black", label: "Black", value: brandColors.black, use: "Body text" },
  { key: "red", label: "Red", value: brandColors.red, use: "Destructive changes" }
];

export const typographyTokens = [
  { key: "font", label: "Font Family", value: "Verdana / locked" },
  { key: "h1", label: "H1 Job Title", value: "34px / 1.08 / 700" },
  { key: "h2", label: "H2 Section Heading", value: "18px / 1.25 / 700" },
  { key: "h3", label: "H3 Subheading", value: "15px / 1.3 / 700" },
  { key: "body", label: "Body", value: "14px / 1.65 / 400" },
  { key: "small", label: "Small / metadata", value: "12px / 1.4 / 600" }
];

export const layoutTokens = [
  { key: "header", label: "Header Bar", value: "Lea background, white title" },
  { key: "section", label: "Section Heading", value: "Gold rule, Eden label" },
  { key: "bullets", label: "Bullet List", value: "Consistent dot, 12px gap" },
  { key: "info", label: "Info Block", value: "Cloud Dancer fill, Eden border" },
  { key: "divider", label: "Divider", value: "1px Cloud Dancer line" },
  { key: "footer", label: "Footer Bar", value: "Lea CTA, white text" }
];
