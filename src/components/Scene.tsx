import { useMemo } from "react";
import type { Theme } from "@/hooks/useTheme";

/** Nine sky bands with eight dithered seams — the dither is what stops
 *  a banded gradient from looking like flat stripes. */
const SEAMS = [
  ["d01", 0, 1], ["d12", 1, 2], ["d23", 2, 3], ["d34", 3, 4],
  ["d45", 4, 5], ["d56", 5, 6], ["d67", 6, 7], ["d78", 7, 8],
] as const;

const BANDS: Array<[number, number, string]> = [
  [0, 16, "var(--sky-0)"], [22, 16, "var(--sky-1)"], [44, 16, "var(--sky-2)"],
  [66, 14, "var(--sky-3)"], [86, 12, "var(--sky-4)"], [104, 10, "var(--sky-5)"],
  [119, 9, "var(--sky-6)"], [133, 6, "var(--sky-7)"], [143, 5, "var(--sky-8)"],
];
const SEAM_POS: Array<[number, number, string]> = [
  [16, 6, "d01"], [38, 6, "d12"], [60, 6, "d23"], [80, 6, "d34"],
  [98, 6, "d45"], [114, 5, "d56"], [128, 5, "d67"], [139, 4, "d78"],
];

function Star({ x, y, fill }: { x: number; y: number; fill: string }) {
  return <rect x={x} y={y} width="2" height="2" fill={fill} />;
}

/* ---------- Halloween props, all in scene pixels ---------- */

/** A full moon as stacked 2px rows, so its edge stays pixel-stepped. */
function Moon({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const rows = [];
  for (let dy = -r; dy < r; dy += 2) {
    const half = Math.round(Math.sqrt(r * r - (dy + 1) * (dy + 1)));
    rows.push(<rect key={dy} x={cx - half} y={cy + dy} width={half * 2} height="2" fill="#f2eecb" />);
  }
  return (
    <g>
      {rows}
      <g fill="#d8d2a6">
        <rect x={cx - 7} y={cy - 6} width="5" height="4" /><rect x={cx + 3} y={cy + 1} width="6" height="4" />
        <rect x={cx - 3} y={cy + 6} width="3" height="3" /><rect x={cx + 5} y={cy - 9} width="3" height="2" />
      </g>
    </g>
  );
}

/** A bat crossing the sky; its wings swap between two frames. */
function Bat({ y, dur, delay }: { y: number; dur: number; delay: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <g className="bat" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
        <g fill="#0b0612">
          <rect x="-1" y="0" width="3" height="3" /><rect x="-1" y="-1" width="1" height="1" /><rect x="1" y="-1" width="1" height="1" />
          <rect x="-2" y="1" width="1" height="1" /><rect x="2" y="1" width="1" height="1" />
          <g className="bat-up">
            <rect x="-5" y="-1" width="3" height="1" /><rect x="-7" y="-2" width="3" height="1" />
            <rect x="3" y="-1" width="3" height="1" /><rect x="5" y="-2" width="3" height="1" />
          </g>
          <g className="bat-down">
            <rect x="-5" y="2" width="3" height="1" /><rect x="-7" y="3" width="3" height="1" />
            <rect x="3" y="2" width="3" height="1" /><rect x="5" y="3" width="3" height="1" />
          </g>
        </g>
      </g>
    </g>
  );
}

function DeadTree({ x, y }: { x: number; y: number }) {
  return (
    <g fill="#0b0612">
      <rect x={x} y={y - 26} width="3" height="26" /><rect x={x - 1} y={y - 2} width="5" height="2" />
      <rect x={x - 6} y={y - 18} width="6" height="2" /><rect x={x - 8} y={y - 23} width="2" height="6" />
      <rect x={x + 3} y={y - 14} width="7" height="2" /><rect x={x + 9} y={y - 20} width="2" height="7" />
      <rect x={x + 1} y={y - 33} width="2" height="7" /><rect x={x - 4} y={y - 29} width="5" height="2" />
      <rect x={x + 3} y={y - 25} width="5" height="2" /><rect x={x + 7} y={y - 28} width="2" height="3" />
    </g>
  );
}

function Tombstone({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x + 2} y={y} width="8" height="2" fill="#4e4860" />
      <rect x={x} y={y + 2} width="12" height="14" fill="#4e4860" />
      <rect x={x + 2} y={y} width="8" height="1" fill="#6f6884" />
      <rect x={x + 10} y={y + 2} width="2" height="14" fill="#36304a" />
      <rect x={x + 3} y={y + 6} width="6" height="1" fill="#36304a" />
      <rect x={x + 3} y={y + 9} width="6" height="1" fill="#36304a" />
    </g>
  );
}

