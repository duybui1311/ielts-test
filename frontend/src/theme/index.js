import { createTheme, alpha } from "@mui/material/styles";

/**
 * Modern Indigo SaaS theme — light + dark.
 * Indigo primary, cyan accent, Inter, 14px radius, soft shadows.
 */

const FONT = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

// Soft, layered shadow used on cards/menus (lighter than MUI defaults).
const SOFT_SHADOW_LIGHT = "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)";
const SOFT_SHADOW_DARK = "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.5)";

export function createAppTheme(mode = "light") {
  const isDark = mode === "dark";
  const softShadow = isDark ? SOFT_SHADOW_DARK : SOFT_SHADOW_LIGHT;

  const palette = isDark
    ? {
        mode: "dark",
        primary: { main: "#818CF8", light: "#A5B4FC", dark: "#6366F1", contrastText: "#0B1020" },
        secondary: { main: "#22D3EE", contrastText: "#06121A" },
        success: { main: "#34D399" },
        warning: { main: "#FBBF24" },
        error: { main: "#F87171" },
        info: { main: "#60A5FA" },
        background: { default: "#0F172A", paper: "#1E293B" },
        divider: alpha("#E2E8F0", 0.12),
        text: { primary: "#E2E8F0", secondary: "#94A3B8", disabled: "#64748B" },
      }
    : {
        mode: "light",
        primary: { main: "#4F46E5", light: "#6366F1", dark: "#4338CA", contrastText: "#FFFFFF" },
        secondary: { main: "#06B6D4", contrastText: "#FFFFFF" },
        success: { main: "#10B981" },
        warning: { main: "#F59E0B" },
        error: { main: "#EF4444" },
        info: { main: "#3B82F6" },
        background: { default: "#F7F8FB", paper: "#FFFFFF" },
        divider: "#E8EAF0",
        text: { primary: "#1E293B", secondary: "#64748B", disabled: "#94A3B8" },
      };

  return createTheme({
    palette,
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: FONT,
      h1: { fontWeight: 800, letterSpacing: "-0.02em" },
      h2: { fontWeight: 800, letterSpacing: "-0.02em" },
      h3: { fontWeight: 700, letterSpacing: "-0.01em" },
      h4: { fontWeight: 700, letterSpacing: "-0.01em" },
      h5: { fontWeight: 700 },
      h6: { fontWeight: 700 },
      subtitle1: { fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
      button: { fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-thumb": {
            backgroundColor: alpha(isDark ? "#FFFFFF" : "#000000", 0.18),
            borderRadius: 8,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          // kill MUI's dark-mode overlay gradient so dark cards stay flat
          root: { backgroundImage: "none" },
        },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${palette.divider}`,
            boxShadow: softShadow,
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 10, textTransform: "none", paddingInline: 16 },
          containedPrimary: {
            boxShadow: `0 6px 16px ${alpha("#4F46E5", isDark ? 0.0 : 0.28)}`,
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: 600 },
        },
      },
      MuiTextField: { defaultProps: { size: "small" } },
      MuiOutlinedInput: {
        styleOverrides: { root: { borderRadius: 10 } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { borderRadius: 8, fontSize: 12, fontWeight: 500 },
        },
      },
    },
  });
}

export { SOFT_SHADOW_LIGHT, SOFT_SHADOW_DARK };
