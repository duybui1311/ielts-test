import { createTheme, alpha } from "@mui/material/styles";

/**
 * IELTS Platform — distinctive product theme.
 * Bold indigo primary + warm amber accent, Inter, 12px radius, soft layered
 * shadows and smooth micro-transitions. Tuned for both light and dark mode.
 */

const FONT = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

// Soft, layered shadow used on cards/menus (lighter than MUI defaults).
const SOFT_SHADOW_LIGHT = "0 1px 2px rgba(16,24,40,0.04), 0 10px 28px rgba(16,24,40,0.06)";
const SOFT_SHADOW_DARK = "0 1px 2px rgba(0,0,0,0.45), 0 12px 30px rgba(0,0,0,0.55)";
// Stronger lift used on hover for interactive cards.
const HOVER_SHADOW_LIGHT = "0 6px 16px rgba(79,70,229,0.10), 0 18px 40px rgba(16,24,40,0.12)";
const HOVER_SHADOW_DARK = "0 8px 20px rgba(0,0,0,0.55), 0 22px 48px rgba(0,0,0,0.6)";

export function createAppTheme(mode = "light") {
  const isDark = mode === "dark";
  const softShadow = isDark ? SOFT_SHADOW_DARK : SOFT_SHADOW_LIGHT;
  const hoverShadow = isDark ? HOVER_SHADOW_DARK : HOVER_SHADOW_LIGHT;

  const palette = isDark
    ? {
        mode: "dark",
        primary: { main: "#818CF8", light: "#A5B4FC", dark: "#6366F1", contrastText: "#0B1020" },
        secondary: { main: "#FBBF24", light: "#FCD34D", dark: "#F59E0B", contrastText: "#1A1206" },
        success: { main: "#34D399", contrastText: "#06281C" },
        warning: { main: "#FB923C", contrastText: "#2A1206" },
        error: { main: "#F87171", contrastText: "#2A0A0A" },
        info: { main: "#60A5FA" },
        background: { default: "#0B1120", paper: "#151D2E" },
        divider: alpha("#E2E8F0", 0.12),
        text: { primary: "#E8EDF6", secondary: "#94A3B8", disabled: "#64748B" },
      }
    : {
        mode: "light",
        primary: { main: "#4F46E5", light: "#6366F1", dark: "#4338CA", contrastText: "#FFFFFF" },
        secondary: { main: "#F59E0B", light: "#FBBF24", dark: "#D97706", contrastText: "#1A1206" },
        success: { main: "#10B981", contrastText: "#FFFFFF" },
        warning: { main: "#F97316", contrastText: "#FFFFFF" },
        error: { main: "#EF4444", contrastText: "#FFFFFF" },
        info: { main: "#3B82F6" },
        background: { default: "#F5F6FB", paper: "#FFFFFF" },
        divider: "#E8EAF2",
        text: { primary: "#16203A", secondary: "#5B6678", disabled: "#9AA3B2" },
      };

  return createTheme({
    palette,
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: FONT,
      h1: { fontWeight: 800, letterSpacing: "-0.025em" },
      h2: { fontWeight: 800, letterSpacing: "-0.02em" },
      h3: { fontWeight: 800, letterSpacing: "-0.02em" },
      h4: { fontWeight: 800, letterSpacing: "-0.02em" },
      h5: { fontWeight: 700, letterSpacing: "-0.01em" },
      h6: { fontWeight: 700, letterSpacing: "-0.01em" },
      subtitle1: { fontWeight: 700, letterSpacing: "-0.01em" },
      subtitle2: { fontWeight: 600 },
      body1: { lineHeight: 1.6 },
      body2: { lineHeight: 1.55 },
      button: { fontWeight: 600, letterSpacing: 0 },
      overline: { fontWeight: 700, letterSpacing: "0.08em" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "@keyframes appFadeInUp": {
            from: { opacity: 0, transform: "translateY(8px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
          "@keyframes appFadeIn": {
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
          body: { scrollbarColor: `${alpha(isDark ? "#FFFFFF" : "#000000", 0.2)} transparent` },
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-thumb": {
            backgroundColor: alpha(isDark ? "#FFFFFF" : "#000000", 0.16),
            borderRadius: 8,
            border: "2px solid transparent",
            backgroundClip: "content-box",
          },
          "*::-webkit-scrollbar-thumb:hover": {
            backgroundColor: alpha(isDark ? "#FFFFFF" : "#000000", 0.28),
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          // kill MUI's dark-mode overlay gradient so dark surfaces stay flat
          root: { backgroundImage: "none" },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            borderRadius: 12,
            border: `1px solid ${palette.divider}`,
            boxShadow: softShadow,
            transition: "box-shadow .2s ease, transform .2s ease, border-color .2s ease",
          },
        },
      },
      MuiCardActionArea: {
        styleOverrides: {
          root: { borderRadius: 12 },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 10,
            textTransform: "none",
            paddingInline: 18,
            fontWeight: 600,
            transition: "transform .12s ease, box-shadow .2s ease, background-color .2s ease",
          },
          sizeLarge: { paddingBlock: 10, fontSize: "0.975rem" },
          containedPrimary: {
            boxShadow: `0 8px 20px ${alpha("#4F46E5", isDark ? 0.0 : 0.3)}`,
            "&:hover": {
              boxShadow: `0 10px 26px ${alpha("#4F46E5", isDark ? 0.25 : 0.38)}`,
              transform: "translateY(-1px)",
            },
          },
          containedSecondary: {
            "&:hover": { transform: "translateY(-1px)" },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: 600 },
          sizeSmall: { fontWeight: 600 },
        },
      },
      MuiTextField: { defaultProps: { size: "small" } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 10,
            transition: "box-shadow .2s ease",
            "&.Mui-focused": {
              boxShadow: `0 0 0 3px ${alpha(palette.primary.main, 0.18)}`,
            },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: "none", fontWeight: 600, minHeight: 48 },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { borderRadius: 8, fontSize: 12, fontWeight: 500, paddingBlock: 6, paddingInline: 10 },
        },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: 999, height: 8 } },
      },
    },
  });
}

export { SOFT_SHADOW_LIGHT, SOFT_SHADOW_DARK, HOVER_SHADOW_LIGHT, HOVER_SHADOW_DARK };
