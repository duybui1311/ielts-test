import { createTheme, alpha } from "@mui/material/styles";

/**
 * Bandly — bold, energetic product theme.
 *
 * Signature look: an indigo→violet→fuchsia brand gradient, a warm amber accent,
 * Inter type with tight headline tracking, generous 14px radius, layered soft
 * shadows with a coloured glow on interactive surfaces, glassy sticky bars and
 * smooth micro-motion. Tuned carefully for both light and dark mode.
 *
 * Custom tokens added to the theme object (read via `theme.gradients`,
 * `theme.glass`, `theme.customShadows`) let pages share the identity without
 * re-deriving colours.
 */

const FONT = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

// Signature brand gradient stops, reused across the app.
const BRAND_FROM = "#6366F1"; // indigo
const BRAND_MID = "#8B5CF6"; // violet
const BRAND_TO = "#EC4899"; // fuchsia

const SOFT_SHADOW_LIGHT = "0 1px 2px rgba(16,24,40,0.04), 0 12px 30px rgba(16,24,40,0.07)";
const SOFT_SHADOW_DARK = "0 1px 2px rgba(0,0,0,0.5), 0 14px 34px rgba(0,0,0,0.6)";
const HOVER_SHADOW_LIGHT = "0 10px 24px rgba(99,102,241,0.16), 0 22px 48px rgba(16,24,40,0.14)";
const HOVER_SHADOW_DARK = "0 12px 28px rgba(99,102,241,0.28), 0 26px 56px rgba(0,0,0,0.65)";

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
        background: { default: "#080B16", paper: "#121A2B" },
        divider: alpha("#E2E8F0", 0.12),
        text: { primary: "#EAF0FA", secondary: "#9AA8BE", disabled: "#62718A" },
      }
    : {
        mode: "light",
        primary: { main: "#4F46E5", light: "#6366F1", dark: "#4338CA", contrastText: "#FFFFFF" },
        secondary: { main: "#F59E0B", light: "#FBBF24", dark: "#D97706", contrastText: "#1A1206" },
        success: { main: "#10B981", contrastText: "#FFFFFF" },
        warning: { main: "#F97316", contrastText: "#FFFFFF" },
        error: { main: "#EF4444", contrastText: "#FFFFFF" },
        info: { main: "#3B82F6" },
        background: { default: "#F4F5FC", paper: "#FFFFFF" },
        divider: "#E7E9F4",
        text: { primary: "#141B33", secondary: "#586079", disabled: "#9AA3B6" },
      };

  // Shared gradient + surface tokens (custom theme extension).
  const gradients = {
    brand: `linear-gradient(135deg, ${BRAND_FROM} 0%, ${BRAND_MID} 55%, ${BRAND_TO} 100%)`,
    brandSoft: `linear-gradient(135deg, ${alpha(BRAND_FROM, 0.16)} 0%, ${alpha(BRAND_TO, 0.16)} 100%)`,
    hero: isDark
      ? `linear-gradient(150deg, #3730A3 0%, #6D28D9 50%, #9D174D 100%)`
      : `linear-gradient(150deg, #4338CA 0%, #7C3AED 52%, #DB2777 100%)`,
    ocean: "linear-gradient(135deg, #2563EB 0%, #06B6D4 100%)",
    sunset: "linear-gradient(135deg, #F59E0B 0%, #EF4444 50%, #EC4899 100%)",
    emerald: "linear-gradient(135deg, #059669 0%, #34D399 100%)",
    // Faint radial mesh painted behind the whole app for depth.
    mesh: isDark
      ? "radial-gradient(900px 500px at 12% -8%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(800px 480px at 100% 0%, rgba(236,72,153,0.12), transparent 55%)"
      : "radial-gradient(900px 520px at 10% -10%, rgba(99,102,241,0.10), transparent 60%), radial-gradient(820px 480px at 100% 0%, rgba(236,72,153,0.07), transparent 55%)",
  };

  const glass = {
    background: alpha(palette.background.paper, isDark ? 0.7 : 0.72),
    backdropFilter: "blur(12px) saturate(160%)",
    border: `1px solid ${palette.divider}`,
  };

  const customShadows = {
    card: softShadow,
    hover: hoverShadow,
    glow: `0 0 0 1px ${alpha(BRAND_FROM, 0.4)}, 0 12px 32px ${alpha(BRAND_FROM, isDark ? 0.4 : 0.28)}`,
    brandButton: `0 8px 22px ${alpha(BRAND_FROM, isDark ? 0.0 : 0.38)}`,
  };

  return createTheme({
    palette,
    gradients,
    glass,
    customShadows,
    brandStops: { from: BRAND_FROM, mid: BRAND_MID, to: BRAND_TO },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: FONT,
      h1: { fontWeight: 800, letterSpacing: "-0.03em" },
      h2: { fontWeight: 800, letterSpacing: "-0.025em" },
      h3: { fontWeight: 800, letterSpacing: "-0.025em" },
      h4: { fontWeight: 800, letterSpacing: "-0.02em" },
      h5: { fontWeight: 800, letterSpacing: "-0.015em" },
      h6: { fontWeight: 700, letterSpacing: "-0.01em" },
      subtitle1: { fontWeight: 700, letterSpacing: "-0.01em" },
      subtitle2: { fontWeight: 600 },
      body1: { lineHeight: 1.6 },
      body2: { lineHeight: 1.55 },
      button: { fontWeight: 700, letterSpacing: 0 },
      overline: { fontWeight: 800, letterSpacing: "0.1em" },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "@keyframes appFadeInUp": {
            from: { opacity: 0, transform: "translateY(10px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
          "@keyframes appFadeIn": {
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
          "@keyframes appFloat": {
            "0%, 100%": { transform: "translateY(0)" },
            "50%": { transform: "translateY(-10px)" },
          },
          "@keyframes appGradientShift": {
            "0%, 100%": { backgroundPosition: "0% 50%" },
            "50%": { backgroundPosition: "100% 50%" },
          },
          "@keyframes appPulseGlow": {
            "0%, 100%": { opacity: 0.55, transform: "scale(1)" },
            "50%": { opacity: 0.9, transform: "scale(1.06)" },
          },
          html: { scrollBehavior: "smooth" },
          body: {
            scrollbarColor: `${alpha(isDark ? "#FFFFFF" : "#000000", 0.2)} transparent`,
            // Subtle brand mesh behind everything, fixed so it doesn't scroll.
            backgroundColor: palette.background.default,
            backgroundImage: gradients.mesh,
            backgroundAttachment: "fixed",
          },
          "*::-webkit-scrollbar": { width: 10, height: 10 },
          "*::-webkit-scrollbar-thumb": {
            backgroundColor: alpha(isDark ? "#FFFFFF" : "#000000", 0.16),
            borderRadius: 8,
            border: "2px solid transparent",
            backgroundClip: "content-box",
          },
          "*::-webkit-scrollbar-thumb:hover": {
            backgroundColor: alpha(isDark ? "#FFFFFF" : "#000000", 0.3),
          },
          "@media (prefers-reduced-motion: reduce)": {
            "*": { animationDuration: "0.001ms !important", animationIterationCount: "1 !important" },
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
            borderRadius: 16,
            border: `1px solid ${palette.divider}`,
            boxShadow: softShadow,
            backgroundImage: "none",
            transition: "box-shadow .22s ease, transform .22s ease, border-color .22s ease",
          },
        },
      },
      MuiCardActionArea: {
        styleOverrides: { root: { borderRadius: 16 } },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 11,
            textTransform: "none",
            paddingInline: 18,
            fontWeight: 700,
            transition: "transform .12s ease, box-shadow .22s ease, background-color .22s ease, filter .22s ease",
          },
          sizeLarge: { paddingBlock: 11, fontSize: "0.97rem" },
          containedPrimary: {
            background: gradients.brand,
            backgroundSize: "150% 150%",
            boxShadow: customShadows.brandButton,
            "&:hover": {
              boxShadow: `0 12px 28px ${alpha(BRAND_FROM, isDark ? 0.32 : 0.45)}`,
              transform: "translateY(-1px)",
              filter: "brightness(1.04)",
            },
            "&:active": { transform: "translateY(0)" },
          },
          containedSecondary: {
            "&:hover": { transform: "translateY(-1px)" },
          },
          outlined: {
            borderColor: palette.divider,
            "&:hover": { borderColor: alpha(palette.primary.main, 0.6), background: alpha(palette.primary.main, 0.06) },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 999, fontWeight: 700 },
          sizeSmall: { fontWeight: 700 },
        },
      },
      MuiTextField: { defaultProps: { size: "small" } },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 11,
            transition: "box-shadow .2s ease, border-color .2s ease",
            "&.Mui-focused": {
              boxShadow: `0 0 0 3px ${alpha(palette.primary.main, 0.2)}`,
            },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: { textTransform: "none", fontWeight: 700, minHeight: 48 },
        },
      },
      MuiTabs: {
        styleOverrides: {
          indicator: { height: 3, borderRadius: 3 },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { borderRadius: 9, fontSize: 12, fontWeight: 600, paddingBlock: 6, paddingInline: 10 },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 999, height: 8 },
          bar: { borderRadius: 999 },
        },
      },
      MuiAvatar: {
        styleOverrides: { root: { fontWeight: 700 } },
      },
    },
  });
}

export { SOFT_SHADOW_LIGHT, SOFT_SHADOW_DARK, HOVER_SHADOW_LIGHT, HOVER_SHADOW_DARK };
