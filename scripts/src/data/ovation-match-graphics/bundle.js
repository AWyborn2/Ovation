/* @ds-bundle: {"format":4,"namespace":"OvationMatch","components":[{"name":"Stage"},{"name":"BroadcastSummary"},{"name":"BroadcastPanel"},{"name":"BroadcastTitleBar"},{"name":"BroadcastInningsBar"},{"name":"BroadcastBatterRow"},{"name":"BroadcastBowlerRow"},{"name":"BroadcastPlayerList"},{"name":"BroadcastResultBar"},{"name":"PanelSummary"},{"name":"PanelFrame"},{"name":"PanelHeader"},{"name":"PanelWell"},{"name":"PanelInningsHeader"},{"name":"PanelPlayerRow"},{"name":"PanelPlayerGrid"},{"name":"PanelResultBar"},{"name":"CleanSummary"},{"name":"CleanHeader"},{"name":"CleanInningsHeader"},{"name":"CleanPlayerRow"},{"name":"CleanPlayerList"},{"name":"CleanInningsBand"},{"name":"CleanResultBar"},{"name":"ClassicSummary"},{"name":"ClassicStripes"},{"name":"ClassicLogoTile"},{"name":"ClassicHeader"},{"name":"ClassicContextStrip"},{"name":"ClassicInningsBar"},{"name":"ClassicPlayerRow"},{"name":"ClassicResultBar"},{"name":"ScoreboardSummary"},{"name":"ScoreboardFrame"},{"name":"ScoreboardScreen"},{"name":"ScoreboardHeader"},{"name":"ScoreboardLine"},{"name":"ScoreboardInningsBox"},{"name":"ScoreboardLogo"},{"name":"ScoreboardResult"},{"name":"ScoreboardTeamBand"},{"name":"GroundScoreboardSummary"},{"name":"GroundScoreboardLed"},{"name":"GroundScoreboardBoard"},{"name":"GroundScoreboardHeader"},{"name":"GroundScoreboardCell"},{"name":"GroundScoreboardTeamCell"},{"name":"GroundScoreboardScoreCell"},{"name":"GroundScoreboardInnings"},{"name":"GroundScoreboardResult"},{"name":"GroundScoreboardAssociation"},{"name":"T20Summary"},{"name":"T20Backdrop"},{"name":"T20LogoTile"},{"name":"T20Header"},{"name":"T20ContextStrip"},{"name":"T20InningsBar"},{"name":"T20PlayerRow"},{"name":"T20ResultBar"}]} */
var OvationMatch = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/react-shim.js
  var require_react_shim = __commonJS({
    "src/react-shim.js"(exports, module) {
      module.exports = window.React;
    }
  });

  // src/index.js
  var src_exports = {};
  __export(src_exports, {
    BROADCAST_TEAL: () => BROADCAST_TEAL,
    BroadcastBatterRow: () => BroadcastBatterRow,
    BroadcastBowlerRow: () => BroadcastBowlerRow,
    BroadcastInningsBar: () => BroadcastInningsBar,
    BroadcastPanel: () => BroadcastPanel,
    BroadcastPlayerList: () => BroadcastPlayerList,
    BroadcastResultBar: () => BroadcastResultBar,
    BroadcastSummary: () => BroadcastSummary,
    BroadcastTitleBar: () => BroadcastTitleBar,
    ClassicContextStrip: () => ClassicContextStrip,
    ClassicHeader: () => ClassicHeader,
    ClassicInningsBar: () => ClassicInningsBar,
    ClassicLogoTile: () => ClassicLogoTile,
    ClassicPlayerRow: () => ClassicPlayerRow,
    ClassicResultBar: () => ClassicResultBar,
    ClassicStripes: () => ClassicStripes,
    ClassicSummary: () => ClassicSummary,
    CleanHeader: () => CleanHeader,
    CleanInningsBand: () => CleanInningsBand,
    CleanInningsHeader: () => CleanInningsHeader,
    CleanPlayerList: () => CleanPlayerList,
    CleanPlayerRow: () => CleanPlayerRow,
    CleanResultBar: () => CleanResultBar,
    CleanSummary: () => CleanSummary,
    GroundScoreboardAssociation: () => GroundScoreboardAssociation,
    GroundScoreboardBoard: () => GroundScoreboardBoard,
    GroundScoreboardCell: () => GroundScoreboardCell,
    GroundScoreboardHeader: () => GroundScoreboardHeader,
    GroundScoreboardInnings: () => GroundScoreboardInnings,
    GroundScoreboardLed: () => GroundScoreboardLed,
    GroundScoreboardResult: () => GroundScoreboardResult,
    GroundScoreboardScoreCell: () => GroundScoreboardScoreCell,
    GroundScoreboardSummary: () => GroundScoreboardSummary,
    GroundScoreboardTeamCell: () => GroundScoreboardTeamCell,
    PanelFrame: () => PanelFrame,
    PanelHeader: () => PanelHeader,
    PanelInningsHeader: () => PanelInningsHeader,
    PanelPlayerGrid: () => PanelPlayerGrid,
    PanelPlayerRow: () => PanelPlayerRow,
    PanelResultBar: () => PanelResultBar,
    PanelSummary: () => PanelSummary,
    PanelWell: () => PanelWell,
    SAMPLE_BACKGROUND: () => SAMPLE_BACKGROUND,
    SAMPLE_COMPETITION: () => SAMPLE_COMPETITION,
    SAMPLE_MATCH: () => SAMPLE_MATCH,
    SAMPLE_TEAMS: () => SAMPLE_TEAMS,
    SIZES: () => SIZES,
    ScoreboardFrame: () => ScoreboardFrame,
    ScoreboardHeader: () => ScoreboardHeader,
    ScoreboardInningsBox: () => ScoreboardInningsBox,
    ScoreboardLine: () => ScoreboardLine,
    ScoreboardLogo: () => ScoreboardLogo,
    ScoreboardResult: () => ScoreboardResult,
    ScoreboardScreen: () => ScoreboardScreen,
    ScoreboardSummary: () => ScoreboardSummary,
    ScoreboardTeamBand: () => ScoreboardTeamBand,
    Stage: () => Stage,
    T20Backdrop: () => T20Backdrop,
    T20ContextStrip: () => T20ContextStrip,
    T20Header: () => T20Header,
    T20InningsBar: () => T20InningsBar,
    T20LogoTile: () => T20LogoTile,
    T20PlayerRow: () => T20PlayerRow,
    T20ResultBar: () => T20ResultBar,
    T20Summary: () => T20Summary,
    asset: () => asset,
    broadcastBarColours: () => broadcastBarColours,
    css: () => css,
    figs: () => figs,
    initialName: () => initialName,
    isHidden: () => isHidden,
    isLight: () => isLight,
    luminance: () => luminance,
    mix: () => mix,
    pairRows: () => pairRows,
    panelPalettes: () => panelPalettes,
    readableOn: () => readableOn,
    resolveMatch: () => resolveMatch,
    rgb: () => rgb,
    runs: () => runs,
    score: () => score,
    shade: () => shade,
    surname: () => surname
  });

  // src/components/BroadcastSummary.jsx
  var import_react2 = __toESM(require_react_shim());

  // src/components/shared/matchUtils.js
  var import_react = __toESM(require_react_shim());
  var SIZES = { landscape: 700, square: 1080, portrait: 1350 };
  function css(str) {
    const out = {};
    str.split(";").forEach((d) => {
      const i = d.indexOf(":");
      if (i < 0) return;
      const k = d.slice(0, i).trim();
      if (!k) return;
      out[k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = d.slice(i + 1).trim();
    });
    return out;
  }
  function parse(hex) {
    let h = String(hex).replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  var clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  var rgb = (hex) => parse(hex).join(",");
  function mix(a, b, t) {
    const A = parse(a), B = parse(b);
    return "#" + A.map((v, i) => clamp(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }
  var shade = (hex, t) => t >= 0 ? mix(hex, "#ffffff", t) : mix(hex, "#000000", -t);
  function luminance(hex) {
    const [r, g, b] = parse(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  var isLight = (hex) => luminance(hex) > 0.4;
  var readableOn = (hex) => isLight(hex) ? "#1e1f22" : "#ffffff";
  var isHidden = (n) => !n || n.startsWith("*");
  var surname = (n) => {
    if (isHidden(n)) return n;
    const p = n.split(" ");
    return p.length < 2 ? n : p.slice(1).join(" ");
  };
  var initialName = (n, sep = " ") => {
    if (isHidden(n)) return n;
    const p = n.split(" ");
    return p.length < 2 ? n : `${p[0][0]}${sep}${p.slice(1).join(" ")}`;
  };
  var score = (inn, sep = "/") => `${inn.wickets}${sep}${inn.runs}`;
  var figs = (b, sep = "-") => b ? `${b.wickets}${sep}${b.runs}` : "";
  var runs = (b) => b ? `${b.runs}${b.notOut ? "*" : ""}` : "";
  function resolveMatch(match, teams) {
    const ids = match.innings.map((i) => i.team);
    const innings = match.innings.map((i) => ({ ...i, club: teams[i.team], opp: teams[ids.find((x) => x !== i.team)] }));
    const loserId = ids.find((x) => x !== match.winner);
    return { innings, winner: teams[match.winner], loser: teams[loserId], home: teams[match.home], away: teams[match.away] };
  }
  function pairRows(inn, n) {
    const rows = [];
    for (let k = 0; k < n; k++) rows.push({ bat: inn.batting[k] || null, bowl: inn.bowling[k] || null });
    return rows;
  }
  var asset = (base, src) => !src ? src : /^(https?:|data:|blob:|\/)/.test(src) ? src : (base || "") + src;
  var SAMPLE_BACKGROUND = "assets/ground-example.jpg";
  function Stage({ format = "landscape", background, assetBase, vignette, label, children }) {
    const bg = background === void 0 ? SAMPLE_BACKGROUND : background;
    return import_react.default.createElement(
      "div",
      {
        "data-screen-label": label,
        style: { width: 1080, height: SIZES[format] || 700, background: "#000", position: "relative", overflow: "hidden" }
      },
      bg ? import_react.default.createElement("img", { src: asset(assetBase, bg), alt: "", style: { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } }) : null,
      vignette ? import_react.default.createElement("div", { style: { position: "absolute", inset: 0, pointerEvents: "none", background: vignette } }) : null,
      children
    );
  }

  // src/components/shared/sampleMatch.js
  var SAMPLE_TEAMS = {
    WSCC: {
      id: "WSCC",
      name: "Warnbro Swans",
      short: "WSCC",
      colour: "#560560",
      onColour: "#ffffff",
      colourOnDark: "#C27BD0",
      dark: "#560560",
      bright: "#FEF203",
      secondary: "#ffffff",
      onSecondary: "#020202",
      logo: "assets/wscc-logo.png",
      logoOnDark: "assets/wscc-logo-white.png"
    },
    HHCC: {
      id: "HHCC",
      name: "Halls Head",
      short: "HHCC",
      colour: "#FBAC27",
      onColour: "#1e1f22",
      colourOnDark: "#FBAC27",
      dark: "#333F48",
      bright: "#FBAC27",
      secondary: "#333F48",
      onSecondary: "#FBAC27",
      logo: "assets/hhcc-logo.png",
      logoOnDark: "assets/hhcc-logo.png"
    }
  };
  var SAMPLE_COMPETITION = {
    name: "A Grade: Wyllie Cup",
    association: "Peel Cricket Association",
    logo: "assets/pca-logo.png",
    colour: "#93182C",
    accent: "#65B6C5"
  };
  var SAMPLE_MATCH = {
    home: "HHCC",
    away: "WSCC",
    grade: "A Grade",
    venue: "Peelwood Reserve",
    date: "17 Oct 2026",
    winner: "HHCC",
    result: "Halls Head won by 6 wickets",
    innings: [
      {
        team: "WSCC",
        overs: "49.4",
        runs: 168,
        wickets: 10,
        batting: [
          { name: "Kane Standing", runs: 53, balls: 121 },
          { name: "Ryan Smart", runs: 50, balls: 72 },
          { name: "Jamie Sizer", runs: 25, balls: 32 },
          { name: "Joel Ward", runs: 6, balls: 20 },
          { name: "Liam Hart", runs: 4, balls: 11 }
        ],
        bowling: [
          { name: "Timothy Miles", wickets: 3, runs: 18, overs: "7.4" },
          { name: "Mitchell Caine", wickets: 2, runs: 17, overs: "5" },
          { name: "********", wickets: 1, runs: 16, overs: "4" },
          { name: "Dexter Trego", wickets: 1, runs: 22, overs: "9" }
        ]
      },
      {
        team: "HHCC",
        overs: "26.1",
        runs: 172,
        wickets: 4,
        batting: [
          { name: "Dexter Trego", runs: 61, balls: 52, notOut: true },
          { name: "Josh Rudge", runs: 41, balls: 42 },
          { name: "Travis Caine", runs: 21, balls: 24, notOut: true },
          { name: "Jack Manuel", runs: 21, balls: 25 }
        ],
        bowling: [
          { name: "Alexander Cowan", wickets: 2, runs: 34, overs: "5" },
          { name: "Kane Standing", wickets: 1, runs: 16, overs: "6" },
          { name: "Bradley Williams", wickets: 1, runs: 30, overs: "6" }
        ]
      }
    ]
  };

  // src/components/BroadcastSummary.jsx
  var GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .6 0'/%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E")`;
  var BROADCAST_TEAL = { dark: "#1f6b5e", light: "#3f9584", fold: "#0f3d35", text: "#ffffff" };
  var TEAL = BROADCAST_TEAL;
  var GAP = { landscape: 8, square: 14, portrait: 20 };
  function broadcastBarColours(club, theme = "broadcast") {
    return theme === "club" ? { dark: club.dark, light: shade(club.dark, 0.18), fold: shade(club.dark, -0.45), text: club.bright } : TEAL;
  }
  function BroadcastPanel() {
    return /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:absolute;left:28px;right:28px;top:70px;bottom:0;background:#efefef;overflow:hidden") }, /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:absolute;inset:0;background:linear-gradient(180deg,#f7f7f7 0%,#ececec 100%)") }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:absolute;top:0;bottom:0;left:0;width:150px;background:linear-gradient(90deg,#d9dbdb,#e9eaea);clip-path:polygon(0 0,12% 0,100% 100%,0 100%)") }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:absolute;top:0;bottom:0;left:0;width:150px;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(255,255,255,.55));clip-path:polygon(12% 0,30% 0,100% 100%,62% 100%)") }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:absolute;top:0;bottom:0;left:0;width:10px;background:linear-gradient(90deg,#b9bcbc,#d4d6d6)") }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:absolute;top:0;bottom:0;right:0;width:150px;background:linear-gradient(270deg,#d9dbdb,#e9eaea);clip-path:polygon(88% 0,100% 0,100% 100%,0 100%)") }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:absolute;top:0;bottom:0;right:0;width:150px;background:linear-gradient(180deg,rgba(255,255,255,.95),rgba(255,255,255,.55));clip-path:polygon(70% 0,88% 0,38% 100%,0 100%)") }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:absolute;top:0;bottom:0;right:0;width:10px;background:linear-gradient(270deg,#b9bcbc,#d4d6d6)") }), /* @__PURE__ */ import_react2.default.createElement("div", { style: { position: "absolute", inset: 0, opacity: 0.18, mixBlendMode: "multiply", backgroundImage: GRAIN } }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:absolute;inset:0;background:radial-gradient(ellipse at 50% 30%,rgba(255,255,255,.35),rgba(255,255,255,0) 65%)") }));
  }
  function BroadcastTitleBar({ home = SAMPLE_TEAMS.HHCC, away = SAMPLE_TEAMS.WSCC, venue = SAMPLE_MATCH.venue, date = SAMPLE_MATCH.date }) {
    return /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:relative;height:140px;flex:none;display:flex;flex-direction:column;align-items:center") }, /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;top:38px;left:96px;right:96px;height:66px;background:${TEAL.light};clip-path:polygon(0 0,100% 0,96% 100%,4% 100%)`) }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;top:26px;left:96px;width:24px;height:12px;background:${TEAL.fold};clip-path:polygon(100% 0,100% 100%,0 100%)`) }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;top:26px;right:96px;width:24px;height:12px;background:${TEAL.fold};clip-path:polygon(0 0,100% 100%,0 100%)`) }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:relative;margin-top:38px;width:840px;height:62px;background:linear-gradient(180deg,rgba(255,255,255,.12) 0,rgba(255,255,255,0) 45%,rgba(0,0,0,.16) 100%),${TEAL.dark};clip-path:polygon(0 0,100% 0,97% 100%,3% 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-size:46px;font-weight:600;letter-spacing:.01em`) }, home.short, " vs ", away.short), /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:relative;margin-top:8px;font-size:21px;font-weight:500;color:#2b2b2b;display:flex;gap:6px") }, /* @__PURE__ */ import_react2.default.createElement("span", null, venue, date ? `, ${date}` : "", " —"), /* @__PURE__ */ import_react2.default.createElement("span", { style: { fontWeight: 700 } }, "Match Summary")));
  }
  function BroadcastInningsBar({ club = SAMPLE_TEAMS.WSCC, overs = "49.4", wickets = 10, runs: r = 168, grade = SAMPLE_MATCH.grade, colours, theme = "broadcast", assetBase = "" }) {
    const c = colours || broadcastBarColours(club, theme);
    return /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:relative;height:46px;flex:none") }, /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;left:28px;width:200px;top:100%;height:26px;background:linear-gradient(90deg,${c.light},rgba(255,255,255,0));opacity:.55`) }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;right:28px;width:200px;top:100%;height:26px;background:linear-gradient(270deg,${c.light},rgba(255,255,255,0));opacity:.55`) }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;left:10px;width:18px;top:-12px;height:12px;background:${c.fold};clip-path:polygon(100% 0,100% 100%,0 100%)`) }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;right:10px;width:18px;top:-12px;height:12px;background:${c.fold};clip-path:polygon(0 0,100% 100%,0 100%)`) }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;top:0;bottom:0;left:10px;right:10px;background:linear-gradient(90deg,${c.light} 0,${c.light} 18px,${c.dark} 18px,${c.dark} calc(100% - 18px),${c.light} calc(100% - 18px))`) }), /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;top:0;bottom:0;left:28px;right:28px;background:linear-gradient(180deg,rgba(255,255,255,.12) 0,rgba(255,255,255,0) 45%,rgba(0,0,0,.14) 100%),${c.dark};display:grid;grid-template-columns:127px minmax(0,1fr) 180px 160px;align-items:center;color:${c.text}`) }, /* @__PURE__ */ import_react2.default.createElement("span", null), /* @__PURE__ */ import_react2.default.createElement("span", { style: css("font-size:34px;font-weight:600;white-space:nowrap;overflow:hidden") }, club.name, grade ? ` ${grade}` : ""), /* @__PURE__ */ import_react2.default.createElement("span", { style: css("font-size:20px;font-weight:500;text-align:center") }, overs, " overs"), /* @__PURE__ */ import_react2.default.createElement("span", { style: css("font-size:36px;font-weight:600") }, score({ wickets, runs: r }))), /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;left:52px;top:-13px;width:68px;height:68px;border-radius:50%;background:#fff;box-shadow:0 0 0 3px ${c.dark},0 2px 6px rgba(0,0,0,.35);overflow:hidden;display:flex;align-items:center;justify-content:center`) }, /* @__PURE__ */ import_react2.default.createElement("img", { src: asset(assetBase, club.logo), alt: "", style: { width: 62, height: 62, objectFit: "contain" } })));
  }
  function BroadcastBatterRow({ batter, showBalls = true }) {
    const b = batter;
    return /* @__PURE__ */ import_react2.default.createElement("div", { style: css("display:grid;grid-template-columns:minmax(0,1fr) 46px 54px;align-items:baseline;color:#262626") }, /* @__PURE__ */ import_react2.default.createElement("span", { style: css("font-size:25px;font-weight:500;white-space:nowrap;overflow:hidden") }, b.name), /* @__PURE__ */ import_react2.default.createElement("span", { style: css("font-size:25px;font-weight:500") }, runs(b)), /* @__PURE__ */ import_react2.default.createElement("span", { style: css("font-size:16px;font-weight:500;padding-left:4px") }, showBalls ? b.balls : ""));
  }
  function BroadcastBowlerRow({ bowler, showBalls = true }) {
    const b = bowler;
    return /* @__PURE__ */ import_react2.default.createElement("div", { style: css("display:grid;grid-template-columns:minmax(0,1fr) 70px 54px;align-items:baseline;color:#262626") }, /* @__PURE__ */ import_react2.default.createElement("span", { style: css("font-size:25px;font-weight:500;white-space:nowrap;overflow:hidden") }, b.name), /* @__PURE__ */ import_react2.default.createElement("span", { style: css("font-size:25px;font-weight:500") }, figs(b)), /* @__PURE__ */ import_react2.default.createElement("span", { style: css("font-size:16px;font-weight:500;padding-left:4px") }, showBalls ? b.overs : ""));
  }
  function BroadcastPlayerList({ batting = SAMPLE_MATCH.innings[0].batting, bowling = SAMPLE_MATCH.innings[0].bowling, rows = 4, showBalls = true, gap = 8 }) {
    return /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:relative;flex:1;display:grid;grid-template-columns:1fr 1fr;column-gap:60px;padding:18px 150px 0 152px;align-content:start") }, /* @__PURE__ */ import_react2.default.createElement("div", { style: { display: "flex", flexDirection: "column", gap } }, batting.slice(0, rows).map((b, k) => /* @__PURE__ */ import_react2.default.createElement(BroadcastBatterRow, { key: k, batter: b, showBalls }))), /* @__PURE__ */ import_react2.default.createElement("div", { style: { display: "flex", flexDirection: "column", gap } }, bowling.slice(0, rows).map((b, k) => /* @__PURE__ */ import_react2.default.createElement(BroadcastBowlerRow, { key: k, bowler: b, showBalls }))));
  }
  function BroadcastResultBar({ result = SAMPLE_MATCH.result }) {
    return /* @__PURE__ */ import_react2.default.createElement("div", { style: css("position:relative;flex:none;height:64px;display:flex;align-items:center;justify-content:center;margin-bottom:22px") }, /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`height:52px;padding:0 48px;background:${TEAL.dark};clip-path:polygon(3% 0,97% 0,100% 100%,0 100%);display:flex;align-items:center;color:#fff;font-size:30px;font-weight:600`) }, result));
  }
  function BroadcastSummary({
    match = SAMPLE_MATCH,
    teams = SAMPLE_TEAMS,
    format = "landscape",
    theme = "broadcast",
    rows = 4,
    showBalls = true,
    showResult,
    background,
    scale = 0.86,
    assetBase = ""
  }) {
    const m = resolveMatch(match, teams);
    const withResult = showResult != null ? showResult : format !== "landscape";
    const gap = GAP[format] || 8;
    const A = assetBase;
    return /* @__PURE__ */ import_react2.default.createElement(Stage, { format, background, assetBase: A, label: "Broadcast Summary", vignette: "radial-gradient(ellipse at 50% 50%,rgba(0,0,0,.15),rgba(0,0,0,.55))" }, /* @__PURE__ */ import_react2.default.createElement("div", { style: css(`position:absolute;inset:0;transform:scale(${scale});transform-origin:50% 50%;filter:drop-shadow(0 14px 30px rgba(0,0,0,.55));font-family:var(--font-broadcast,'Barlow Condensed','Arial Narrow',sans-serif);text-transform:uppercase;display:flex;flex-direction:column`) }, /* @__PURE__ */ import_react2.default.createElement(BroadcastPanel, null), /* @__PURE__ */ import_react2.default.createElement(BroadcastTitleBar, { home: m.home, away: m.away, venue: match.venue, date: match.date }), m.innings.map((inn, idx) => /* @__PURE__ */ import_react2.default.createElement("div", { key: idx, style: css("position:relative;flex:1;display:flex;flex-direction:column;padding-top:6px;min-height:0") }, /* @__PURE__ */ import_react2.default.createElement(BroadcastInningsBar, { club: inn.club, overs: inn.overs, wickets: inn.wickets, runs: inn.runs, grade: match.grade, theme, assetBase: A }), /* @__PURE__ */ import_react2.default.createElement(BroadcastPlayerList, { batting: inn.batting, bowling: inn.bowling, rows, showBalls, gap }))), withResult ? /* @__PURE__ */ import_react2.default.createElement(BroadcastResultBar, { result: match.result }) : null));
  }

  // src/components/PanelSummary.jsx
  var import_react3 = __toESM(require_react_shim());
  var BROADCAST = [
    { hi: "#5f9ae6", mid: "#2f6fc9", lo: "#1f5bb4", deep: "#0d3a86", rowHi: "#2c69c2", rowLo: "#123f8e", fg: "#ffffff" },
    { hi: "#6dbb5a", mid: "#3f9437", lo: "#2f8329", deep: "#17561a", rowHi: "#3c8d35", rowLo: "#1b5c1d", fg: "#ffffff" }
  ];
  var INSET = { landscape: 24, square: 90, portrait: 140 };
  function clubPalette(t) {
    const c = t.colour;
    return { hi: shade(c, 0.3), mid: shade(c, 0.08), lo: c, deep: shade(c, -0.3), rowHi: shade(c, 0.06), rowLo: shade(c, -0.2), fg: t.onColour };
  }
  function headerPalette(t) {
    const s = t.secondary;
    return isLight(s) ? { hi: "#ffffff", mid: shade(s, -0.03), lo: shade(s, -0.09), deep: shade(s, -0.2), fg: t.onSecondary, shadow: "0 1px 0 rgba(255,255,255,.8)", tile: s } : { hi: shade(s, 0.18), mid: shade(s, 0.06), lo: s, deep: shade(s, -0.35), fg: t.onSecondary, shadow: "0 2px 2px rgba(0,0,0,.55)", tile: s };
  }
  function panelPalettes(club, idx = 0, theme = "club") {
    const p = theme === "club" ? clubPalette(club) : BROADCAST[idx % 2];
    const h = theme === "club" ? headerPalette(club) : { ...p, shadow: "0 1px 2px rgba(0,0,0,.45)", tile: "#ffffff" };
    return { rows: p, header: h };
  }
  function PanelFrame({ children }) {
    return /* @__PURE__ */ import_react3.default.createElement("div", { style: css("flex:1;display:flex;flex-direction:column;border-radius:20px;padding:0 10px 10px;border:2px solid #2b2e31;background:linear-gradient(90deg,#8c9196 0%,#e9ebed 6%,#ffffff 12%,#cfd2d5 30%,#f4f5f6 50%,#cfd2d5 70%,#ffffff 88%,#e9ebed 94%,#8c9196 100%);box-shadow:0 18px 40px rgba(0,0,0,.65),inset 0 2px 0 #ffffff,inset 0 -3px 0 #7d8287,inset 2px 0 0 rgba(255,255,255,.8),inset -2px 0 0 rgba(255,255,255,.8)") }, children);
  }
  function PanelHeader({ title = "Match Summary" }) {
    return /* @__PURE__ */ import_react3.default.createElement("div", { style: css("flex:none;height:64px;position:relative;display:flex;align-items:center;justify-content:center;margin:0 -10px;border-radius:18px 18px 0 0;background:linear-gradient(180deg,#ffffff 0%,#f7f8f9 30%,#e4e6e8 52%,#c9cdd1 56%,#dfe2e5 82%,#b9bdc1 100%);box-shadow:inset 0 2px 0 #fff,inset 0 -1px 0 #8f9499") }, /* @__PURE__ */ import_react3.default.createElement("div", { style: css("position:absolute;left:12%;right:12%;top:3px;height:24px;border-radius:50%;background:radial-gradient(ellipse at 50% 0%,rgba(255,255,255,.95),rgba(255,255,255,0) 70%)") }), /* @__PURE__ */ import_react3.default.createElement("span", { style: css("position:relative;color:#26282b;font-size:44px;font-weight:800;letter-spacing:.01em;text-shadow:0 1px 0 rgba(255,255,255,.9)") }, title));
  }
  function PanelWell({ children }) {
    return /* @__PURE__ */ import_react3.default.createElement("div", { style: css("flex:1;display:flex;flex-direction:column;overflow:hidden;background:#2a2d31;border:1px solid rgba(40,44,48,.55);border-radius:3px;box-shadow:0 1px 0 rgba(255,255,255,.8),0 -1px 0 rgba(143,148,153,.6)") }, children);
  }
  function PanelInningsHeader({ club = SAMPLE_TEAMS.HHCC, overs = "26.1", wickets = 4, runs: r = 172, palette, theme = "club", assetBase = "" }) {
    const h = palette || panelPalettes(club, 0, theme).header;
    return /* @__PURE__ */ import_react3.default.createElement("div", { style: css(`flex:none;height:62px;display:flex;align-items:center;gap:14px;padding:0 22px 0 14px;background:linear-gradient(180deg,${h.hi} 0%,${h.mid} 48%,${h.lo} 52%,${h.deep} 100%);border-top:1px solid rgba(255,255,255,.3);border-bottom:1px solid rgba(0,0,0,.25);color:${h.fg}`) }, /* @__PURE__ */ import_react3.default.createElement("div", { style: css(`width:50px;height:50px;flex:none;background:${h.tile};box-shadow:0 2px 5px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;overflow:hidden`) }, /* @__PURE__ */ import_react3.default.createElement("img", { src: asset(assetBase, club.logo), alt: "", style: { width: 46, height: 46, objectFit: "contain" } })), /* @__PURE__ */ import_react3.default.createElement("span", { style: css(`flex:1;min-width:0;font-size:40px;font-weight:800;white-space:nowrap;overflow:hidden;text-shadow:${h.shadow}`) }, club.name), /* @__PURE__ */ import_react3.default.createElement("div", { style: css(`display:flex;align-items:center;gap:14px;flex:none;text-shadow:${h.shadow}`) }, /* @__PURE__ */ import_react3.default.createElement("span", { style: css("font-size:28px;font-weight:600;text-transform:none") }, overs, " Overs"), /* @__PURE__ */ import_react3.default.createElement("span", { style: css(`width:4px;height:30px;background:${h.fg}`) }), /* @__PURE__ */ import_react3.default.createElement("span", { style: css("font-size:40px;font-weight:800") }, score({ wickets, runs: r }))));
  }
  function PanelPlayerRow({ player, kind = "bat", palette }) {
    const p = palette || panelPalettes(SAMPLE_TEAMS.HHCC).rows;
    const r = player, isBat = kind === "bat";
    return /* @__PURE__ */ import_react3.default.createElement("div", { style: css(`flex:1;min-height:38px;display:grid;grid-template-columns:minmax(0,1fr) ${isBat ? 70 : 80}px 70px;align-items:center;padding:0 18px;background:linear-gradient(180deg,${p.rowHi} 0%,${p.rowLo} 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(0,0,0,.12);color:${p.fg};font-size:25px;font-weight:700`) }, /* @__PURE__ */ import_react3.default.createElement("span", { style: css("white-space:nowrap;overflow:hidden") }, r ? r.name : ""), /* @__PURE__ */ import_react3.default.createElement("span", { style: { textAlign: "center" } }, r ? isBat ? runs(r) : figs(r) : ""), /* @__PURE__ */ import_react3.default.createElement("span", { style: { textAlign: "center", fontWeight: 600 } }, r ? isBat ? r.balls : r.overs : ""));
  }
  function PanelPlayerGrid({ batting = SAMPLE_MATCH.innings[1].batting, bowling = SAMPLE_MATCH.innings[1].bowling, rows = 4, palette }) {
    const p = palette || panelPalettes(SAMPLE_TEAMS.HHCC).rows;
    const list = (arr, kind) => {
      const out = [];
      for (let k = 0; k < rows; k++) out.push(/* @__PURE__ */ import_react3.default.createElement(PanelPlayerRow, { key: k, player: arr[k], kind, palette: p }));
      return out;
    };
    return /* @__PURE__ */ import_react3.default.createElement("div", { style: css(`flex:1;display:grid;grid-template-columns:1fr 1fr;column-gap:2px;padding:2px 0 0;background:linear-gradient(180deg,${p.deep},${p.lo});min-height:0`) }, /* @__PURE__ */ import_react3.default.createElement("div", { style: css("display:flex;flex-direction:column;gap:2px") }, list(batting, "bat")), /* @__PURE__ */ import_react3.default.createElement("div", { style: css("display:flex;flex-direction:column;gap:2px") }, list(bowling, "bowl")));
  }
  function PanelResultBar({ result = SAMPLE_MATCH.result }) {
    return /* @__PURE__ */ import_react3.default.createElement("div", { style: css("flex:none;height:56px;margin-top:8px;display:flex;align-items:center;justify-content:center;border:2px solid #2b2e31;border-radius:3px;background:linear-gradient(180deg,#ffffff 0%,#fbfbfc 45%,#e9ebed 55%,#d6d9dc 100%);box-shadow:inset 0 1px 0 #fff,inset 0 -2px 0 #b5b9bd,0 1px 0 rgba(255,255,255,.8)") }, /* @__PURE__ */ import_react3.default.createElement("span", { style: css("color:#1e1f22;font-size:34px;font-weight:800;text-shadow:0 1px 0 rgba(255,255,255,.9)") }, result));
  }
  function PanelSummary({
    match = SAMPLE_MATCH,
    teams = SAMPLE_TEAMS,
    format = "landscape",
    theme = "club",
    rows = 4,
    background,
    scale = 0.9,
    assetBase = ""
  }) {
    const m = resolveMatch(match, teams);
    const A = assetBase;
    return /* @__PURE__ */ import_react3.default.createElement(Stage, { format, background, assetBase: A, label: "Panel Summary", vignette: "radial-gradient(ellipse at 50% 50%,rgba(0,0,0,.1),rgba(0,0,0,.5))" }, /* @__PURE__ */ import_react3.default.createElement("div", { style: css(`position:absolute;inset:${INSET[format] || 24}px 40px;transform:scale(${scale});transform-origin:50% 50%;font-family:var(--font-panel,'Barlow Semi Condensed','Arial Narrow',sans-serif);text-transform:uppercase;display:flex`) }, /* @__PURE__ */ import_react3.default.createElement(PanelFrame, null, /* @__PURE__ */ import_react3.default.createElement(PanelHeader, null), /* @__PURE__ */ import_react3.default.createElement(PanelWell, null, m.innings.map((inn, idx) => {
      const pal = panelPalettes(inn.club, idx, theme);
      return /* @__PURE__ */ import_react3.default.createElement("div", { key: idx, style: css("flex:1;display:flex;flex-direction:column;min-height:0") }, /* @__PURE__ */ import_react3.default.createElement(PanelInningsHeader, { club: inn.club, overs: inn.overs, wickets: inn.wickets, runs: inn.runs, palette: pal.header, assetBase: A }), /* @__PURE__ */ import_react3.default.createElement(PanelPlayerGrid, { batting: inn.batting, bowling: inn.bowling, rows, palette: pal.rows }));
    })), /* @__PURE__ */ import_react3.default.createElement(PanelResultBar, { result: match.result }))));
  }

  // src/components/CleanSummary.jsx
  var import_react4 = __toESM(require_react_shim());
  var INSET2 = { landscape: 0, square: 110, portrait: 170 };
  var GAP2 = { landscape: 4, square: 10, portrait: 16 };
  function CleanHeader({ competition = SAMPLE_COMPETITION, venue = SAMPLE_MATCH.venue, assetBase = "" }) {
    return /* @__PURE__ */ import_react4.default.createElement("div", { style: css("flex:none;display:flex;align-items:center;gap:22px;padding:28px 36px 24px") }, competition.logo ? /* @__PURE__ */ import_react4.default.createElement("img", { src: asset(assetBase, competition.logo), alt: competition.association || "", style: css("width:72px;height:106px;flex:none;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,.4))") }) : null, /* @__PURE__ */ import_react4.default.createElement("div", { style: css("display:flex;flex-direction:column;gap:6px;min-width:0") }, /* @__PURE__ */ import_react4.default.createElement("span", { style: css("font-size:52px;font-weight:800;line-height:1;letter-spacing:.02em") }, "Match Summary"), /* @__PURE__ */ import_react4.default.createElement("div", { style: css("display:flex;flex-direction:column;font-size:17px;font-weight:600;letter-spacing:.04em;line-height:1.3;color:#e9ebee") }, /* @__PURE__ */ import_react4.default.createElement("span", null, competition.name), /* @__PURE__ */ import_react4.default.createElement("span", null, venue))));
  }
  function CleanInningsHeader({ club = SAMPLE_TEAMS.HHCC, overs = "26.1", wickets = 4, runs: r = 172, assetBase = "" }) {
    return /* @__PURE__ */ import_react4.default.createElement("div", { style: css("display:flex;align-items:center;gap:14px") }, /* @__PURE__ */ import_react4.default.createElement("img", { src: asset(assetBase, club.logoOnDark || club.logo), alt: "", style: css("width:52px;height:52px;margin:-8px 0;flex:none;object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))") }), /* @__PURE__ */ import_react4.default.createElement("span", { style: css(`font-size:27px;font-weight:800;color:${club.colourOnDark};white-space:nowrap`) }, club.name), /* @__PURE__ */ import_react4.default.createElement("span", { style: css(`font-size:27px;font-weight:800;color:${club.colourOnDark};margin-left:8px`) }, score({ wickets, runs: r })), /* @__PURE__ */ import_react4.default.createElement("span", { style: { flex: 1 } }), /* @__PURE__ */ import_react4.default.createElement("span", { style: css("font-size:13px;font-weight:600;letter-spacing:.06em;color:#b9bec5") }, overs, " Overs"));
  }
  function CleanPlayerRow({ player, kind = "bat", showBalls = true }) {
    const b = player, isBat = kind === "bat";
    return /* @__PURE__ */ import_react4.default.createElement("div", { style: css(`display:grid;grid-template-columns:minmax(0,1fr) ${isBat ? "64px 46px" : "80px 40px"};align-items:baseline`) }, /* @__PURE__ */ import_react4.default.createElement("span", { style: css("font-size:17px;font-weight:600;color:#e6e8eb;white-space:nowrap;overflow:hidden") }, b.name), /* @__PURE__ */ import_react4.default.createElement("span", { style: css("font-size:25px;font-weight:800;text-align:right") }, isBat ? runs(b) : figs(b)), /* @__PURE__ */ import_react4.default.createElement("span", { style: css("font-size:14px;font-weight:500;color:#c9cdd2;padding-left:7px") }, showBalls ? isBat ? b.balls : b.overs : ""));
  }
  function CleanPlayerList({ batting = SAMPLE_MATCH.innings[1].batting, bowling = SAMPLE_MATCH.innings[1].bowling, rows = 4, showBalls = true, gap = 4 }) {
    return /* @__PURE__ */ import_react4.default.createElement("div", { style: css("flex:1;display:grid;grid-template-columns:1fr 1fr;column-gap:70px;align-content:space-evenly;padding-left:50px") }, /* @__PURE__ */ import_react4.default.createElement("div", { style: { display: "flex", flexDirection: "column", gap } }, batting.slice(0, rows).map((b, k) => /* @__PURE__ */ import_react4.default.createElement(CleanPlayerRow, { key: k, player: b, kind: "bat", showBalls }))), /* @__PURE__ */ import_react4.default.createElement("div", { style: { display: "flex", flexDirection: "column", gap } }, bowling.slice(0, rows).map((b, k) => /* @__PURE__ */ import_react4.default.createElement(CleanPlayerRow, { key: k, player: b, kind: "bowl", showBalls }))));
  }
  function CleanInningsBand({ gap = 4, children }) {
    return /* @__PURE__ */ import_react4.default.createElement("div", { style: css(`flex:1;display:flex;flex-direction:column;gap:${gap}px;padding:16px 36px 18px;background:rgba(255,255,255,.045);border-top:1px solid rgba(255,255,255,.12);min-height:0`) }, children);
  }
  function CleanResultBar({ result = SAMPLE_MATCH.result, winner = SAMPLE_TEAMS.HHCC }) {
    return /* @__PURE__ */ import_react4.default.createElement("div", { style: css("flex:none;padding:16px 36px 28px;background:rgba(255,255,255,.045)") }, /* @__PURE__ */ import_react4.default.createElement("div", { style: css(`height:46px;display:flex;align-items:center;justify-content:center;background:${winner.colour};color:${winner.onColour};font-size:17px;font-weight:800;letter-spacing:.05em`) }, result));
  }
  function CleanSummary({
    match = SAMPLE_MATCH,
    teams = SAMPLE_TEAMS,
    competition = SAMPLE_COMPETITION,
    format = "landscape",
    rows = 4,
    showBalls = true,
    panelOpacity = 0.9,
    background,
    scale = 0.9,
    assetBase = ""
  }) {
    const m = resolveMatch(match, teams);
    const A = assetBase;
    const gap = GAP2[format] || 4;
    return /* @__PURE__ */ import_react4.default.createElement(Stage, { format, background, assetBase: A, label: "Clean Summary" }, /* @__PURE__ */ import_react4.default.createElement("div", { style: css(`position:absolute;inset:${INSET2[format] || 0}px 130px;transform:scale(${scale});transform-origin:50% 50%;font-family:var(--font-clean,'Montserrat',sans-serif);text-transform:uppercase;color:#fff;display:flex;flex-direction:column;background:rgba(28,32,38,${panelOpacity});box-shadow:0 20px 50px rgba(0,0,0,.45)`) }, /* @__PURE__ */ import_react4.default.createElement(CleanHeader, { competition, venue: match.venue, assetBase: A }), m.innings.map((inn, idx) => /* @__PURE__ */ import_react4.default.createElement(CleanInningsBand, { key: idx, gap }, /* @__PURE__ */ import_react4.default.createElement(CleanInningsHeader, { club: inn.club, overs: inn.overs, wickets: inn.wickets, runs: inn.runs, assetBase: A }), /* @__PURE__ */ import_react4.default.createElement(CleanPlayerList, { batting: inn.batting, bowling: inn.bowling, rows, showBalls, gap }))), /* @__PURE__ */ import_react4.default.createElement(CleanResultBar, { result: match.result, winner: m.winner })));
  }

  // src/components/ClassicSummary.jsx
  var import_react5 = __toESM(require_react_shim());
  var INSET3 = { landscape: 0, square: 120, portrait: 190 };
  function ClassicStripes({ winner = SAMPLE_TEAMS.HHCC }) {
    const sRgb = rgb(winner.colour), aRgb = rgb(shade(winner.colour, 0.45));
    return /* @__PURE__ */ import_react5.default.createElement("div", { style: css("position:absolute;inset:0;pointer-events:none;overflow:hidden") }, /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`position:absolute;top:-20%;bottom:-20%;left:-60px;width:110px;background:linear-gradient(180deg,rgba(${sRgb},0),rgba(${sRgb},.75) 40%,rgba(${sRgb},.55));transform:skewX(-14deg)`) }), /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`position:absolute;top:-20%;bottom:-20%;left:70px;width:34px;background:rgba(${aRgb},.5);transform:skewX(-14deg)`) }), /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`position:absolute;top:-20%;bottom:-20%;right:-60px;width:110px;background:linear-gradient(180deg,rgba(${sRgb},0),rgba(${sRgb},.75) 40%,rgba(${sRgb},.55));transform:skewX(-14deg)`) }), /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`position:absolute;top:-20%;bottom:-20%;right:70px;width:34px;background:rgba(${aRgb},.5);transform:skewX(-14deg)`) }));
  }
  function ClassicLogoTile({ team = SAMPLE_TEAMS.WSCC, side = "left", assetBase = "" }) {
    const left = side === "left";
    return /* @__PURE__ */ import_react5.default.createElement(import_react5.default.Fragment, null, left ? /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`position:absolute;left:0;top:0;bottom:0;width:150px;background:linear-gradient(135deg,${shade(team.dark, 0.18)} 0%,${team.dark} 55%,${shade(team.dark, -0.32)} 100%);clip-path:polygon(0 0,100% 0,80% 100%,0 100%);display:flex;align-items:center;justify-content:center;padding-right:24px;box-sizing:border-box`) }, /* @__PURE__ */ import_react5.default.createElement("img", { src: asset(assetBase, team.logoOnDark || team.logo), alt: team.name, style: css("height:84px;width:84px;object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))") })) : /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`position:absolute;right:0;top:0;bottom:0;width:150px;background:linear-gradient(225deg,${shade(team.dark, 0.18)} 0%,${team.dark} 55%,${shade(team.dark, -0.32)} 100%);clip-path:polygon(20% 0,100% 0,100% 100%,0 100%);display:flex;align-items:center;justify-content:center;padding-left:24px;box-sizing:border-box`) }, /* @__PURE__ */ import_react5.default.createElement("img", { src: asset(assetBase, team.logoOnDark || team.logo), alt: team.name, style: css("height:82px;width:82px;object-fit:contain;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))") })), left ? /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`position:absolute;left:128px;top:0;bottom:0;width:30px;background:linear-gradient(90deg,rgba(${rgb(team.dark)},.22),rgba(${rgb(team.dark)},0));clip-path:polygon(22px 0,100% 0,8px 100%,0 100%)`) }) : /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`position:absolute;right:128px;top:0;bottom:0;width:30px;background:linear-gradient(270deg,rgba(${rgb(team.dark)},.2),rgba(${rgb(team.dark)},0));clip-path:polygon(0 0,8px 0,100% 100%,22px 100%)`) }));
  }
  function ClassicHeader({ left = SAMPLE_TEAMS.WSCC, right = SAMPLE_TEAMS.HHCC, assetBase = "" }) {
    return /* @__PURE__ */ import_react5.default.createElement("div", { style: css("flex:none;position:relative;height:100px;background:linear-gradient(90deg,#ffffff 0%,#ffffff 55%,#eceded 100%);display:flex;align-items:center;justify-content:center;overflow:hidden") }, /* @__PURE__ */ import_react5.default.createElement(ClassicLogoTile, { team: left, side: "left", assetBase }), /* @__PURE__ */ import_react5.default.createElement(ClassicLogoTile, { team: right, side: "right", assetBase }), /* @__PURE__ */ import_react5.default.createElement("span", { style: css("position:relative;font-size:68px;font-weight:500;letter-spacing:.07em;color:#2a2b2d;line-height:1") }, "Match Summary"));
  }
  function ClassicContextStrip({ competition = SAMPLE_COMPETITION, venue = SAMPLE_MATCH.venue, winner = SAMPLE_TEAMS.HHCC }) {
    return /* @__PURE__ */ import_react5.default.createElement("div", { style: css("flex:none;height:42px;background:linear-gradient(180deg,#45484c 0%,#2f3236 100%);border-top:1px solid #1d1f22;display:flex;align-items:center;justify-content:center;gap:14px;color:#fff;font-size:20px;font-weight:600;letter-spacing:.05em") }, /* @__PURE__ */ import_react5.default.createElement("span", null, competition.name), /* @__PURE__ */ import_react5.default.createElement("span", { style: css(`width:5px;height:5px;background:${winner.colourOnDark};transform:rotate(45deg)`) }), /* @__PURE__ */ import_react5.default.createElement("span", null, venue));
  }
  function ClassicInningsBar({ club = SAMPLE_TEAMS.HHCC, overs = "26.1", wickets = 4, runs: r = 172 }) {
    const c = club;
    return /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`flex:none;height:46px;position:relative;overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) 220px 200px;align-items:center;padding:0 20px;background:linear-gradient(180deg,${shade(c.colour, 0.18)} 0%,${c.colour} 55%,${shade(c.colour, -0.1)} 100%);color:${c.onColour};border-top:1px solid rgba(255,255,255,.35);border-bottom:1px solid rgba(0,0,0,.25)`) }, /* @__PURE__ */ import_react5.default.createElement("div", { style: css("position:absolute;top:0;bottom:0;left:52%;width:260px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.16) 50%,rgba(255,255,255,0));transform:skewX(-24deg)") }), /* @__PURE__ */ import_react5.default.createElement("span", { style: css("position:relative;font-size:30px;font-weight:700;letter-spacing:.02em;white-space:nowrap;overflow:hidden") }, c.name), /* @__PURE__ */ import_react5.default.createElement("span", { style: css("position:relative;font-size:22px;font-weight:600;letter-spacing:.05em;text-align:center") }, "Overs ", overs), /* @__PURE__ */ import_react5.default.createElement("span", { style: css("position:relative;font-size:32px;font-weight:700;text-align:center") }, score({ wickets, runs: r })));
  }
  function ClassicPlayerRow({ batter, bowler, index = 0, club = SAMPLE_TEAMS.HHCC, showBalls = true }) {
    const b = batter, q = bowler;
    const star = isLight(club.colour) ? shade(club.colour, -0.2) : club.colour;
    return /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`flex:1;min-height:36px;display:grid;grid-template-columns:minmax(0,1fr) 64px 58px 44px minmax(0,1fr) 96px 64px;align-items:center;padding:0 20px;background:${index % 2 ? "#f4f4f5" : "#e6e7e8"};border-bottom:1px solid #ffffff;color:#2b2c2e`) }, /* @__PURE__ */ import_react5.default.createElement("span", { style: css("font-size:24px;font-weight:700;letter-spacing:.01em;white-space:nowrap;overflow:hidden") }, b ? b.name : ""), /* @__PURE__ */ import_react5.default.createElement("span", { style: css("display:flex;justify-content:flex-end;align-items:flex-start;font-size:27px;font-weight:700;line-height:1") }, b ? b.runs : "", /* @__PURE__ */ import_react5.default.createElement("span", { style: css(`font-size:17px;font-weight:600;color:${star};margin-left:1px`) }, b && b.notOut ? "*" : "")), /* @__PURE__ */ import_react5.default.createElement("span", { style: css("font-size:16px;font-weight:500;color:#8b8d90;padding-left:6px") }, b && showBalls ? b.balls : ""), /* @__PURE__ */ import_react5.default.createElement("span", null), /* @__PURE__ */ import_react5.default.createElement("span", { style: css("font-size:24px;font-weight:700;letter-spacing:.01em;white-space:nowrap;overflow:hidden") }, q ? q.name : ""), /* @__PURE__ */ import_react5.default.createElement("span", { style: css("font-size:25px;font-weight:700;text-align:right") }, figs(q, "/")), /* @__PURE__ */ import_react5.default.createElement("span", { style: css("font-size:16px;font-weight:500;color:#8b8d90;text-align:right") }, q && showBalls ? q.overs : ""));
  }
  function ClassicResultBar({ result = SAMPLE_MATCH.result, winner = SAMPLE_TEAMS.HHCC }) {
    return /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`flex:none;height:44px;display:flex;align-items:center;justify-content:center;background:${winner.colour};color:${winner.onColour};font-size:22px;font-weight:700;letter-spacing:.05em;border-top:1px solid rgba(0,0,0,.25)`) }, result);
  }
  function ClassicSummary({
    match = SAMPLE_MATCH,
    teams = SAMPLE_TEAMS,
    competition = SAMPLE_COMPETITION,
    format = "landscape",
    rows = 4,
    showBalls = true,
    stripes = true,
    background,
    scale = 0.9,
    assetBase = ""
  }) {
    const m = resolveMatch(match, teams);
    const A = assetBase;
    const w = m.winner;
    const [L, R] = [m.innings[0].club, m.innings[1].club];
    return /* @__PURE__ */ import_react5.default.createElement(Stage, { format, background, assetBase: A, label: "Classic Summary" }, stripes ? /* @__PURE__ */ import_react5.default.createElement(ClassicStripes, { winner: w }) : null, /* @__PURE__ */ import_react5.default.createElement("div", { style: css(`position:absolute;inset:${INSET3[format] || 0}px 100px;transform:scale(${scale});transform-origin:50% 50%;font-family:var(--font-broadcast,'Barlow Condensed','Arial Narrow',sans-serif);text-transform:uppercase;display:flex;flex-direction:column;box-shadow:0 18px 44px rgba(0,0,0,.5)`) }, /* @__PURE__ */ import_react5.default.createElement(ClassicHeader, { left: L, right: R, assetBase: A }), /* @__PURE__ */ import_react5.default.createElement(ClassicContextStrip, { competition, venue: match.venue, winner: w }), m.innings.map((inn, idx) => {
      const list = [];
      for (let k = 0; k < rows; k++) list.push(/* @__PURE__ */ import_react5.default.createElement(ClassicPlayerRow, { key: k, index: k, batter: inn.batting[k], bowler: inn.bowling[k], club: inn.club, showBalls }));
      return /* @__PURE__ */ import_react5.default.createElement("div", { key: idx, style: css("flex:1;display:flex;flex-direction:column;min-height:0") }, /* @__PURE__ */ import_react5.default.createElement(ClassicInningsBar, { club: inn.club, overs: inn.overs, wickets: inn.wickets, runs: inn.runs }), /* @__PURE__ */ import_react5.default.createElement("div", { style: css("flex:1;display:flex;flex-direction:column;min-height:0") }, list));
    }), /* @__PURE__ */ import_react5.default.createElement(ClassicResultBar, { result: match.result, winner: w })));
  }

  // src/components/ScoreboardSummary.jsx
  var import_react6 = __toESM(require_react_shim());
  var INSET4 = { landscape: 20, square: 150, portrait: 250 };
  var ovs = (o) => o && !String(o).includes(".") ? `${o}.0` : o;
  var GLOW = "text-shadow:0 0 7px rgba(255,255,255,.3)";
  var glow = (t) => `rgba(${rgb(t.colourOnDark)},.45)`;
  function ScoreboardFrame({ children }) {
    return /* @__PURE__ */ import_react6.default.createElement("div", { style: css("flex:1;display:flex;flex-direction:column;padding:12px;background:linear-gradient(180deg,#2a2d32,#121417);border-radius:6px;box-shadow:0 20px 50px rgba(0,0,0,.6),inset 0 1px 0 rgba(255,255,255,.12)") }, children);
  }
  function ScoreboardScreen({ ledTexture = 0.6, children }) {
    return /* @__PURE__ */ import_react6.default.createElement("div", { style: css("flex:1;position:relative;display:flex;flex-direction:column;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,#16295e 0%,#0e1c45 55%,#0a1433 100%);font-family:var(--font-panel,'Barlow Semi Condensed','Arial Narrow',sans-serif);color:#fff;box-shadow:inset 0 0 0 1px #05091a") }, children, /* @__PURE__ */ import_react6.default.createElement("div", { style: css(`position:absolute;inset:0;pointer-events:none;opacity:${ledTexture};background-image:radial-gradient(circle at 50% 50%,rgba(0,0,0,0) 0.8px,rgba(0,0,0,.55) 1.5px);background-size:4px 4px`) }), /* @__PURE__ */ import_react6.default.createElement("div", { style: css("position:absolute;inset:0;pointer-events:none;background:linear-gradient(160deg,rgba(255,255,255,.07) 0%,rgba(255,255,255,0) 35%)") }));
  }
  function ScoreboardHeader({ competition = SAMPLE_COMPETITION, venue = SAMPLE_MATCH.venue }) {
    return /* @__PURE__ */ import_react6.default.createElement("div", { style: css("flex:none;padding:16px 0 10px;text-align:center;font-size:32px;font-weight:800;font-style:italic;letter-spacing:.05em;text-transform:uppercase;text-shadow:0 0 8px rgba(255,255,255,.35)") }, competition.name, " · ", venue);
  }
  function ScoreboardLine({ name = "K.Standing", value = "53", sub = "(121)" }) {
    return /* @__PURE__ */ import_react6.default.createElement("div", { style: css(`display:grid;grid-template-columns:minmax(0,1fr) auto 62px;align-items:baseline;column-gap:4px;${GLOW}`) }, /* @__PURE__ */ import_react6.default.createElement("span", { style: css("font-size:27px;font-weight:700;font-style:italic;white-space:nowrap;overflow:hidden") }, name), /* @__PURE__ */ import_react6.default.createElement("span", { style: css("font-size:31px;font-weight:800;font-style:italic;text-align:right") }, value), /* @__PURE__ */ import_react6.default.createElement("span", { style: css("font-size:16px;font-weight:700;font-style:italic;padding-left:3px") }, sub));
  }
  function ScoreboardInningsBox({ innings = SAMPLE_MATCH.innings[0], club = SAMPLE_TEAMS.WSCC, rows = 3, showBalls = true, initials = true, gap = 2 }) {
    const inn = innings;
    const nm = (n) => initials ? initialName(n, ".") : n;
    return /* @__PURE__ */ import_react6.default.createElement("div", { style: css(`flex:1;display:grid;grid-template-columns:1fr 1fr;column-gap:28px;align-content:start;row-gap:${gap}px;padding:8px 18px 12px;border:3px solid ${club.colourOnDark};box-shadow:0 0 10px ${glow(club)},inset 0 0 10px ${glow(club)}`) }, /* @__PURE__ */ import_react6.default.createElement("span", { style: css(`font-size:30px;font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:.02em;color:${club.colourOnDark};text-shadow:0 0 8px ${glow(club)};white-space:nowrap`) }, club.name), /* @__PURE__ */ import_react6.default.createElement("div", { style: css("display:grid;grid-template-columns:auto auto minmax(0,1fr);align-items:baseline;column-gap:10px") }, /* @__PURE__ */ import_react6.default.createElement("span", { style: css("font-size:30px;font-weight:800;font-style:italic;text-shadow:0 0 8px rgba(255,255,255,.35)") }, inn.overs), /* @__PURE__ */ import_react6.default.createElement("span", { style: css("font-size:16px;font-weight:700;font-style:italic;letter-spacing:.06em") }, "OVERS"), /* @__PURE__ */ import_react6.default.createElement("span", { style: css("font-size:32px;font-weight:800;font-style:italic;text-align:right;text-shadow:0 0 8px rgba(255,255,255,.35)") }, score(inn, "-"))), /* @__PURE__ */ import_react6.default.createElement("div", { style: { display: "flex", flexDirection: "column", gap } }, inn.batting.slice(0, rows).map((b, k) => /* @__PURE__ */ import_react6.default.createElement(ScoreboardLine, { key: k, name: nm(b.name), value: `${b.runs}${b.notOut ? "*" : ""}`, sub: showBalls ? `(${b.balls})` : "" }))), /* @__PURE__ */ import_react6.default.createElement("div", { style: { display: "flex", flexDirection: "column", gap } }, inn.bowling.slice(0, rows).map((b, k) => /* @__PURE__ */ import_react6.default.createElement(ScoreboardLine, { key: k, name: nm(b.name), value: figs(b), sub: showBalls ? `(${ovs(b.overs)})` : "" }))));
  }
  function ScoreboardLogo({ competition = SAMPLE_COMPETITION, assetBase = "" }) {
    return /* @__PURE__ */ import_react6.default.createElement("div", { style: css("display:flex;align-items:center;justify-content:center") }, competition.logo ? /* @__PURE__ */ import_react6.default.createElement("img", { src: asset(assetBase, competition.logo), alt: competition.association || "", style: css("width:170px;max-height:250px;object-fit:contain;filter:drop-shadow(0 0 10px rgba(255,255,255,.15))") }) : null);
  }
  function ScoreboardResult({ result = SAMPLE_MATCH.result, winner = SAMPLE_TEAMS.HHCC }) {
    return /* @__PURE__ */ import_react6.default.createElement("div", { style: css(`flex:none;padding:12px 0 14px;text-align:center;font-size:32px;font-weight:800;font-style:italic;letter-spacing:.05em;text-transform:uppercase;color:${winner.colourOnDark};text-shadow:0 0 10px ${glow(winner)}`) }, result);
  }
  function ScoreboardTeamBand({ left = SAMPLE_TEAMS.WSCC, right = SAMPLE_TEAMS.HHCC, assetBase = "" }) {
    const L = left, R = right, A = assetBase;
    return /* @__PURE__ */ import_react6.default.createElement("div", { style: css("flex:none;height:58px;display:flex;align-items:center;justify-content:center;gap:26px;background:linear-gradient(180deg,#1d3f9a 0%,#16327f 100%);border-top:2px solid #0a1433") }, /* @__PURE__ */ import_react6.default.createElement("img", { src: asset(A, L.logoOnDark || L.logo), alt: "", style: css("height:42px;width:42px;object-fit:contain") }), /* @__PURE__ */ import_react6.default.createElement("span", { style: css("font-size:26px;font-weight:700;font-style:italic;letter-spacing:.04em;text-transform:uppercase") }, L.name), /* @__PURE__ */ import_react6.default.createElement("span", { style: css("font-size:18px;font-weight:600;font-style:italic;color:#b9c6ea") }, "v"), /* @__PURE__ */ import_react6.default.createElement("span", { style: css("font-size:26px;font-weight:700;font-style:italic;letter-spacing:.04em;text-transform:uppercase") }, R.name), /* @__PURE__ */ import_react6.default.createElement("img", { src: asset(A, R.logoOnDark || R.logo), alt: "", style: css("height:42px;width:42px;object-fit:contain") }));
  }
  function ScoreboardSummary({
    match = SAMPLE_MATCH,
    teams = SAMPLE_TEAMS,
    competition = SAMPLE_COMPETITION,
    format = "landscape",
    rows = 3,
    showBalls = true,
    initials = true,
    ledTexture = 0.6,
    background,
    scale = 0.94,
    assetBase = ""
  }) {
    const m = resolveMatch(match, teams);
    const A = assetBase;
    const gap = format === "landscape" ? 2 : 8;
    const [L, R] = [m.innings[0].club, m.innings[1].club];
    return /* @__PURE__ */ import_react6.default.createElement(Stage, { format, background, assetBase: A, label: "Scoreboard Summary" }, /* @__PURE__ */ import_react6.default.createElement("div", { style: css(`position:absolute;inset:${INSET4[format] || 20}px 40px;transform:scale(${scale});transform-origin:50% 50%;display:flex`) }, /* @__PURE__ */ import_react6.default.createElement(ScoreboardFrame, null, /* @__PURE__ */ import_react6.default.createElement(ScoreboardScreen, { ledTexture }, /* @__PURE__ */ import_react6.default.createElement(ScoreboardHeader, { competition, venue: match.venue }), /* @__PURE__ */ import_react6.default.createElement("div", { style: css("flex:1;display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:18px;padding:0 22px 0 26px;min-height:0") }, /* @__PURE__ */ import_react6.default.createElement("div", { style: css("display:flex;flex-direction:column;gap:14px;min-height:0") }, m.innings.map((inn, idx) => /* @__PURE__ */ import_react6.default.createElement(ScoreboardInningsBox, { key: idx, innings: inn, club: inn.club, rows, showBalls, initials, gap }))), /* @__PURE__ */ import_react6.default.createElement(ScoreboardLogo, { competition, assetBase: A })), /* @__PURE__ */ import_react6.default.createElement(ScoreboardResult, { result: match.result, winner: m.winner }), /* @__PURE__ */ import_react6.default.createElement(ScoreboardTeamBand, { left: L, right: R, assetBase: A })))));
  }

  // src/components/GroundScoreboardSummary.jsx
  var import_react7 = __toESM(require_react_shim());
  var INSET5 = { landscape: 40, square: 170, portrait: 270 };
  var LED = (o) => `position:absolute;inset:0;pointer-events:none;opacity:${o};background-image:radial-gradient(circle,rgba(0,0,0,0) .8px,rgba(0,0,0,.5) 1.5px);background-size:4px 4px`;
  var bar = (t) => `linear-gradient(180deg,${shade(t.dark, 0.12)},${t.dark} 60%,${shade(t.dark, -0.15)})`;
  function GroundScoreboardLed({ opacity = 0.55 }) {
    return /* @__PURE__ */ import_react7.default.createElement("div", { style: css(LED(opacity)) });
  }
  function GroundScoreboardBoard({ ledTexture = 0.55, children }) {
    return /* @__PURE__ */ import_react7.default.createElement("div", { style: css("position:relative;overflow:hidden;display:flex;flex-direction:column;padding:14px 16px 16px;background:radial-gradient(ellipse at 40% 20%,#2b353d 0%,#1d242a 60%,#151a1f 100%);color:#fff") }, children, /* @__PURE__ */ import_react7.default.createElement(GroundScoreboardLed, { opacity: ledTexture }), /* @__PURE__ */ import_react7.default.createElement("div", { style: css("position:absolute;inset:0;pointer-events:none;background:linear-gradient(165deg,rgba(255,255,255,.06) 0%,rgba(255,255,255,0) 40%)") }));
  }
  function GroundScoreboardHeader({ competition = SAMPLE_COMPETITION, venue = SAMPLE_MATCH.venue, winner = SAMPLE_TEAMS.HHCC }) {
    return /* @__PURE__ */ import_react7.default.createElement(import_react7.default.Fragment, null, /* @__PURE__ */ import_react7.default.createElement("span", { style: css("font-size:22px;font-weight:700;letter-spacing:.04em;line-height:1") }, "Match Summary"), /* @__PURE__ */ import_react7.default.createElement("span", { style: css(`font-size:30px;font-weight:800;letter-spacing:.02em;color:${winner.colourOnDark};line-height:1.1;margin-bottom:10px;white-space:nowrap;overflow:hidden`) }, competition.name, " · ", venue));
  }
  function GroundScoreboardCell({ name = "K Standing", value = "53", sub = 121, team = SAMPLE_TEAMS.WSCC }) {
    return /* @__PURE__ */ import_react7.default.createElement("div", { style: css(`display:grid;grid-template-columns:minmax(0,1fr) auto 46px;align-items:baseline;align-content:center;column-gap:8px;padding:0 16px;background:${bar(team)};color:#fff;text-transform:none`) }, /* @__PURE__ */ import_react7.default.createElement("span", { style: css("font-size:28px;font-weight:600;white-space:nowrap;overflow:hidden") }, name), /* @__PURE__ */ import_react7.default.createElement("span", { style: css("font-size:34px;font-weight:800;text-align:right") }, value), /* @__PURE__ */ import_react7.default.createElement("span", { style: css("font-size:17px;font-weight:600;opacity:.9") }, sub));
  }
  function GroundScoreboardTeamCell({ club = SAMPLE_TEAMS.WSCC, assetBase = "" }) {
    return /* @__PURE__ */ import_react7.default.createElement("div", { style: css(`display:flex;align-items:center;gap:12px;padding:0 12px 0 8px;background:${bar(club)};color:${club.bright};font-size:34px;font-weight:900;letter-spacing:.02em;white-space:nowrap;overflow:hidden`) }, /* @__PURE__ */ import_react7.default.createElement("img", { src: asset(assetBase, club.logoOnDark || club.logo), alt: "", style: css("width:44px;height:44px;flex:none;object-fit:contain;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))") }), /* @__PURE__ */ import_react7.default.createElement("span", null, club.name));
  }
  function GroundScoreboardScoreCell({ overs = "49.4", wickets = 10, runs: r = 168 }) {
    return /* @__PURE__ */ import_react7.default.createElement("div", { style: css("display:flex;align-items:center;gap:8px;padding:0 12px;background:linear-gradient(180deg,#fbf3dc,#efe2bb);color:#1e1f22") }, /* @__PURE__ */ import_react7.default.createElement("span", { style: css("font-size:32px;font-weight:800") }, overs), /* @__PURE__ */ import_react7.default.createElement("span", { style: css("font-size:15px;font-weight:700;letter-spacing:.06em") }, "Overs"), /* @__PURE__ */ import_react7.default.createElement("span", { style: { flex: 1 } }), /* @__PURE__ */ import_react7.default.createElement("span", { style: css("font-size:36px;font-weight:800") }, score({ wickets, runs: r }, "-")));
  }
  function GroundScoreboardInnings({ innings = SAMPLE_MATCH.innings[0], club = SAMPLE_TEAMS.WSCC, opp = SAMPLE_TEAMS.HHCC, rows = 3, showBalls = true, assetBase = "" }) {
    const inn = innings;
    const cells = [];
    for (let k = 0; k < rows; k++) {
      const b = inn.batting[k], q = inn.bowling[k];
      cells.push(/* @__PURE__ */ import_react7.default.createElement(GroundScoreboardCell, { key: `b${k}`, name: b ? initialName(b.name) : "", value: runs(b), sub: b && showBalls ? b.balls : "", team: club }));
      cells.push(/* @__PURE__ */ import_react7.default.createElement(GroundScoreboardCell, { key: `w${k}`, name: q ? initialName(q.name) : "", value: figs(q), sub: q && showBalls ? q.overs : "", team: opp }));
    }
    return /* @__PURE__ */ import_react7.default.createElement("div", { style: css("flex:1;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:minmax(40px,1fr);gap:3px 4px;min-height:0") }, /* @__PURE__ */ import_react7.default.createElement(GroundScoreboardTeamCell, { club, assetBase }), /* @__PURE__ */ import_react7.default.createElement(GroundScoreboardScoreCell, { overs: inn.overs, wickets: inn.wickets, runs: inn.runs }), cells);
  }
  function GroundScoreboardResult({ result = SAMPLE_MATCH.result }) {
    return /* @__PURE__ */ import_react7.default.createElement("div", { style: css("flex:none;height:46px;display:flex;align-items:center;justify-content:center;padding:0 14px;margin-top:3px;background:linear-gradient(180deg,#ffffff,#e9eaec);color:#1e1f22;font-size:30px;font-weight:800;letter-spacing:.02em") }, result);
  }
  function GroundScoreboardAssociation({ competition = SAMPLE_COMPETITION, ledTexture = 0.55, assetBase = "" }) {
    const cc = competition.colour || "#93182C";
    const assoc = (competition.association || "").split(" ");
    const assocTop = assoc.slice(0, -1).join(" "), assocBottom = assoc.slice(-1)[0] || "";
    return /* @__PURE__ */ import_react7.default.createElement("div", { style: css(`position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:16px;background:linear-gradient(180deg,${shade(cc, 0.12)} 0%,${cc} 55%,${shade(cc, -0.2)} 100%);color:#fff;text-align:center`) }, competition.logo ? /* @__PURE__ */ import_react7.default.createElement("img", { src: asset(assetBase, competition.logo), alt: competition.association || "", style: css("width:130px;height:190px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,.4))") }) : null, competition.association ? /* @__PURE__ */ import_react7.default.createElement("div", { style: css("display:flex;flex-direction:column;align-items:center;gap:8px") }, /* @__PURE__ */ import_react7.default.createElement("span", { style: css("font-size:26px;font-weight:800;line-height:1;letter-spacing:.03em") }, assocTop), /* @__PURE__ */ import_react7.default.createElement("span", { style: css(`width:110px;height:2px;background:${competition.accent || "#ffffff"}`) }), /* @__PURE__ */ import_react7.default.createElement("span", { style: css("font-size:22px;font-weight:600;line-height:1;letter-spacing:.06em") }, assocBottom)) : null, /* @__PURE__ */ import_react7.default.createElement(GroundScoreboardLed, { opacity: ledTexture }));
  }
  function GroundScoreboardSummary({
    match = SAMPLE_MATCH,
    teams = SAMPLE_TEAMS,
    competition = SAMPLE_COMPETITION,
    format = "landscape",
    rows = 3,
    showBalls = true,
    ledTexture = 0.55,
    background,
    scale = 0.96,
    assetBase = ""
  }) {
    const m = resolveMatch(match, teams);
    const A = assetBase;
    return /* @__PURE__ */ import_react7.default.createElement(Stage, { format, background, assetBase: A, label: "Ground Scoreboard Summary" }, /* @__PURE__ */ import_react7.default.createElement("div", { style: css(`position:absolute;inset:${INSET5[format] || 40}px 30px;transform:scale(${scale});transform-origin:50% 50%;display:grid;grid-template-columns:minmax(0,1fr) 190px;gap:6px;padding:10px;background:linear-gradient(180deg,#1c1e22,#0b0c0e);border-radius:4px;box-shadow:0 22px 50px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.1);font-family:var(--font-panel,'Barlow Semi Condensed','Arial Narrow',sans-serif);text-transform:uppercase`) }, /* @__PURE__ */ import_react7.default.createElement(GroundScoreboardBoard, { ledTexture }, /* @__PURE__ */ import_react7.default.createElement(GroundScoreboardHeader, { competition, venue: match.venue, winner: m.winner }), /* @__PURE__ */ import_react7.default.createElement("div", { style: css("flex:1;display:flex;flex-direction:column;gap:3px;min-height:0") }, m.innings.map((inn, idx) => /* @__PURE__ */ import_react7.default.createElement(GroundScoreboardInnings, { key: idx, innings: inn, club: inn.club, opp: inn.opp, rows, showBalls, assetBase: A })), /* @__PURE__ */ import_react7.default.createElement(GroundScoreboardResult, { result: match.result }))), /* @__PURE__ */ import_react7.default.createElement(GroundScoreboardAssociation, { competition, ledTexture, assetBase: A })));
  }

  // src/components/T20Summary.jsx
  var import_react8 = __toESM(require_react_shim());
  var PANEL = { landscape: 500, square: 760, portrait: 960 };
  var L_MARKS = [[112, 0.07], [205, 0.14], [60, 0.3], [185, 0.52], [95, 0.74], [40, 0.9]];
  var R_MARKS = [[960, 0.12], [1030, 0.34], [885, 0.5], [1e3, 0.66], [925, 0.86]];
  function T20LogoTile({ side = "left", team = SAMPLE_TEAMS.HHCC, assetBase = "" }) {
    const c = team.colourOnDark, r = rgb(c), left = side === "left";
    const clip = left ? "polygon(12% 0,100% 0,88% 100%,0 100%)" : "polygon(0 0,88% 0,100% 100%,12% 100%)";
    return /* @__PURE__ */ import_react8.default.createElement("div", { style: css(`position:absolute;${left ? "left" : "right"}:-2px;top:0;width:146px;height:70px;background:linear-gradient(${left ? 135 : 225}deg,${shade(c, 0.3)} 0%,${shade(c, -0.45)} 100%);clip-path:${clip}`) }, /* @__PURE__ */ import_react8.default.createElement("div", { style: css(`position:absolute;inset:2px 3px;background:radial-gradient(ellipse at ${left ? 20 : 80}% 0%,rgba(${r},.55) 0%,rgba(${r},.12) 45%,#050505 85%);clip-path:${clip};display:flex;align-items:center;justify-content:center`) }, /* @__PURE__ */ import_react8.default.createElement("span", { style: css(`position:absolute;left:${left ? 26 : 22}%;top:38%;font-size:10px;line-height:1;color:rgba(${r},.9)`) }, "×"), /* @__PURE__ */ import_react8.default.createElement("span", { style: css(`position:absolute;right:${left ? 22 : 26}%;top:38%;font-size:10px;line-height:1;color:rgba(${r},.9)`) }, "×"), /* @__PURE__ */ import_react8.default.createElement("img", { src: asset(assetBase, team.logoOnDark || team.logo), alt: "", style: css(`position:relative;width:54px;height:54px;object-fit:contain;filter:drop-shadow(0 0 6px rgba(${r},.7))`) })));
  }
  function T20Backdrop({ winner = SAMPLE_TEAMS.HHCC, loser = SAMPLE_TEAMS.WSCC, format = "landscape" }) {
    const H = SIZES[format] || 700;
    const lR = rgb(winner.colourOnDark), rR = rgb(loser.colourOnDark);
    const stripes = (r, side, dir) => [
      `top:-15%;bottom:-15%;${side}:-230px;width:300px;background:linear-gradient(${dir},rgba(${r},.28),rgba(${r},.08) 60%,rgba(${r},0))`,
      `top:-15%;bottom:-15%;${side}:20px;width:120px;background:linear-gradient(${dir},rgba(${r},.6),rgba(${r},.18) 55%,rgba(${r},0) 85%)`,
      `top:-15%;bottom:-15%;${side}:138px;width:3px;background:linear-gradient(${dir},rgba(${r},1),rgba(${r},.2) 60%,rgba(${r},0))`,
      `top:-15%;bottom:-15%;${side}:190px;width:1px;background:linear-gradient(${dir},rgba(${r},.6),rgba(${r},0) 70%)`
    ];
    return /* @__PURE__ */ import_react8.default.createElement("div", { style: css("position:absolute;inset:0;pointer-events:none;overflow:hidden") }, [...stripes(lR, "left", "180deg"), ...stripes(rR, "right", "0deg")].map((s, i) => /* @__PURE__ */ import_react8.default.createElement("div", { key: i, style: css(`position:absolute;transform:skewX(-30deg);${s}`) })), L_MARKS.map(([x, y], i) => /* @__PURE__ */ import_react8.default.createElement("span", { key: `l${i}`, style: css(`position:absolute;left:${x}px;top:${Math.round(H * y)}px;font-size:13px;line-height:1;color:rgba(${lR},.85)`) }, "×")), R_MARKS.map(([x, y], i) => /* @__PURE__ */ import_react8.default.createElement("span", { key: `r${i}`, style: css(`position:absolute;left:${x}px;top:${Math.round(H * y)}px;font-size:13px;line-height:1;color:rgba(${rR},.85)`) }, "×")));
  }
  function T20Header({ winner = SAMPLE_TEAMS.HHCC, loser = SAMPLE_TEAMS.WSCC, assetBase = "" }) {
    return /* @__PURE__ */ import_react8.default.createElement("div", { style: css("flex:none;position:relative;height:70px") }, /* @__PURE__ */ import_react8.default.createElement("div", { style: css("position:absolute;left:0;right:0;top:5px;height:62px;background:linear-gradient(180deg,#2a2a2a 0%,#111111 6%,#080808 60%,#000000 100%);border-top:2px solid #4a4a4a") }), /* @__PURE__ */ import_react8.default.createElement(T20LogoTile, { side: "left", team: winner, assetBase }), /* @__PURE__ */ import_react8.default.createElement(T20LogoTile, { side: "right", team: loser, assetBase }), /* @__PURE__ */ import_react8.default.createElement("span", { style: css("position:absolute;left:0;right:0;top:5px;height:62px;display:flex;align-items:center;justify-content:center;font-size:41px;font-weight:800;letter-spacing:.005em;line-height:1") }, "Match Summary"));
  }
  function T20ContextStrip({ competition = SAMPLE_COMPETITION, venue = SAMPLE_MATCH.venue }) {
    return /* @__PURE__ */ import_react8.default.createElement("div", { style: css("flex:none;height:34px;display:flex;align-items:center;justify-content:center;gap:10px;background:linear-gradient(180deg,#000000,#0b0b0b);color:#cfcfcf;font-size:16px;font-weight:500;letter-spacing:.02em;white-space:nowrap") }, /* @__PURE__ */ import_react8.default.createElement("span", null, competition.name), /* @__PURE__ */ import_react8.default.createElement("span", { style: css("width:2px;height:18px;background:#9a9a9a") }), /* @__PURE__ */ import_react8.default.createElement("span", null, venue));
  }
  function T20InningsBar({ club = SAMPLE_TEAMS.HHCC, overs = "26.1", wickets = 4, runs: r = 172 }) {
    const c = club.colourOnDark;
    return /* @__PURE__ */ import_react8.default.createElement("div", { style: css(`flex:none;height:34px;display:grid;grid-template-columns:2.4% 50% 23.2% 10.8% 13.6%;align-items:center;background:linear-gradient(180deg,${shade(c, 0.3)} 0%,${shade(c, 0.08)} 18%,${c} 70%,${shade(c, -0.12)} 100%);color:${club.dark};box-shadow:inset 0 1px 0 rgba(255,255,255,.45),inset 0 -2px 0 rgba(0,0,0,.18)`) }, /* @__PURE__ */ import_react8.default.createElement("span", null), /* @__PURE__ */ import_react8.default.createElement("span", { style: css("font-size:23px;font-weight:800;line-height:1;white-space:nowrap;overflow:hidden") }, club.name), /* @__PURE__ */ import_react8.default.createElement("span", { style: css("font-size:17px;font-weight:500;line-height:1;text-align:center;white-space:nowrap") }, "Overs ", overs), /* @__PURE__ */ import_react8.default.createElement("span", { style: css("font-size:27px;font-weight:700;font-stretch:100%;line-height:1;text-align:center;white-space:nowrap") }, score({ wickets, runs: r })), /* @__PURE__ */ import_react8.default.createElement("span", null));
  }
  function T20PlayerRow({ batter, bowler, showBalls = true, surnameOnly = true }) {
    const b = batter, q = bowler;
    const nm = (n) => surnameOnly ? surname(n) : n;
    return /* @__PURE__ */ import_react8.default.createElement("div", { style: css("flex:1;min-height:31px;display:grid;grid-template-columns:2.4% 36.6% 4% 8.6% 38% 8.2% 2.2%;align-items:center;background:linear-gradient(180deg,#1d1d1d 0%,#0b0b0b 45%,#000000 100%)") }, /* @__PURE__ */ import_react8.default.createElement("span", null), /* @__PURE__ */ import_react8.default.createElement("span", { style: css("font-size:19px;font-weight:700;line-height:1;white-space:nowrap;overflow:hidden") }, b ? nm(b.name) : ""), /* @__PURE__ */ import_react8.default.createElement("span", { style: css("position:relative;font-size:19px;font-weight:700;font-stretch:100%;line-height:1;text-align:right") }, b ? b.runs : "", /* @__PURE__ */ import_react8.default.createElement("span", { style: css("position:absolute;left:100%;top:-1px;font-size:16px") }, b && b.notOut ? "*" : "")), /* @__PURE__ */ import_react8.default.createElement("span", { style: css("font-size:12px;font-weight:500;font-stretch:100%;line-height:1;color:#bdbdbd;text-align:center;padding-top:5px") }, b && showBalls ? b.balls : ""), /* @__PURE__ */ import_react8.default.createElement("span", { style: css("font-size:19px;font-weight:700;line-height:1;white-space:nowrap;overflow:hidden") }, q ? nm(q.name) : ""), /* @__PURE__ */ import_react8.default.createElement("span", { style: css("font-size:19px;font-weight:700;font-stretch:100%;line-height:1;text-align:right") }, figs(q, "/")), /* @__PURE__ */ import_react8.default.createElement("span", null));
  }
  function T20ResultBar({ result = SAMPLE_MATCH.result, winner = SAMPLE_TEAMS.HHCC }) {
    return /* @__PURE__ */ import_react8.default.createElement("div", { style: css(`flex:none;height:38px;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#141414,#000000);border-top:3px solid #3a3a3a;color:${winner.colourOnDark};font-size:16px;font-weight:500;letter-spacing:.02em`) }, result);
  }
  function T20Summary({
    match = SAMPLE_MATCH,
    teams = SAMPLE_TEAMS,
    competition = SAMPLE_COMPETITION,
    format = "landscape",
    rows = 4,
    showBalls = true,
    surnameOnly = true,
    backgroundDim = 0.45,
    background,
    scale = 1.12,
    assetBase = ""
  }) {
    const m = resolveMatch(match, teams);
    const A = assetBase;
    const W = m.winner, Lo = m.loser;
    const edge = Math.min(0.9, backgroundDim + 0.2);
    return /* @__PURE__ */ import_react8.default.createElement(
      Stage,
      {
        format,
        background,
        assetBase: A,
        label: "T20 Summary",
        vignette: `linear-gradient(90deg,rgba(0,0,0,${edge}) 0%,rgba(0,0,0,${backgroundDim}) 30%,rgba(0,0,0,${backgroundDim}) 70%,rgba(0,0,0,${edge}) 100%)`
      },
      /* @__PURE__ */ import_react8.default.createElement(T20Backdrop, { winner: W, loser: Lo, format }),
      /* @__PURE__ */ import_react8.default.createElement("div", { style: css("position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none") }, /* @__PURE__ */ import_react8.default.createElement("div", { style: css(`width:784px;height:${PANEL[format] || 500}px;flex:none;transform:scale(${scale});transform-origin:50% 50%;font-family:var(--font-t20,'Archivo',sans-serif);font-stretch:125%;text-transform:uppercase;color:#fff;display:flex;flex-direction:column;filter:drop-shadow(0 10px 24px rgba(0,0,0,.55))`) }, /* @__PURE__ */ import_react8.default.createElement(T20Header, { winner: W, loser: Lo, assetBase: A }), /* @__PURE__ */ import_react8.default.createElement(T20ContextStrip, { competition, venue: match.venue }), m.innings.map((inn, idx) => {
        const rowsEl = [];
        for (let k = 0; k < rows; k++) rowsEl.push(/* @__PURE__ */ import_react8.default.createElement(T20PlayerRow, { key: k, batter: inn.batting[k], bowler: inn.bowling[k], showBalls, surnameOnly }));
        return /* @__PURE__ */ import_react8.default.createElement("div", { key: idx, style: css("flex:1;display:flex;flex-direction:column;min-height:0") }, /* @__PURE__ */ import_react8.default.createElement(T20InningsBar, { club: inn.club, overs: inn.overs, wickets: inn.wickets, runs: inn.runs }), /* @__PURE__ */ import_react8.default.createElement("div", { style: css("flex:1;display:flex;flex-direction:column;gap:3px;padding-top:3px;background:linear-gradient(180deg,#444444,#2e2e2e);min-height:0") }, rowsEl));
      }), /* @__PURE__ */ import_react8.default.createElement(T20ResultBar, { result: match.result, winner: W })))
    );
  }
  return __toCommonJS(src_exports);
})();
window.OvationMatch = OvationMatch;
