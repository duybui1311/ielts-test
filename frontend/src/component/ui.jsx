import * as React from "react";
import { Box, Card, Chip, Stack, Typography, alpha } from "@mui/material";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";

/** Shared presentational helpers for the Bandly look.
 *  Kept framer-motion-free on purpose so it stays in the light app shell —
 *  richer motion lives in the lazy-loaded pages (login, dashboards). */

// MUI palette slot per skill (kept for back-compat with older call sites).
export const SKILL_COLOR = {
  reading: "primary",
  listening: "success",
  writing: "secondary",
  speaking: "warning",
};

// Explicit, distinctive per-skill hues: reading=blue, listening=green,
// writing=purple, speaking=orange. Used for chips and card accents so the
// mapping stays consistent regardless of the active palette slots.
export const SKILL_HEX = {
  reading: "#3B82F6",
  listening: "#10B981",
  writing: "#8B5CF6",
  speaking: "#F97316",
};

// Per-skill gradients for accent bars / icon tiles.
export const SKILL_GRADIENT = {
  reading: "linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)",
  listening: "linear-gradient(135deg, #10B981 0%, #34D399 100%)",
  writing: "linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)",
  speaking: "linear-gradient(135deg, #F97316 0%, #F59E0B 100%)",
};

export function skillHex(skill) {
  return SKILL_HEX[String(skill || "").toLowerCase()] || "#64748B";
}

export function skillGradient(skill) {
  return SKILL_GRADIENT[String(skill || "").toLowerCase()] || "linear-gradient(135deg, #64748B 0%, #94A3B8 100%)";
}

export function bandColor(band) {
  if (band == null) return "text.secondary";
  if (band >= 7) return "success.main";
  if (band >= 5) return "warning.main";
  return "error.main";
}

/**
 * Themed Recharts props so axes, gridlines and tooltips stay readable in both
 * light and dark mode.
 */
export function chartTheme(theme) {
  const line = { stroke: theme.palette.divider };
  const textPrimary = theme.palette.text.primary;
  return {
    tick: { fontSize: 12, fill: theme.palette.text.secondary },
    axisLine: line,
    tickLine: line,
    grid: { stroke: theme.palette.divider },
    tooltip: {
      contentStyle: {
        background: theme.palette.background.paper,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 12,
        boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
        color: textPrimary,
      },
      labelStyle: { color: textPrimary, fontWeight: 700 },
      itemStyle: { color: textPrimary },
    },
  };
}