function Cross({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x + 3} y={y} width="3" height="18" fill="#4e4860" />
      <rect x={x} y={y + 4} width="9" height="3" fill="#4e4860" />
      <rect x={x + 3} y={y} width="3" height="1" fill="#6f6884" />
      <rect x={x + 5} y={y + 7} width="1" height="11" fill="#36304a" />
    </g>
  );
}

/** A jack-o'-lantern standing on the ground at (x, y); its face flickers. */
function Pumpkin({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <ellipse className="pumpkin-glow" cx={x + 7} cy={y} rx="16" ry="4" fill="#ff7a1a" fillOpacity="0.28" />
      <rect x={x + 2} y={y - 10} width="10" height="1" fill="#e8701a" />
      <rect x={x} y={y - 9} width="14" height="9" fill="#e8701a" />
      <rect x={x} y={y - 1} width="14" height="1" fill="#b8500e" />
      <rect x={x + 4} y={y - 9} width="1" height="8" fill="#b8500e" />
      <rect x={x + 9} y={y - 9} width="1" height="8" fill="#b8500e" />
      <rect x={x + 6} y={y - 12} width="2" height="2" fill="#3c6b2a" />
      <g className="pumpkin-face" fill="#ffd25a">
        <rect x={x + 2} y={y - 7} width="2" height="2" /><rect x={x + 10} y={y - 7} width="2" height="2" />
        <rect x={x + 3} y={y - 4} width="8" height="1" /><rect x={x + 4} y={y - 3} width="1" height="1" />
        <rect x={x + 9} y={y - 3} width="1" height="1" />
      </g>
    </g>
  );
}

