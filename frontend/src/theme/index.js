import { createTheme, alpha } from "@mui/material/styles";

/**
 * Bandly — clean, minimal product theme.
 *
 * Palette (colorhunt 0046ff-73c8d2-f5f1dc-ff9013): a vivid blue primary, a soft
 * teal accent, a warm cream canvas and an orange call-to-action. Inter type with
 * tight headline tracking, a generous 14px radius, restrained flat shadows and a
 * single blue→teal brand gradient kept for hero moments only. Tuned for both
 * light and dark mode.
 *
 * Custom tokens added to the theme object (read via `theme.gradients`,
 * `theme.glass`, `theme.customShadows`) let pages share the identity without
 * re-deriving colours.
 */

const FONT = `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

// Signature brand gradient stops, reused across the app: blue → teal.
const BRAND_FROM = "#0046FF"; // blue
const BRAND_MID = "#2D7BE0"; // blue/teal midpoint
const BRAND_TO = "#73C8D2"; // teal
const ACCENT = "#FF9013"; // orange call-to-action

// Restrained, mostly-neutral shadows for a flatter, minimal feel.
const SOFT_SHADOW_LIGHT = "0 1px 2px rgba(16,24,40,0.04), 0 6px 16px rgba(16,24,40,0.05)";
const SOFT_SHADOW_DARK = "0 1px 2px rgba(0,0,0,0.5), 0 10px 24px rgba(0,0,0,0.5)";
const HOVER_SHADOW_LIGHT = "0 6px 16px rgba(0,70,255,0.10), 0 14px 32px rgba(16,24,40,0.10)";
const HOVER_SHADOW_DARK = "0 8px 20px rgba(0,70,255,0.22), 0 18px 40px rgba(0,0,0,0.6)";

export function createAppTheme(mode = "light") {
  const isDark = mode === "dark";
  const softShadow = isDark ? SOFT_SHADOW_DARK : SOFT_SHADOW_LIGHT;
  const hoverShadow = isDark ? HOVER_SHADOW_DARK : HOVER_SHADOW_LIGHT;

  const palette = isDark
    ? {
        mode: "dark",
        primary: { main: "#5B8CFF", light: "#88AAFF", dark: "#0046FF", contrastText: "#06122E" },
        secondary: { main: "#FF9F3D", light: "#FFBB6E", dark: "#E07400", contrastText: "#2A1500" },
        success: { main: "#34D399", contrastText: "#06281C" },
        warning: { main: "#FBBF24", contrastText: "#2A1206" },
        error: { main: "#F87171", contrastText: "#2A0A0A" },
        info: { main: "#73C8D2", light: "#9BDAE1", dark: "#3FB0BD", contrastText: "#06222A" },
        background: { default: "#0A0F1E", paper: "#121A2B" },
        divider: alpha("#E2E8F0", 0.12),
        text: { primary: "#EAF0FA", secondary: "#9AA8BE", disabled: "#62718A" },
      }
    : {
        mode: "light",
        primary: { main: "#0046FF", light: "#4178FF", dark: "#0036C7", contrastText: "#FFFFFF" },
        secondary: { main: "#FF9013", light: "#FFAA4A", dark: "#E07400", contrastText: "#3A1D00" },
        success: { main: "#0E9E6E", contrastText: "#FFFFFF" },
        warning: { main: "#E08600", contrastText: "#FFFFFF" },
        error: { main: "#E5484D", contrastText: "#FFFFFF" },
        info: { main: "#2BA8B5", light: "#73C8D2", dark: "#1E7E89", contrastText: "#FFFFFF" },
        background: { default: "#F5F1DC", paper: "#FFFFFF" },
        divider: "#E7E1CB",
        text: { primary: "#16243B", secondary: "#5A6475", disabled: "#9AA3B6" },
      };

  // Shared gradient + surface tokens (custom theme extension).
  const gradients = {
    brand: `linear-gradient(135deg, ${BRAND_FROM} 0%, ${BRAND_MID} 55%, ${BRAND_TO} 100%)`,
    brandSoft: `linear-gradient(135deg, ${alpha(BRAND_FROM, 0.16)} 0%, ${alpha(BRAND_TO, 0.16)} 100%)`,
    hero: isDark
      ? `linear-gradient(150deg, #00257A 0%, #0B3FB0 50%, #2C7E8C 100%)`
      : `linear-gradient(150deg, #0046FF 0%, #1E6FD8 50%, #73C8D2 100%)`,
    ocean: `linear-gradient(135deg, ${BRAND_FROM} 0%, ${BRAND_TO} 100%)`,
    sunset: `linear-gradient(135deg, ${ACCENT} 0%, #FFB347 100%)`,
    emerald: "linear-gradient(135deg, #0E9E6E 0%, #34D399 100%)",
    // Minimal look: no painted background mesh — the app sits on a flat canvas.
    mesh: "none",
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
      MuiSnackbar: {
        styleOverrides: {
          // Keep bottom-anchored toasts clear of the mobile bottom nav dock
          // (shown below the lg breakpoint).
          anchorOriginBottomCenter: {
            "@media (max-width:1199.95px)": { bottom: "calc(74px + env(safe-area-inset-bottom))" },
          },
          anchorOriginBottomLeft: {
            "@media (max-width:1199.95px)": { bottom: "calc(74px + env(safe-area-inset-bottom))" },
          },
          anchorOriginBottomRight: {
            "@media (max-width:1199.95px)": { bottom: "calc(74px + env(safe-area-inset-bottom))" },
          },
        },
      },
    },
  });
}

export { SOFT_SHADOW_LIGHT, SOFT_SHADOW_DARK, HOVER_SHADOW_LIGHT, HOVER_SHADOW_DARK };
