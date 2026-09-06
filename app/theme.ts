import { createTheme } from "@mui/material/styles";

/**
 * The app's own design tokens, expressed as an MUI theme.
 *
 * These values are the same ones declared as CSS custom properties at the top
 * of `app/app.css` — this file is the second half of that source of truth, not
 * a new one. If a colour changes, change it in both places.
 *
 * Two deliberate choices:
 *
 * 1. No `CssBaseline`. Tailwind's preflight (via `@import "tailwindcss"`) is
 *    already the app's reset, and layering MUI's on top of it fights the
 *    hand-rolled card styles for no gain.
 * 2. `breakpoints.md` is pinned to 850 so `useMediaQuery(down("md"))` in
 *    routes/home.tsx lines up exactly with the `@media (max-width: 850px)`
 *    block in app.css. If you move one, move the other or the compact layout
 *    and the compact styling will disagree at the seam.
 */
const INK = "#172338";
const TEAL = "#0e786e";
const CORAL = "#ef715d";

export const theme = createTheme({
  breakpoints: { values: { xs: 0, sm: 560, md: 850, lg: 1200, xl: 1536 } },
  palette: {
    primary: { main: TEAL, dark: "#075f58", contrastText: "#ffffff" },
    secondary: { main: CORAL, dark: "#df604e", contrastText: "#ffffff" },
    text: { primary: INK, secondary: "#687384" },
    background: { default: "#f7f5ef", paper: "#fffefa" },
    divider: "#deddd5",
  },
  shape: { borderRadius: 5 },
  typography: {
    fontFamily: '"DM Sans", "Inter", ui-sans-serif, system-ui, sans-serif',
    button: { textTransform: "none", fontWeight: 800, letterSpacing: 0 },
  },
  components: {
    // Every control in this app is touched with a thumb far more often than a
    // mouse, so the base target is 44px rather than MUI's denser default.
    MuiButtonBase: { defaultProps: { disableRipple: false } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { minHeight: 44, borderRadius: 999, paddingInline: 16 },
      },
    },
  },
});

export default theme;