/** Headline text painted with the brand (or a custom) gradient. */
export function GradientText({ children, gradient, component = "span", sx, ...rest }) {
  return (
    <Box
      component={component}
      sx={[
        (theme) => ({
          display: "inline",
          background: gradient || theme.gradients.brand,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          WebkitTextFillColor: "transparent",
          color: "transparent",
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      {children}
    </Box>
  );
}

/**
 * Count-up number. Animates from 0 to `value` once on mount; renders the raw
 * value unchanged when it isn't a finite number (e.g. "3 / 3") or when the user
 * prefers reduced motion.
 */
export function AnimatedNumber({ value, duration = 900, decimals, prefix = "", suffix = "" }) {
  const numeric = typeof value === "number" ? value : Number(value);
  const isNum = Number.isFinite(numeric);
  const dp = decimals != null ? decimals : Number.isInteger(numeric) ? 0 : 1;
  const [display, setDisplay] = React.useState(isNum ? 0 : value);

  React.useEffect(() => {
    if (!isNum) {
      setDisplay(value);
      return;
    }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setDisplay(numeric);
      return;
    }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(numeric * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(numeric);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [numeric, isNum, duration, value]);

  const text = isNum ? Number(display).toFixed(dp) : display;
  return <>{prefix}{text}{suffix}</>;
}

/** Skill chip with a soft tinted background in the skill's signature colour. */
export function SkillChip({ skill, ...rest }) {
  if (!skill) return null;
  const hex = skillHex(skill);
  return (
    <Chip
      label={skill}
      size="small"
      sx={(theme) => ({
        textTransform: "capitalize",
        color: hex,
        bgcolor: alpha(hex, theme.palette.mode === "dark" ? 0.22 : 0.12),
        border: `1px solid ${alpha(hex, 0.32)}`,
        fontWeight: 700,
      })}
      {...rest}
    />
  );
}

/** Small "AI" pill that signals AI-powered grading — the key differentiator. */
export function AiBadge({ label = "AI", size = "small", sx, ...rest }) {
  return (
    <Chip
      size={size}
      icon={<AutoAwesomeRoundedIcon sx={{ fontSize: 15 }} />}
      label={label}
      sx={[
        {
          height: 22,
          fontWeight: 800,
          letterSpacing: "0.02em",
          color: "#fff",
          border: "none",
          background: "linear-gradient(135deg, #6366F1 0%, #A855F7 100%)",
          "& .MuiChip-icon": { color: "#fff", ml: 0.5 },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    />
  );
}

/** Rounded band-score pill, colour-coded by band. */
export function BandPill({ band, label = "Band", sx }) {
  const hasBand = band != null;
  return (
    <Stack
      direction="row"
      spacing={0.75}
      alignItems="center"
      sx={[
        (theme) => {
          const c = !hasBand
            ? theme.palette.text.disabled
            : band >= 7
            ? theme.palette.success.main
            : band >= 5
            ? theme.palette.warning.main
            : theme.palette.error.main;
          return {
            px: 1.25,
            py: 0.4,
            borderRadius: 999,
            bgcolor: alpha(c, theme.palette.mode === "dark" ? 0.2 : 0.12),
            border: `1px solid ${alpha(c, 0.35)}`,
            color: c,
          };
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, opacity: 0.85 }}>
        {label}
      </Typography>
      <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1 }}>
        {hasBand ? band : "—"}
      </Typography>
    </Stack>
  );
}

/** Wraps children in a subtle fade-in-up entrance animation (CSS, cheap). */
export function FadeIn({ children, delay = 0, sx, ...rest }) {
  return (
    <Box
      sx={[
        {
          animation: "appFadeInUp .5s cubic-bezier(0.22, 1, 0.36, 1) both",
          animationDelay: `${delay}ms`,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...rest}
    >
      {children}
    </Box>
  );
}

/** Page title + optional subtitle, eyebrow, leading gradient icon and action. */
export function PageHeader({ title, subtitle, action, eyebrow, icon, gradient }) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      alignItems={{ xs: "flex-start", sm: "center" }}
      spacing={2}
      sx={{ mb: 3 }}
    >
      {icon && (
        <Box
          sx={(theme) => ({
            width: 52,
            height: 52,
            borderRadius: 3,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color: "#fff",
            background: gradient || theme.gradients.brand,
            boxShadow: theme.customShadows.brandButton,
          })}
        >
          {icon}
        </Box>
      )}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {eyebrow && (
          <Typography variant="overline" color="primary" sx={{ display: "block", mb: 0.25 }}>
            {eyebrow}
          </Typography>
        )}
        <Typography variant="h4">{title}</Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}

/** Smaller section divider heading used inside pages. */
export function SectionHeading({ title, subtitle, icon, action, sx }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.25} sx={[{ mb: 1.5 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      {icon && (
        <Box
          sx={(theme) => ({
            width: 34, height: 34, borderRadius: 2, display: "grid", placeItems: "center",
            color: theme.palette.primary.main,
            bgcolor: alpha(theme.palette.primary.main, theme.palette.mode === "dark" ? 0.2 : 0.1),
          })}
        >
          {icon}
        </Box>
      )}
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" sx={{ lineHeight: 1.2 }}>{title}</Typography>
        {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
      </Box>
      {action}
    </Stack>
  );
}

/**
 * Compact KPI card: a gradient icon tile, a count-up value, and a hover lift +
 * coloured glow. `color` (a palette path like "primary.main" or a hex) tints
 * the tile; pass `gradient` to override with a full gradient. `trend` (+/- %)
 * renders a small delta chip when provided.
 */
export function StatCard({ icon, label, value, hint, color = "primary.main", gradient, trend, onClick, delay = 0 }) {
  const resolveColor = (theme) =>
    color.includes(".") ? theme.palette[color.split(".")[0]][color.split(".")[1] || "main"] : color;

  // Numeric values get the big count-up; long text values (e.g. a weakness
  // label) render smaller and wrap to two lines instead of truncating.
  const isNum = Number.isFinite(typeof value === "number" ? value : Number(value));
  const longText = !isNum && String(value).length > 6;
  const clamp2 = {
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  };

  return (
    <Card
      onClick={onClick}
      sx={(theme) => ({
        p: 2.5,
        height: "100%",
        position: "relative",
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        animation: "appFadeInUp .5s cubic-bezier(0.22,1,0.36,1) both",
        animationDelay: `${delay}ms`,
        "&:hover": {
          transform: "translateY(-4px)",
          boxShadow: theme.customShadows.hover,
          borderColor: alpha(resolveColor(theme), 0.4),
        },
        // Soft accent wash bleeding in from the top-right corner — kept inside
        // the card bounds and low-opacity so it reads as a subtle background,
        // not a floating blob.
        "&::after": {
          content: '""',
          position: "absolute",
          inset: 0,
          background: `radial-gradient(150px 150px at 100% 0%, ${alpha(
            resolveColor(theme),
            theme.palette.mode === "dark" ? 0.22 : 0.14
          )}, transparent 72%)`,
          pointerEvents: "none",
        },
      })}
    >
      <Stack direction="row" spacing={2} alignItems="center" sx={{ position: "relative" }}>
        <Box
          sx={(theme) => ({
            width: 52,
            height: 52,
            borderRadius: 2.5,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            color: gradient ? "#fff" : resolveColor(theme),
            background: gradient || alpha(resolveColor(theme), theme.palette.mode === "dark" ? 0.2 : 0.12),
            boxShadow: gradient ? theme.customShadows.brandButton : "none",
          })}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography
            variant={longText ? "subtitle1" : "h5"}
            fontWeight={800}
            title={longText ? String(value) : undefined}
            sx={{ letterSpacing: "-0.02em", lineHeight: 1.2, textTransform: longText ? "capitalize" : "none", ...(longText ? clamp2 : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }) }}
          >
            <AnimatedNumber value={value} />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.3, ...clamp2 }}>
            {label}
          </Typography>
          {hint && (
            <Typography variant="caption" color="text.disabled" noWrap display="block">
              {hint}
            </Typography>
          )}
        </Box>
        {trend != null && trend !== "" && (
          <Chip
            size="small"
            label={trend}
            sx={(theme) => {
              const up = String(trend).trim().startsWith("+");
              const c = up ? theme.palette.success.main : theme.palette.error.main;
              return {
                fontWeight: 800,
                color: c,
                bgcolor: alpha(c, theme.palette.mode === "dark" ? 0.2 : 0.12),
                border: `1px solid ${alpha(c, 0.3)}`,
              };
            }}
          />
        )}
      </Stack>
    </Card>
  );
}