export function Scene({ theme }: { theme: Theme }) {
  const stars = useMemo(
    () => [
      [18, 12], [88, 7], [156, 10], [232, 16], [268, 8], [120, 24],
      [52, 28], [196, 32], [298, 28], [36, 50], [142, 46], [252, 52],
    ] as Array<[number, number]>,
    [],
  );

  return (
    <div className="scene" aria-hidden="true">
      <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMax slice">
        <defs>
          {SEAMS.map(([id, a, b]) => (
            <pattern key={id} id={id} width="2" height="2" patternUnits="userSpaceOnUse">
              <rect width="2" height="2" fill={`var(--sky-${a})`} />
              <rect width="1" height="1" fill={`var(--sky-${b})`} />
              <rect x="1" y="1" width="1" height="1" fill={`var(--sky-${b})`} />
            </pattern>
          ))}
          <pattern id="dground" width="2" height="2" patternUnits="userSpaceOnUse">
            <rect width="2" height="2" fill="var(--ground-1)" />
            <rect width="1" height="1" fill="var(--ground-2)" />
            <rect x="1" y="1" width="1" height="1" fill="var(--ground-2)" />
          </pattern>
          <pattern id="dsea" width="2" height="2" patternUnits="userSpaceOnUse">
            <rect width="2" height="2" fill="var(--sea-2)" />
            <rect width="1" height="1" fill="var(--sea-3)" />
            <rect x="1" y="1" width="1" height="1" fill="var(--sea-3)" />
          </pattern>
        </defs>

        {BANDS.map(([y, h, fill]) => (
          <rect key={y} x="0" y={y} width="320" height={h} fill={fill} />
        ))}
        {SEAM_POS.map(([y, h, id]) => (
          <rect key={id} x="0" y={y} width="320" height={h} fill={`url(#${id})`} />
        ))}

        {theme === "dusk" && (
          <g>
            {stars.slice(0, 6).map(([x, y], i) => <Star key={i} x={x} y={y} fill="var(--paper-5)" />)}
            {stars.slice(6).map(([x, y], i) => <Star key={i} x={x} y={y} fill="var(--slate-4)" />)}
            <rect x="240" y="22" width="22" height="6" fill="var(--paper-5)" />
            <rect x="242" y="20" width="18" height="2" fill="var(--paper-5)" />
            <rect x="242" y="28" width="18" height="2" fill="var(--paper-4)" />
            <rect x="246" y="18" width="10" height="2" fill="var(--paper-4)" />
            <rect x="246" y="30" width="10" height="2" fill="var(--paper-3)" />
            <rect x="248" y="26" width="3" height="2" fill="var(--paper-2)" />
            <polygon points="0,130 34,102 62,122 96,94 130,128 160,110 190,132 320,108 320,134 0,134" fill="var(--sky-5)" />
            <polygon points="0,133 30,113 58,129 92,107 128,133 168,115 206,131 250,109 292,130 320,116 320,140 0,140" fill="var(--sky-3)" />
            <g fill="var(--jade-0)">
              <polygon points="6,140 14,118 22,140" /><polygon points="44,141 54,114 64,141" />
              <polygon points="92,140 100,120 108,140" /><polygon points="140,141 150,113 160,141" />
              <polygon points="192,140 200,119 208,140" /><polygon points="240,141 250,113 260,141" />
              <polygon points="288,140 296,118 304,140" />
            </g>
            <g fill="var(--ground-2)">
              <polygon points="24,143 33,116 42,143" /><polygon points="68,144 79,110 90,144" />
              <polygon points="112,143 121,117 130,143" /><polygon points="164,144 175,111 186,144" />
              <polygon points="212,143 221,117 230,143" /><polygon points="264,144 275,110 286,144" />
              <rect x="0" y="142" width="320" height="5" />
            </g>
            <rect x="0" y="147" width="320" height="53" fill="var(--ground-2)" />
            <rect x="0" y="147" width="320" height="8" fill="url(#dground)" />
            <g fill="var(--ground-3)">
              <rect x="0" y="147" width="320" height="2" /><rect x="0" y="160" width="320" height="1" />
              <rect x="0" y="174" width="320" height="1" /><rect x="0" y="189" width="320" height="1" />
            </g>
          </g>
        )}

        {theme === "beach" && (
          <g>
            <g className="sun-rays" fill="#fff3b0" opacity="0.9">
              <rect x="258" y="6" width="4" height="8" /><rect x="258" y="46" width="4" height="8" />
              <rect x="236" y="28" width="8" height="4" /><rect x="276" y="28" width="8" height="4" />
            </g>
            <rect x="246" y="22" width="26" height="14" fill="#ffe898" />
            <rect x="248" y="20" width="22" height="2" fill="#ffe07a" />
            <rect x="248" y="36" width="22" height="2" fill="#ffe07a" />
            <rect x="250" y="22" width="11" height="7" fill="#fffad8" />
            <g className="clouds" fill="#fff">
              <rect x="30" y="26" width="26" height="7" /><rect x="24" y="30" width="38" height="5" />
              <rect x="128" y="46" width="30" height="7" /><rect x="122" y="50" width="42" height="5" />
              <rect x="196" y="18" width="22" height="6" /><rect x="192" y="22" width="30" height="4" />
            </g>
            <polygon points="0,116 26,104 54,113 82,102 108,114 130,110 130,120 0,120" fill="#5e9e86" />
            <polygon points="0,119 22,110 48,117 78,108 104,118 130,114 130,122 0,122" fill="#3e7a66" />
            <rect x="0" y="118" width="320" height="6" fill="var(--sea-1)" />
            <rect x="0" y="124" width="320" height="6" fill="url(#dsea)" />
            <rect x="0" y="130" width="320" height="14" fill="var(--sea-2)" />
            <rect x="0" y="144" width="320" height="8" fill="var(--sea-3)" />

            <g className="ring-drift"><g className="ring-bob">
              <rect x="234" y="126" width="18" height="4" fill="#e23b2e" />
              <rect x="230" y="130" width="26" height="8" fill="#e23b2e" />
              <rect x="234" y="138" width="18" height="3" fill="#c22a20" />
              <rect x="238" y="126" width="5" height="4" fill="#fff" />
              <rect x="230" y="130" width="4" height="4" fill="#fff" />
              <rect x="243" y="130" width="5" height="4" fill="#fff" />
              <rect x="252" y="134" width="4" height="4" fill="#d8d8d8" />
              <rect x="238" y="130" width="10" height="8" fill="var(--sea-2)" />
            </g></g>

            <g className="shark">
              <g opacity="0.5">
                <polygon points="4,138 11,143 11,151 4,156" fill="#1e4e68" />
                <rect x="11" y="140" width="30" height="12" fill="#245a76" />
                <rect x="11" y="140" width="30" height="4" fill="#31708e" />
                <polygon points="41,141 51,146 41,151" fill="#245a76" />
                <rect x="15" y="150" width="24" height="2" fill="#6e9db4" />
                <polygon points="29,152 36,152 32,159" fill="#193f55" />
                <rect x="42" y="144" width="2" height="2" fill="#cfe6f0" />
              </g>
              <rect x="21" y="130" width="11" height="2" fill="#3d5c72" />
              <rect x="22" y="128" width="8" height="2" fill="#3d5c72" />
              <rect x="22" y="126" width="6" height="2" fill="#3d5c72" />
              <rect x="23" y="124" width="4" height="2" fill="#3d5c72" />
              <rect x="23" y="122" width="2" height="2" fill="#3d5c72" />
              <rect x="29" y="130" width="3" height="2" fill="#7a9bb2" />
              <rect x="27" y="128" width="3" height="2" fill="#7a9bb2" />
              <rect x="26" y="126" width="2" height="2" fill="#7a9bb2" />
              <rect x="16" y="131" width="22" height="2" fill="#bfe6f2" opacity="0.85" />
            </g>

            <rect x="0" y="152" width="320" height="5" fill="var(--ground-1)" />
            <rect x="0" y="157" width="320" height="43" fill="var(--ground-3)" />
            <rect x="0" y="157" width="320" height="7" fill="url(#dground)" />

            <g className="castle">
              <rect x="16" y="180" width="42" height="9" fill="#e8c88e" />
              <rect x="16" y="180" width="42" height="2" fill="#f7dfae" />
              <g fill="#e8c88e">
                <rect x="16" y="177" width="5" height="3" /><rect x="25" y="177" width="5" height="3" />
                <rect x="34" y="177" width="5" height="3" /><rect x="44" y="177" width="5" height="3" />
                <rect x="53" y="177" width="5" height="3" />
              </g>
              <rect x="18" y="166" width="12" height="12" fill="#efd29a" />
              <rect x="34" y="158" width="14" height="20" fill="#f2d8a4" />
              <rect x="45" y="160" width="3" height="18" fill="#d3ae72" />
              <rect x="38" y="169" width="6" height="9" fill="#8c6c3c" />
              <rect x="51" y="169" width="10" height="9" fill="#efd29a" />
              <rect x="40" y="146" width="1" height="10" fill="#8c6c3c" />
              <polygon points="41,147 50,150 41,153" fill="#e23b2e" />
              <g fill="#f0834a">
                <rect x="21" y="171" width="3" height="3" />
                <rect x="19" y="169" width="2" height="3" /><rect x="24" y="169" width="2" height="3" />
                <rect x="19" y="174" width="2" height="3" /><rect x="24" y="174" width="2" height="3" />
              </g>
              <g fill="#ffa36b">
                <rect x="36" y="163" width="3" height="3" />
                <rect x="34" y="161" width="2" height="3" /><rect x="39" y="161" width="2" height="3" />
              </g>
            </g>
          </g>
        )}

        {theme === "snow" && (
          <g>
            {stars.map(([x, y], i) => <Star key={i} x={x} y={y} fill="#fff" />)}
            <rect x="46" y="20" width="24" height="10" fill="var(--paper-5)" />
            <rect x="48" y="18" width="20" height="2" fill="var(--paper-5)" />
            <rect x="48" y="30" width="20" height="2" fill="var(--paper-4)" />
            <rect x="58" y="21" width="6" height="3" fill="var(--paper-3)" />
            <polygon points="0,124 44,110 92,120 146,106 198,118 252,104 306,116 320,110 320,136 0,136" fill="var(--ground-1)" />
            <polygon points="0,132 50,120 104,130 158,116 214,128 268,114 320,126 320,150 0,150" fill="var(--ground-2)" />
            <g>
              <polygon points="20,128 28,104 36,128" fill="var(--jade-1)" />
              <polygon points="23,118 28,104 33,118" fill="var(--ground-3)" />
              <polygon points="195,126 204,100 213,126" fill="var(--jade-1)" />
              <polygon points="198,116 204,100 210,116" fill="var(--ground-3)" />
              <polygon points="285,129 293,106 301,129" fill="var(--jade-1)" />
            </g>
            <rect x="0" y="142" width="320" height="58" fill="var(--ground-3)" />
            <rect x="0" y="142" width="320" height="9" fill="url(#dground)" />
            <g fill="var(--ground-4)">
              <ellipse cx="60" cy="172" rx="34" ry="7" />
              <ellipse cx="240" cy="182" rx="40" ry="8" />
            </g>
            <g>
              <rect x="34" y="136" width="22" height="14" fill="#fff" />
              <rect x="30" y="152" width="30" height="16" fill="#fff" />
              <rect x="32" y="130" width="26" height="2" fill="#241c30" />
              <rect x="38" y="120" width="14" height="10" fill="#2e2440" />
              <rect x="38" y="126" width="14" height="2" fill="#c74b62" />
              <rect x="39" y="140" width="2" height="2" fill="#241c30" />
              <rect x="47" y="140" width="2" height="2" fill="#241c30" />
              <rect x="43" y="142" width="6" height="2" fill="#e8862c" />
              <rect x="43" y="156" width="2" height="2" fill="#241c30" />
              <rect x="20" y="140" width="14" height="2" fill="#6b4526" />
              <rect x="56" y="139" width="14" height="2" fill="#6b4526" />
              <rect x="34" y="150" width="22" height="3" fill="#c74b62" />
            </g>
          </g>
        )}

        {theme === "autumn" && (
          <g>
            <rect x="131" y="107" width="44" height="16" fill="#ffe9ae" />
            <rect x="134" y="104" width="38" height="3" fill="#ffde92" />
            <rect x="134" y="123" width="38" height="3" fill="#ffde92" />
            <rect x="137" y="108" width="18" height="7" fill="#fff8dc" />
            <polygon points="0,126 46,112 96,122 150,110 204,120 258,108 310,120 320,114 320,138 0,138" fill="var(--ground-1)" />
            <polygon points="0,134 52,122 108,132 164,118 220,130 274,116 320,128 320,152 0,152" fill="var(--ground-2)" />
            <g>
              <rect x="38" y="116" width="4" height="14" fill="#4c2e20" />
              <rect x="28" y="100" width="24" height="16" fill="#b33a28" />
              <rect x="31" y="96" width="18" height="5" fill="#d4522e" />
              <rect x="228" y="114" width="4" height="14" fill="#4c2e20" />
              <rect x="218" y="98" width="24" height="16" fill="#c97a1e" />
              <rect x="221" y="94" width="18" height="5" fill="#e39b2c" />
              <rect x="292" y="118" width="4" height="14" fill="#4c2e20" />
              <rect x="283" y="104" width="22" height="14" fill="#a8451e" />
            </g>
            <rect x="0" y="144" width="320" height="56" fill="var(--ground-2)" />
            <rect x="0" y="144" width="320" height="9" fill="url(#dground)" />
            <g fill="var(--ground-3)">
              <rect x="0" y="153" width="320" height="3" /><rect x="0" y="168" width="320" height="2" />
              <rect x="0" y="184" width="320" height="2" />
            </g>
          </g>
        )}

        {/* Halloween: the moon stays near the middle so a phone (which only
            shows about x 115-205) still gets it, the haunted house and the
            iron fence fill out wider screens. */}
        {theme === "halloween" && (
          <g>
            {stars.map(([x, y], i) => <Star key={i} x={x} y={y} fill={i % 3 ? "var(--slate-4)" : "var(--paper-4)"} />)}
            <Moon cx={168} cy={36} r={16} />
            <Bat y={30} dur={17} delay={-3} />
            <Bat y={56} dur={23} delay={-14} />
            <Bat y={20} dur={29} delay={-21} />

            <polygon points="0,134 36,124 78,128 120,120 168,128 214,118 262,126 300,120 320,124 320,146 0,146" fill="#1a0f26" />
            <polygon points="0,140 18,124 50,112 84,110 112,116 140,130 164,142 0,142" fill="#140b20" />
            <g fill="#0e0818">
              <rect x="58" y="96" width="34" height="16" />
              <polygon points="54,97 74,82 94,97" />
              <rect x="84" y="80" width="10" height="20" />
              <polygon points="82,81 89,64 96,81" />
              <rect x="62" y="84" width="4" height="9" />
            </g>
            <g className="hw-window" fill="#ffb84a">
              <rect x="62" y="100" width="4" height="4" />
              <rect x="87" y="85" width="4" height="5" />
            </g>
            <rect x="72" y="100" width="4" height="4" fill="#2a1530" />
            <rect x="73" y="105" width="5" height="7" fill="#2a1530" />

            <DeadTree x={20} y={146} />
            <DeadTree x={134} y={146} />
            <DeadTree x={262} y={140} />

            <g fill="#0b0612">
              {Array.from({ length: 16 }, (_, i) => (
                <g key={i}>
                  <rect x={196 + i * 8} y={128} width="2" height="18" />
                  <rect x={196 + i * 8} y={126} width="2" height="2" opacity="0.7" />
                </g>
              ))}
              <rect x="194" y="132" width="126" height="2" />
              <rect x="194" y="141" width="126" height="2" />
            </g>

            <rect x="0" y="144" width="320" height="56" fill="var(--ground-2)" />
            <rect x="0" y="144" width="320" height="8" fill="url(#dground)" />
            <g fill="var(--ground-3)">
              <rect x="0" y="144" width="320" height="2" /><rect x="0" y="162" width="320" height="1" />
              <rect x="0" y="180" width="320" height="1" />
            </g>

            <Tombstone x={180} y={140} />
            <Cross x={226} y={138} />
            <Tombstone x={284} y={142} />
            <Tombstone x={34} y={146} />
            <Pumpkin x={146} y={160} />
            <Pumpkin x={200} y={170} />
            <Pumpkin x={60} y={176} />
            <Pumpkin x={262} y={180} />

            <g className="fog" fill="#c9b8ee">
              <rect x="-40" y="138" width="150" height="4" opacity="0.10" />
              <rect x="70" y="146" width="200" height="5" opacity="0.08" />
              <rect x="200" y="140" width="170" height="4" opacity="0.10" />
            </g>
            <g className="fog fog-slow" fill="#c9b8ee">
              <rect x="-30" y="152" width="180" height="6" opacity="0.07" />
              <rect x="160" y="156" width="200" height="5" opacity="0.07" />
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}

/** Falling snow / leaves. Two nested elements per particle: the outer drives
 *  the fall path, the inner spins — one element cannot own two transforms. */
export function Weather({ theme }: { theme: Theme }) {
  const bits = useMemo(() => {
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    if (theme === "snow") {
      return Array.from({ length: 46 }, (_, i) => ({
        id: i, left: rand(-2, 100), dur: rand(7, 16), delay: -rand(0, 16),
        size: Math.round(rand(2, 5)), spin: rand(2, 4.5), op: rand(0.55, 1),
      }));
    }
    if (theme === "autumn") {
      return Array.from({ length: 20, }, (_, i) => ({
        id: i, left: rand(-2, 100), dur: rand(9, 19), delay: -rand(0, 19),
        size: Math.round(rand(11, 20)), spin: rand(1.8, 4.2), op: 1,
      }));
    }
    return [];
  }, [theme]);

  if (!bits.length) return null;

  return (
    <div className="weather" aria-hidden="true">
      {bits.map((b) =>
        theme === "snow" ? (
          <span key={b.id} className="flake"
            style={{ left: `${b.left}vw`, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}>
            <i style={{ width: b.size, height: b.size, animationDuration: `${b.spin}s`, opacity: b.op }} />
          </span>
        ) : (
          <span key={b.id} className="leaf"
            style={{ left: `${b.left}vw`, animationDuration: `${b.dur}s`, animationDelay: `${b.delay}s` }}>
            <i style={{ animationDuration: `${b.spin}s` }}>
              <svg width={b.size} height={b.size} viewBox="0 0 9 9">
                <rect x="2" y="1" width="5" height="1" fill="#c9531f" />
                <rect x="1" y="2" width="7" height="3" fill="#d4622a" />
                <rect x="2" y="5" width="5" height="1" fill="#b34521" />
                <rect x="4" y="2" width="1" height="6" fill="#7a3414" />
              </svg>
            </i>
          </span>
        ),
      )}
    </div>
  );
}
