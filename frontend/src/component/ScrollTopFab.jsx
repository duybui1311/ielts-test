import * as React from "react";
import { Fab, Zoom, useScrollTrigger } from "@mui/material";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";

/**
 * Floating "back to top" button. Appears once the page is scrolled past a
 * threshold and smooth-scrolls to the top. Sits above the mobile bottom dock
 * (and its iOS safe-area inset) so it never overlaps navigation.
 */
export default function ScrollTopFab() {
  const trigger = useScrollTrigger({ disableHysteresis: true, threshold: 360 });

  const handleClick = () => window.scrollTo({ top: 0, behavior: "smooth" });

  return (
    <Zoom in={trigger}>
      <Fab
        size="small"
        color="primary"
        aria-label="Back to top"
        onClick={handleClick}
        sx={{
          position: "fixed",
          right: { xs: 16, md: 24 },
          bottom: { xs: "calc(88px + env(safe-area-inset-bottom))", lg: 28 },
          zIndex: (theme) => theme.zIndex.appBar,
        }}
      >
        <KeyboardArrowUpRoundedIcon />
      </Fab>
    </Zoom>
  );
}
