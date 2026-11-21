---
name: society-branding
description: Use when changing how a society is shown in SocialPanel (header/sidebar logo and name) or the society logo upload in Society settings.
---

# Society branding in SocialPanel

- Signed-in SocialPanel shows the **society's logo and name** in the sidebar header and top bar instead of the NIVASA
  logo/name. No logo yet → a rounded tile with the society's initials (2 letters) in the brand colour. Long names wrap
  to 2 lines / truncate with a tooltip. The public pages (sign-in, registration) keep NIVASA branding.
- **Society settings → Logo**: upload PNG/JPG/WEBP ≤ 2 MB (square crop preview), Remove. Upload purpose
  `society_logo` (public media). `PATCH /society/profile { logoId | null }` (perm `society.manage`, like the rest of the
  profile). Audited `society.logo_updated`.
- The logo URL comes from the server: `GET /society/profile` → `logo:{_id,url}|null`; `/me` and `/auth/admin/login`
  `staffRoles[].society` include `logoUrl`; `GET /society/overview` → `society.logoUrl`. Master Admin society pages may
  show it too. Gate sign-in returns it for the app's gate header.
- Checks: SocialPanel api-check covers logo upload → profile → staffRoles logoUrl → remove; e2e screenshot of the
  sidebar with a logo and with initials.
