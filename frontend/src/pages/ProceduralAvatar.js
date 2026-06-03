import * as React from "react";
import { Box } from "@mui/material";

export default function ProceduralAvatar({
  state = "idle",
  size = 340,
}) {
  const isWelcome = state === "welcome";
  const isTalking = state === "talking";
  const isTalkingFrowning = state === "talkingFrowning";
  const isThinking = state === "thinking";
  const isListening = state === "listening";
  const isPain = state === "pain";
  const isSeverePain = state === "severePain";
  const isHeadPain = state === "headPain";
  const isStomachPain = state === "stomachPain";
  const isHeadPainTalking = state === "headPainTalking";
  const isStomachPainTalking = state === "stomachPainTalking";

  // Combined pain states (head/stomach + pain/severePain)
  const isHeadPainPain = state === "headPainPain";
  const isHeadPainSeverePain = state === "headPainSeverePain";
  const isStomachPainPain = state === "stomachPainPain";
  const isStomachPainSeverePain = state === "stomachPainSeverePain";

  // Thinking variants for pain states
  const isHeadPainThinking = state === "headPainThinking";
  const isStomachPainThinking = state === "stomachPainThinking";
  const isPainThinking = state === "painThinking";
  const isSeverePainThinking = state === "severePainThinking";
const isHeadPainListening = state === "headPainListening";
const isStomachPainListening = state === "stomachPainListening";
const isPainListening = state === "painListening";
const isSeverePainListening = state === "severePainListening";
  // Core pain flags
  const isHeadPainCore = isHeadPain || isHeadPainTalking || isHeadPainThinking || isHeadPainPain || isHeadPainSeverePain || isHeadPainListening;
const isStomachPainCore = isStomachPain || isStomachPainTalking || isStomachPainThinking || isStomachPainPain || isStomachPainSeverePain || isStomachPainListening;
const isPainCore = isPain || isPainThinking || isHeadPainPain || isStomachPainPain || isPainListening;
const isSeverePainCore = isSeverePain || isSeverePainThinking || isHeadPainSeverePain || isStomachPainSeverePain || isSeverePainListening;
  const isInPain = isPainCore || isSeverePainCore || isHeadPainCore || isStomachPainCore;
  
const isListeningCore = isListening || isHeadPainListening || isStomachPainListening || isPainListening || isSeverePainListening;

  // Exact Duolingo-style color palette
  const skin = "#FFD0B5";
  const hair = "#FFCE00";
  const redJacket = "#FF4B4D";
  const redShorts = "#DA3838";
  const white = "#FFFFFF";
  const eyeDark = "#2A2A2A";
  const mouthDark = "#511D1D";
  const noseColor = "#F4A78A";
  const shadowColor = "#E2E2E2";
  const outline = "#1F1F1F";
  const strokeW = 1;

  const [wavePhase, setWavePhase] = React.useState("idle");
  const [leftFlailPhase, setLeftFlailPhase] = React.useState("idle");

  // idle → raising → waving → lowering → idle
  React.useEffect(() => {
    if (isWelcome) {
      setWavePhase("raising");
      setTimeout(() => setWavePhase("waving"), 400);
      setTimeout(() => setWavePhase("lowering"), 2400);
      setTimeout(() => setWavePhase("idle"), 2800);
    }
  }, [isWelcome]);

  React.useEffect(() => {
    if (isHeadPainCore || isStomachPainCore) {
      setLeftFlailPhase("flailing");
      const t = setTimeout(() => setLeftFlailPhase("idle"), 2000);
      return () => clearTimeout(t);
    } else {
      setLeftFlailPhase("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const isDown = wavePhase === "idle";
  const isLeftFlailing = leftFlailPhase === "flailing";

  // Right arm paths
  const rightUpperArmPath = isDown
    ? "M200 160 L212.5 185"
    : "M200 160 L226 150";

  const rightForearmPath = isDown
    ? "M212.5 185 L225 210"
    : "M226 150 L236 124";

  const rightHandTransform = isDown
    ? "translate(235, 230) scale(1) rotate(0)"
    : "translate(243, 105) scale(1) rotate(15)";

  const rightElbowOrigin = isDown ? "212.5px 185px" : "226px 150px";


  const showOpenHand = wavePhase === "waving" || wavePhase === "raising" || wavePhase === "lowering";

  const renderOpenHand = () => (
    <g transform="scale(0.8) translate(-3, -6)">
      <path
        d="M -12 -2 L 18 -2 L 18 12 Q 18 22 8 24 L -2 24 Q -12 22 -12 12 Z"
        fill={skin}
        stroke={outline}
        strokeWidth={strokeW}
        strokeLinejoin="round"
      />
      <path
        d="M -12 16 Q -18 10 -18 -4 Q -14 -10 -10 -2"
        fill={skin}
        stroke={outline}
        strokeWidth={strokeW}
        strokeLinecap="round"
      />
      <path d="M -9 -2 v -16 q 0 -4 3 -4 q 3 0 3 4 v 16" fill={skin} stroke={outline} strokeWidth={strokeW} strokeLinecap="round"/>
      <path d="M -2 -3 v -18 q 0 -4 3 -4 q 3 0 3 4 v 18" fill={skin} stroke={outline} strokeWidth={strokeW} strokeLinecap="round"/>
      <path d="M 5 -2 v -16 q 0 -4 3 -4 q 3 0 3 4 v 16" fill={skin} stroke={outline} strokeWidth={strokeW} strokeLinecap="round"/>
      <path d="M 12 0 v -10 q 0 -4 3 -4 q 3 0 3 4 v 10" fill={skin} stroke={outline} strokeWidth={strokeW} strokeLinecap="round"/>
    </g>
  );

  return (
    <Box
      aria-label={`eddy-avatar-${state}`}
      sx={{
        width: size,
        height: size,
        display: "grid",
        placeItems: "center",
        userSelect: "none",
        "@keyframes blinkMinute": {
          "0%, 98%, 100%": { transform: "scaleY(1)" },
          "99%": { transform: "scaleY(0.05)" }
        },
        "& .blinkEye": {
          transformBox: "fill-box",
          transformOrigin: "center",
          animation: "blinkMinute 60s infinite",
        },
        "@keyframes talk": {
          "0%, 100%": { transform: "scaleY(0.75)" },
          "50%": { transform: "scaleY(1.25)" },
        },
        "@keyframes float": {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-4px)" },
        },
        "@keyframes dots": {
          "0%, 20%": { opacity: 0 },
          "40%, 100%": { opacity: 1 },
        },
        "& .armGroupL": {
          transformOrigin: "110px 155px"
        },
        "& .leftForearmFlail": {
          transformOrigin: "100px 155px",
          animation: isLeftFlailing
            ? "forearmFlail 0.35s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite"
            : "none",
          animationDelay: isLeftFlailing ? "0s" : "0s",
        },
        "& .leftHandFlail": {
          animation: isLeftFlailing
            ? "handFlail 0.35s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite"
            : "none",
        },
        "@keyframes forearmFlail": {
          "0%":   { transform: "rotate(0deg)" },
          "20%":  { transform: "rotate(22deg)" },
          "50%":  { transform: "rotate(-15deg)" },
          "80%":  { transform: "rotate(15deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
        "@keyframes handFlail": {
          "0%":   { transform: "rotate(0deg)" },
          "20%":  { transform: "rotate(30deg)" },
          "50%":  { transform: "rotate(-20deg)" },
          "80%":  { transform: "rotate(20deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
        "@keyframes talkMouth": {
          "0%": { transform: "scaleY(0.9)" },
          "50%": { transform: "scaleY(1.25)" },
          "100%": { transform: "scaleY(0.9)" }
        },
        "& .mouthGroup": {
          transformOrigin: "150px 132px",
          animation: (isTalking || isHeadPainTalking || isStomachPainTalking || isTalkingFrowning) ? "talkMouth 0.25s ease-in-out infinite" : "none"
        },
        "@keyframes painShake": {
          "0%": { transform: "translateX(0px)" },
          "25%": { transform: "translateX(-2px)" },
          "50%": { transform: "translateX(2px)" },
          "75%": { transform: "translateX(-2px)" },
          "100%": { transform: "translateX(0px)" }
        },
        "& .avatar-body": {
          transformOrigin: "150px 200px",
          transform: (isStomachPainCore) ? "rotate(6deg)" : "none",
          animation:
            isListeningCore
              ? "float 1.5s ease-in-out infinite"
              : isSeverePainCore
              ? "painShake 0.12s ease-in-out infinite"
              : isInPain
              ? "painShake 0.25s ease-in-out infinite"
              : "none",
        },
        "@keyframes realBlink": {
          "0%, 97%, 100%": { transform: "translateY(-100%)" },
          "98.5%": { transform: "translateY(0%)" }
        },
        "& .eyelid": {
          animation: "realBlink 4s infinite",
        },
        "@keyframes forearmWave": {
          "0%":   { transform: "rotate(0deg)" },
          "20%":  { transform: "rotate(18deg)" },
          "50%":  { transform: "rotate(-12deg)" },
          "80%":  { transform: "rotate(12deg)" },
          "100%": { transform: "rotate(0deg)" },
        },
      }}
    >
      <svg width={size} height={size} viewBox="0 0 300 300" fill="none">
        <ellipse cx="150" cy="285" rx="65" ry="8" fill={shadowColor} />

        <g className="avatar-body">
          {/* BACK LAYER */}
          <path d="M126 215 L118 288 L146 288 L146 215 Z" fill={skin} stroke={outline} strokeWidth={strokeW} strokeLinejoin="round"/>
          <path d="M174 215 L182 288 L154 288 L154 215 Z" fill={skin} stroke={outline} strokeWidth={strokeW} strokeLinejoin="round"/>
          <rect x="110" y="280" width="40" height="16" rx="8" fill={redJacket} stroke={outline} strokeWidth={strokeW} />
          <rect x="150" y="280" width="40" height="16" rx="8" fill={redJacket} stroke={outline} strokeWidth={strokeW} />
          <rect x="118" y="205" width="64" height="16" rx="6" fill={redShorts} stroke={outline} strokeWidth={strokeW} />
          <path d="M120 220 L148 220 L146 248 Q134 255 120 242 Z" fill={redShorts} stroke={outline} strokeWidth={strokeW} strokeLinejoin="round"/>
          <path d="M152 220 L180 220 L182 242 Q168 255 154 248 Z" fill={redShorts} stroke={outline} strokeWidth={strokeW} strokeLinejoin="round"/>

          {/* MIDDLE LAYER (BODY) */}
          <path d="M 120 140 L 180 140 C 205 155 205 215 180 215 L 120 215 C 95 215 95 155 120 140 Z" fill={redJacket} stroke={outline} strokeWidth={strokeW} strokeLinejoin="round" />
          <path d="M 141 140 L 159 140 L 152 165 L 148 165 Z" fill={white} />
          <rect x="148" y="165" width="4" height="48" fill={white} />

          {/* FRONT LAYER (HEAD & FACE) */}
          <circle cx="100" cy="115" r="12" fill={skin} stroke={outline} strokeWidth={strokeW} />
          <circle cx="200" cy="115" r="12" fill={skin} stroke={outline} strokeWidth={strokeW} />
          <path d="M 105 75 h 90 v 40 q 0 35 -25 35 h -40 q -25 0 -25 -35 z" fill={skin} stroke={outline} strokeWidth={strokeW} strokeLinejoin="round" />
          <path d="M100 85 L100 65 L115 70 L125 50 L145 65 L160 45 L175 60 L185 50 L190 70 L200 70 L200 85 Z" fill={hair} stroke={outline} strokeWidth={strokeW} strokeLinejoin="round" />

          {/* EYES */}
          <defs>
            <clipPath id="eyeView">
              <ellipse cx="135" cy="108" rx="12" ry="15" />
              <ellipse cx="165" cy="108" rx="12" ry="15" />
            </clipPath>
          </defs>
          <g>
            <ellipse cx="135" cy="108" rx="12" ry="15" fill={white} />
            <ellipse cx="165" cy="108" rx="12" ry="15" fill={white} />
            <ellipse cx="139" cy="110" rx="5" ry="9" fill={eyeDark} />
            <ellipse cx="169" cy="110" rx="5" ry="9" fill={eyeDark} />
            <g clipPath="url(#eyeView)">
                <rect className="eyelid" x="110" y="80" width="70" height="35" fill={skin} />
            </g>
            <ellipse cx="135" cy="108" rx="12" ry="15" fill="none" stroke={outline} strokeWidth={strokeW} />
            <ellipse cx="165" cy="108" rx="12" ry="15" fill="none" stroke={outline} strokeWidth={strokeW} />
          </g>

          {/* NOSE & MOUTH */}
          <path d="M150 118 L145 130 L155 130 Z" fill={noseColor}/>
          <g transform="translate(0,8)">
            {/* pain without talking */}
            {(isPainCore || isHeadPain || isSeverePainCore || isHeadPainThinking || isStomachPain || isStomachPainThinking) ? (
              <path d="M140 136 Q150 128 160 136" stroke={mouthDark} strokeWidth="6" fill="none" strokeLinecap="round" />
            ) : isTalkingFrowning ? (
              <g className="mouthGroup">
                <defs>
                  <clipPath id="painedMouthClip">
                    <path d="M138 136 C138 126 162 126 162 136 Z" />
                  </clipPath>
                </defs>
                <path d="M138 136 C138 126 162 126 162 136 Z" fill={mouthDark} />
                <g clipPath="url(#painedMouthClip)">
                  <rect x="140" y="126" width="20" height="4" rx="1" fill={white} />
                  <path d="M143 134 A10 6 0 0 1 157 134 Z" fill="#B03232" />
                </g>
                <path d="M138 136 C138 126 162 126 162 136 Z" fill="none" stroke={outline} strokeWidth={strokeW} />
              </g>
            ) : isHeadPainTalking || isStomachPainTalking ? (
              <g className="mouthGroup">
                <defs>
                  <clipPath id="painTalkMouthClip">
                    <path d="M138 136 C138 126 162 126 162 136 Z" />
                  </clipPath>
                </defs>
                <path d="M138 136 C138 126 162 126 162 136 Z" fill={mouthDark} />
                <g clipPath="url(#painTalkMouthClip)">
                  <rect x="140" y="126" width="20" height="4" rx="1" fill={white} />
                  <path d="M143 134 A10 6 0 0 1 157 134 Z" fill="#B03232" />
                </g>
                <path d="M138 136 C138 126 162 126 162 136 Z" fill="none" stroke={outline} strokeWidth={strokeW} />
              </g>
            ) : isTalking ? (
              <g className="mouthGroup">
                <path d="M135 125 C135 145 165 145 165 125 Z" fill={mouthDark} />
                <rect x="138" y="125" width="24" height="5" rx="1" fill={white} />
                <path d="M142 138 A12 10 0 0 0 158 138 Z" fill="#B03232" />
              </g>
            ) : (
              <path d="M140 132 Q150 140 160 132" stroke={mouthDark} strokeWidth="1" fill="none" />
            )}
          </g>

           {/* LEFT ARM */}
          <g className="armGroupL">
            {isStomachPain || isStomachPainTalking || isStomachPainThinking || isStomachPainPain || isStomachPainSeverePain ? (
              <>
                <path d="M100 155 Q110 180 130 195" fill="none" stroke={outline} strokeWidth="37" strokeLinecap="round" />
                <path d="M100 155 Q110 180 130 195" fill="none" stroke={redJacket} strokeWidth="35" strokeLinecap="round" />
                <circle cx="140" cy="200" r="15" fill={skin} stroke={outline} strokeWidth={strokeW} />
              </>
            ) : isHeadPain || isHeadPainTalking || isHeadPainThinking || isHeadPainPain || isHeadPainSeverePain ? (
              <>
                <path d="M100 155 Q105 120 125 100" fill="none" stroke={outline} strokeWidth="37" strokeLinecap="round" />
                <path d="M100 155 Q105 120 125 100" fill="none" stroke={redJacket} strokeWidth="35" strokeLinecap="round" />
                <circle cx="137" cy="90" r="15" fill={skin} stroke={outline} strokeWidth={strokeW} />
              </>
            ) : (
              <>
                <path d="M100 160 L75 210" fill="none" stroke={outline} strokeWidth="37" strokeLinecap="round" />
                <path d="M100 160 L75 210" fill="none" stroke={redJacket} strokeWidth="35" strokeLinecap="round" />
                <circle cx="65" cy="230" r="15" fill={skin} stroke={outline} strokeWidth={strokeW} />
              </>
            )}
          </g>


          {/* RIGHT ARM */}
          <g className="armGroupR">
            {(isHeadPainCore || isStomachPainCore) ? (
              <>
                <path
                  d={isStomachPainCore ? "M200 155 Q190 180 170 195" : "M200 155 Q195 120 175 100"}
                  fill="none"
                  stroke={outline}
                  strokeWidth="37"
                  strokeLinecap="round"
                />
                <path
                  d={isStomachPainCore ? "M200 155 Q190 180 170 195" : "M200 155 Q195 120 175 100"}
                  fill="none"
                  stroke={redJacket}
                  strokeWidth="35"
                  strokeLinecap="round"
                />
                <circle
                  cx={isStomachPainCore ? 160 : 165}
                  cy={isStomachPainCore ? 200 : 90}
                  r="15"
                  fill={skin}
                  stroke={outline}
                  strokeWidth={strokeW}
                />
              </>
            ) : (
              <>
                <path d={rightUpperArmPath} fill="none" stroke={outline} strokeWidth="37" strokeLinecap="round" />
                <g style={{
                    transformOrigin: rightElbowOrigin,
                    animation: wavePhase === "waving"
                      ? "forearmWave 1s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite"
                      : "none",
                    animationDelay: wavePhase === "waving" ? "0.1s" : "0s",
                  }}
                >
                  <path d={rightForearmPath} fill="none" stroke={outline} strokeWidth="37" strokeLinecap="round" />
                </g>

                <path d={rightUpperArmPath} fill="none" stroke={redJacket} strokeWidth="35" strokeLinecap="round" />
                <g style={{
                    transformOrigin: rightElbowOrigin,
                    animation: wavePhase === "waving"
                      ? "forearmWave 1s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite"
                      : "none",
                    animationDelay: wavePhase === "waving" ? "0.1s" : "0s",
                  }}
                >
                  <path d={rightForearmPath} fill="none" stroke={redJacket} strokeWidth="35" strokeLinecap="round" />
                  <g transform={rightHandTransform}>
                    {showOpenHand ? renderOpenHand() : (
                      <circle cx="0" cy="0" r="15" fill={skin} stroke={outline} strokeWidth={strokeW}/>
                    )}
                  </g>
                </g>
              </>
            )}
          </g>

          {/* THINKING BUBBLE */}
          {(isThinking || isHeadPainThinking || isStomachPainThinking || isPainThinking || isSeverePainThinking) && (
            <g className="thinkingBubble">
              <path d="M 210 60 Q 240 25 270 45 Q 295 65 265 90 Q 240 105 210 85 Z" fill={white} stroke="#E0E0E0" strokeWidth="2" />
              <circle cx="205" cy="95" r="5" fill={white} />
              <circle cx="190" cy="110" r="3" fill={white} />
              <circle cx="230" cy="65" r="4" fill="#9CA3AF" style={{ animation: "dots 1.5s infinite" }} />
              <circle cx="245" cy="65" r="4" fill="#9CA3AF" style={{ animation: "dots 1.5s infinite 0.2s" }} />
              <circle cx="260" cy="65" r="4" fill="#9CA3AF" style={{ animation: "dots 1.5s infinite 0.4s" }} />
            </g>
          )}
        </g>
      </svg>
    </Box>
  );
}
