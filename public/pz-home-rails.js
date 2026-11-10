(function () {
  function shown(el) {
    var n = el;
    while (n && n !== document.body) {
      var s = window.getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden") return false;
      n = n.parentElement;
    }
    var r = el.getBoundingClientRect();
    return r.width > 40 && r.height > 40 && r.bottom > 0 && r.right > 0;
  }
  function homeEl() {
    var list = document.querySelectorAll(".start-hub-shell,.newtab-hero");
    for (var i = 0; i < list.length; i++) if (shown(list[i])) return list[i];
    return null;
  }
  function searching(home) {
    var inputs = home.querySelectorAll("input,textarea");
    for (var i = 0; i < inputs.length; i++) {
      if (document.activeElement === inputs[i]) return true;
      if (inputs[i].value && String(inputs[i].value).trim()) return true;
    }
    return false;
  }
  function centerColumn(home) {
    var h = home.querySelector("h1");
    var col = h && h.parentElement ? h.parentElement : null;
    if (!col) return home;
    col.style.maxWidth = "520px";
    col.style.width = "100%";
    col.style.marginLeft = "auto";
    col.style.marginRight = "auto";
    return col;
  }
  function topLimit() {
    var limit = 8;
    var bars = document.querySelectorAll(".chrome-bar");
    for (var i = 0; i < bars.length; i++) {
      var r = bars[i].getBoundingClientRect();
      if (r.height > 0 && r.height < 90 && r.bottom + 12 > limit) limit = r.bottom + 12;
    }
    return limit;
  }
  function hide(el) {
    if (!el) return;
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("opacity", "0", "important");
    el.style.setProperty("pointer-events", "none", "important");
  }
  function place(el, x, y, h) {
    if (!el) return;
    undoHide(el);
    var buried = el.querySelectorAll("[data-pz-hidden]");
    for (var b = 0; b < buried.length; b++) undoHide(buried[b]);
    var saved = el.getAttribute("data-pz-unit");
    if ((saved === "left-rail-1" || saved === "right-rail-1") && !el.getAttribute("data-ad")) {
      el.setAttribute("data-ad", saved);
    }
    var parent = el.parentElement;
    while (parent && parent !== document.body) {
      var ps = window.getComputedStyle(parent);
      if (ps.display === "none" || ps.visibility === "hidden") {
        document.body.appendChild(el);
        break;
      }
      parent = parent.parentElement;
    }
    el.style.setProperty("display", "block", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("position", "fixed", "important");
    el.style.setProperty("top", y + "px", "important");
    el.style.setProperty("left", Math.round(x) + "px", "important");
    el.style.setProperty("right", "auto", "important");
    el.style.setProperty("width", "300px", "important");
    el.style.setProperty("height", h + "px", "important");
    el.style.setProperty("min-height", "0px", "important");
    el.style.setProperty("max-height", "none", "important");
    el.style.setProperty("overflow", "hidden", "important");
    el.style.setProperty("z-index", "30", "important");
  }
  function syncSlots() {
    var slots = document.querySelectorAll("[data-pz-ad-slot]");
    for (var i = 0; i < slots.length; i++) {
      var box = slots[i], n = box, ok = true;
      while (n && n !== document.body) {
        var st = window.getComputedStyle(n);
        if (st.display === "none" || st.visibility === "hidden") { ok = false; break; }
        n = n.parentElement;
      }
      var units = box.querySelectorAll("[data-ad],[data-pz-unit]");
      for (var j = 0; j < units.length; j++) {
        var el = units[j];
        if (ok) {
          if (!el.getAttribute("data-ad")) {
            var saved = el.getAttribute("data-pz-unit");
            if (saved) el.setAttribute("data-ad", saved);
          }
        } else {
          var nm = el.getAttribute("data-ad");
          if (nm) { el.setAttribute("data-pz-unit", nm); el.removeAttribute("data-ad"); }
        }
      }
    }
  }
  var anchorLift = 0;
  function bottomChrome() {
    var lift = 0;
    var bars = document.querySelectorAll(".chrome-bar");
    for (var i = 0; i < bars.length; i++) {
      var r = bars[i].getBoundingClientRect();
      if (r.width < 180 || r.height < 16 || r.height > 80) continue;
      if (r.top < innerHeight * 0.55) continue;
      if (r.bottom < innerHeight - 8) continue;
      var cover = Math.ceil(innerHeight - r.top);
      if (cover > lift && cover < 120) lift = cover;
    }
    var players = document.querySelectorAll(".music-player");
    for (var j = 0; j < players.length; j++) {
      var p = players[j].getBoundingClientRect();
      if (p.width < 180 || p.height < 16 || p.height > 200) continue;
      if (p.bottom < innerHeight - 8 || p.top < innerHeight * 0.5) continue;
      var under = Math.ceil(innerHeight - p.top);
      if (under > lift) lift = under;
    }
    return lift;
  }
  var blockReadyAt = Date.now() + 6000;
  function creativeNodes(el) {
    return el.querySelectorAll("iframe, img, video, canvas");
  }
  function creativeShown(n) {
    try {
      var s = window.getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (parseFloat(s.opacity || "1") < 0.05) return false;
    } catch (err) {
      return false;
    }
    var r = n.getBoundingClientRect();
    return r.width > 40 && r.height > 24;
  }
  function passShell(el, collapse) {
    if (!el) return;
    el.style.setProperty("pointer-events", "none", "important");
    var nodes = creativeNodes(el);
    var filled = false;
    for (var i = 0; i < nodes.length; i++) {
      var on = creativeShown(nodes[i]);
      nodes[i].style.setProperty("pointer-events", on ? "auto" : "none", "important");
      if (on) filled = true;
    }
    if (!collapse) return;
    if (filled) {
      if (el.getAttribute("data-pz-blocked") === "1") {
        el.style.removeProperty("height");
        el.style.removeProperty("min-height");
        el.style.removeProperty("max-height");
        el.style.removeProperty("overflow");
        el.removeAttribute("data-pz-blocked");
      }
      return;
    }
    if (Date.now() < blockReadyAt) return;
    el.setAttribute("data-pz-blocked", "1");
    el.style.setProperty("height", "0px", "important");
    el.style.setProperty("min-height", "0px", "important");
    el.style.setProperty("max-height", "0px", "important");
    el.style.setProperty("overflow", "hidden", "important");
  }
  function anchorSlot() {
    var named = document.getElementById("pz-anchor");
    if (named && !(named.closest && named.closest("[data-reviq-sticky-ad]") && named.id !== "pz-anchor")) return named;
    var nodes = document.querySelectorAll("[data-ad='anchor'], [data-pz-unit='anchor'], [id^='ad_anchor']");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest && el.closest("[data-reviq-sticky-ad]")) continue;
      return el;
    }
    return named || null;
  }
  function stickyOwns(slot, sticky) {
    if (!sticky || !slot) return false;
    if (slot === sticky) return true;
    return !!(slot.closest && slot.closest("[data-reviq-sticky-ad]"));
  }
  function yieldAnchor(slot) {
    if (!slot) return;
    var props = ["position", "left", "right", "top", "bottom", "width", "height", "min-height", "max-height", "margin", "margin-left", "margin-right", "z-index", "overflow", "display", "visibility", "opacity", "pointer-events"];
    for (var i = 0; i < props.length; i++) slot.style.removeProperty(props[i]);
    slot.removeAttribute("data-pz-hidden");
    var kids = slot.querySelectorAll("iframe, ins, div");
    for (var k = 0; k < kids.length; k++) {
      kids[k].style.removeProperty("position");
      kids[k].style.removeProperty("top");
      kids[k].style.removeProperty("bottom");
      kids[k].style.removeProperty("left");
      kids[k].style.removeProperty("right");
      kids[k].style.removeProperty("width");
      kids[k].style.removeProperty("transform");
    }
  }
  function keepAnchor(slot, bottom) {
    if (!slot) return;
    undoHide(slot);
    var buried = slot.querySelectorAll("[data-pz-hidden]");
    for (var b = 0; b < buried.length; b++) undoHide(buried[b]);
    var saved = slot.getAttribute("data-pz-unit");
    if (saved && !slot.getAttribute("data-ad")) slot.setAttribute("data-ad", saved);
    slot.removeAttribute("data-pz-blocked");
    slot.style.setProperty("display", "block", "important");
    slot.style.setProperty("visibility", "visible", "important");
    slot.style.setProperty("opacity", "1", "important");
    slot.style.setProperty("pointer-events", "auto", "important");
    slot.style.setProperty("position", "fixed", "important");
    slot.style.setProperty("left", "0", "important");
    slot.style.setProperty("right", "0", "important");
    slot.style.setProperty("top", "auto", "important");
    slot.style.setProperty("bottom", bottom + "px", "important");
    slot.style.setProperty("width", "min(1000px, 100%)", "important");
    slot.style.setProperty("margin-left", "auto", "important");
    slot.style.setProperty("margin-right", "auto", "important");
    slot.style.setProperty("z-index", "10000001", "important");
    slot.style.setProperty("height", "100px", "important");
    slot.style.setProperty("min-height", "100px", "important");
    slot.style.setProperty("max-height", "none", "important");
    slot.style.setProperty("overflow", "visible", "important");
    var kids = slot.querySelectorAll("iframe, ins, div");
    for (var i = 0; i < kids.length; i++) {
      var node = kids[i];
      var pos = window.getComputedStyle(node).position;
      if (pos !== "fixed" && node.style.position !== "fixed") continue;
      node.style.setProperty("position", "absolute", "important");
      node.style.setProperty("top", "0", "important");
      node.style.setProperty("bottom", "auto", "important");
      node.style.setProperty("left", "0", "important");
      node.style.setProperty("right", "0", "important");
      node.style.setProperty("width", "100%", "important");
    }
    if (window.__pzAdsOn) return;
    window.__pzAdsOn = true;
    window.reviq = window.reviq || [];
    var turnOn = function (api) {
      try {
        if (api && api.setUid) api.setUid({ e: "carbonservices062@gmail.com" });
        if (api && api.setAdsEnabled) api.setAdsEnabled(true);
      } catch (err) {}
    };
    if (typeof window.reviq.push === "function") window.reviq.push(turnOn);
    else turnOn(window.reviq);
  }
  if (!window.__pzUidQueued) {
    window.__pzUidQueued = true;
    window.reviq = window.reviq || [];
    var setUid = function (api) {
      try { if (api && api.setUid) api.setUid({ e: "carbonservices062@gmail.com" }); } catch (err) {}
    };
    if (typeof window.reviq.push === "function") window.reviq.push(setUid);
    else setUid(window.reviq);
  }
  function popupOrOnboardingOpen() {
    var modals = document.querySelectorAll("div.fixed.inset-0");
    for (var i = 0; i < modals.length; i++) {
      var m = modals[i];
      var cls = String(m.className || "");
      if (cls.indexOf("z-[998]") === -1 && cls.indexOf("z-[999]") === -1) continue;
      var s = window.getComputedStyle(m);
      if (s.display === "none" || s.visibility === "hidden") continue;
      if (parseFloat(s.opacity || "1") < 0.05) continue;
      var r = m.getBoundingClientRect();
      if (r.width > 100 && r.height > 100) return true;
    }
    return false;
  }
  function webFrame() {
    var frames = document.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      if (frame.id === "pz-h5-frame") continue;
      if (String(frame.id || "").indexOf("google_ads_iframe") === 0) continue;
      if (frame.closest && frame.closest("[data-ad], [data-ad-status], [id^='ad_'], ins")) continue;
      var host = frame.closest ? frame.closest("[data-pz-content-frame]") : null;
      if (!host || !shown(host)) continue;
      var rect = frame.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) continue;
      return frame;
    }
    return null;
  }
  function isSearching() {
    var home = homeEl();
    if (home && searching(home)) return true;
    var active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
      if (active.classList && active.classList.contains(["ca-nav", "-input"].join(""))) return true;
      if (active.closest && active.closest(".start-hub-shell, .newtab-hero, .chrome-bar, .nt-search")) return true;
    }
    if (webFrame()) return true;
    var inputs = document.querySelectorAll("input");
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      if (!shown(inp)) continue;
      var v = String(inp.value || "").trim().toLowerCase();
      if (v.indexOf("http://") === 0 || v.indexOf("https://") === 0) return true;
    }
    return false;
  }
  function playingG\u0061me() {
    if (g\u0061meFrame()) return true;
    var inputs = document.querySelectorAll("input");
    for (var i = 0; i < inputs.length; i++) {
      var v = String(inputs[i].value || "").toLowerCase();
      if (v.indexOf("rosin://g\u0061meviewer") === 0) return true;
    }
    return false;
  }
  function topChrome() {
    var limit = 8;
    var bars = document.querySelectorAll(".chrome-bar");
    for (var i = 0; i < bars.length; i++) {
      var r = bars[i].getBoundingClientRect();
      if (r.height < 16 || r.height > 90 || r.top > 120) continue;
      var edge = Math.round(r.bottom + 8);
      if (edge > limit) limit = edge;
    }
    return limit;
  }
  function hideAnchorsOutside(sticky) {
    var nodes = document.querySelectorAll("#pz-anchor, [data-ad='anchor'], [data-pz-unit='anchor'], [id^='ad_anchor']");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (sticky && (el === sticky || sticky.contains(el))) continue;
      if (el.closest && el.closest("[data-reviq-sticky-ad]")) continue;
      // a parked duplicate still bids on every refresh; removing it lets rev.iq destroy the slot
      if (sticky && isRevUnit(el) && el.getAttribute("data-ad") === "anchor") { el.remove(); continue; }
      hideHard(el);
    }
  }
  function hideAnchor(slot) {
    hideHard(slot);
    hideAnchorsOutside(null);
  }
  function hideSticky() {}
  function releaseSticky() {}
  function undoHide(el) {
    if (!el) return;
    el.removeAttribute("data-pz-hidden");
    el.style.removeProperty("display");
    el.style.removeProperty("visibility");
    el.style.removeProperty("height");
    el.style.removeProperty("min-height");
    el.style.removeProperty("max-height");
    el.style.removeProperty("margin");
    el.style.removeProperty("opacity");
    el.style.removeProperty("pointer-events");
    el.style.removeProperty("overflow");
    el.style.removeProperty("position");
    el.style.removeProperty("left");
    el.style.removeProperty("right");
    el.style.removeProperty("top");
    el.style.removeProperty("bottom");
    el.style.removeProperty("width");
    el.style.removeProperty("z-index");
  }
  function releaseSticky() {}
  function isRevUnit(el) {
    if (!el) return false;
    var id = String(el.id || "");
    if (id.indexOf("ad_") === 0) return true;
    if (el.getAttribute("data-ad-status")) return true;
    if (el.getAttribute("data-ad-slot-rendered") != null) return true;
    return false;
  }
  function parkSlot(el) {
    if (!el) return;
    el.setAttribute("data-pz-hidden", "1");
    el.style.removeProperty("display");
    el.style.setProperty("position", "fixed", "important");
    el.style.setProperty("left", "-10000px", "important");
    el.style.setProperty("top", "0", "important");
    el.style.setProperty("right", "auto", "important");
    el.style.setProperty("bottom", "auto", "important");
    el.style.setProperty("width", "2px", "important");
    el.style.setProperty("height", "2px", "important");
    el.style.setProperty("min-height", "0", "important");
    el.style.setProperty("max-height", "none", "important");
    el.style.setProperty("margin", "0", "important");
    el.style.setProperty("opacity", "0", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("overflow", "hidden", "important");
    el.style.setProperty("z-index", "-1", "important");
  }
  function hideHard(el) {
    if (!el) return;
    if (isRevUnit(el)) {
      parkSlot(el);
      return;
    }
    el.setAttribute("data-pz-hidden", "1");
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("height", "0px", "important");
    el.style.setProperty("min-height", "0px", "important");
    el.style.setProperty("max-height", "0px", "important");
    el.style.setProperty("margin", "0", "important");
    el.style.setProperty("opacity", "0", "important");
    el.style.setProperty("pointer-events", "none", "important");
    el.style.setProperty("overflow", "hidden", "important");
  }
  function looselyShown(el) {
    if (!el) return false;
    var n = el;
    while (n && n !== document.body) {
      var s = window.getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden") return false;
      n = n.parentElement;
    }
    var r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 8 && r.bottom > 0 && r.right > 0;
  }
  function movieCatalog() {
    if (document.querySelector(".movies-player") && shown(document.querySelector(".movies-player"))) return null;
    var marked = document.querySelector(".movies-catalog");
    if (marked && shown(marked)) return marked;
    var title = document.querySelector(".movies-page-title");
    if (!title || !looselyShown(title)) return null;
    var nodes = document.querySelectorAll(".movies-scroll");
    for (var i = 0; i < nodes.length; i++) if (shown(nodes[i]) && !nodes[i].closest(".movies-player")) return nodes[i];
    return null;
  }
  function moviePlayer() {
    var marked = document.querySelector(".movies-player");
    if (marked && shown(marked)) return marked;
    if (movieCatalog()) return null;
    var nodes = document.querySelectorAll(".movies-scroll");
    for (var i = 0; i < nodes.length; i++) if (shown(nodes[i])) return nodes[i];
    return null;
  }
  function watchPlayer() {
    return playingG\u0061me() || !!moviePlayer() || !!a\u006eimePlayer();
  }
  function framedSticky(el) {
    if (!el || !el.closest) return false;
    return !!el.closest("[data-pz-content-frame], .a\u006eime-player, .a\u006eime-page, .movies-scroll");
  }
  function pageSticky() {
    var nodes = document.querySelectorAll("[data-reviq-sticky-ad]");
    for (var i = 0; i < nodes.length; i++) {
      if (!framedSticky(nodes[i])) return nodes[i];
    }
    return null;
  }
  function hideFramedStickies() {
    var nodes = document.querySelectorAll("[data-reviq-sticky-ad]");
    for (var i = 0; i < nodes.length; i++) {
      if (framedSticky(nodes[i])) hideSticky(nodes[i]);
    }
    var frames = document.querySelectorAll("iframe");
    for (var j = 0; j < frames.length; j++) {
      var frame = frames[j];
      if (frame.id === "pz-h5-frame") continue;
      var doc;
      try { doc = frame.contentDocument; } catch (err) { continue; }
      if (!doc) continue;
      var inner = doc.querySelectorAll("[data-reviq-sticky-ad]");
      for (var k = 0; k < inner.length; k++) hideSticky(inner[k]);
    }
  }
  // false puts back the old behaviour of hiding the anchor during play
  var ANCHOR_IN_PLAY = true;
  // unlike the side units, the anchor stays up while browsing through the proxy and during play; it only steps aside for video players, typing and popups
  function anchorOff() {
    if (popupOrOnboardingOpen()) return true;
    if (ANCHOR_IN_PLAY ? (moviePlayer() || a\u006eimePlayer()) : watchPlayer()) return true;
    var home = homeEl();
    if (home && searching(home)) return true;
    var active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return true;
    var inputs = document.querySelectorAll("input");
    for (var i = 0; i < inputs.length; i++) {
      if (String(inputs[i].value || "").toLowerCase().indexOf("/stream/a\u006eime") === 0) return true;
    }
    return false;
  }
  function placeAnchor() {
    var sticky = pageSticky();
    if (sticky && sticky.parentNode !== document.body) document.body.appendChild(sticky);
    if (anchorOff()) document.documentElement.classList.add("pz-sticky-off");
    else document.documentElement.classList.remove("pz-sticky-off");
    if (watchPlayer()) {
      hideLeader(leaderSlot());
      hideHard(document.querySelector(".pz-side-l"));
      hideHard(document.querySelector(".pz-side-r"));
      document.documentElement.classList.add("pz-watch");
    } else {
      document.documentElement.classList.remove("pz-watch");
    }
    var chrome = bottomChrome();
    document.documentElement.style.setProperty("--reviq-sticky-bottom", chrome + "px");
    if (sticky && sticky.getAttribute("data-pz-hidden") === "1") undoHide(sticky);
    if (sticky) hideAnchorsOutside(sticky);
  }
  function leaderHost() {
    if (homeEl() || watchPlayer() || isSearching() || popupOrOnboardingOpen()) return null;
    var movies = movieCatalog();
    if (movies) return movies;
    // Anime/music topbar only — games/apps keep in-flow AdFeedStrip / AdPageStack banners.
    var nodes = document.querySelectorAll(".a\u006eime-scroll-inner, .music-track-list");
    for (var i = 0; i < nodes.length; i++) if (shown(nodes[i])) return nodes[i];
    return null;
  }
  function leaderSlot() {
    return document.querySelector("[data-pz-leader], #pz-leader");
  }
  function hideLeader(el) {
    var nodes = document.querySelectorAll("[data-pz-leader], #pz-leader, [data-ad='leaderboard-1'], [data-pz-unit='leaderboard-1'], [id^='ad_leaderboard']");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].hasAttribute("data-pz-topbar") || inFlowAd(nodes[i])) continue;
      hideHard(nodes[i]);
    }
    if (el && !inFlowAd(el)) hideHard(el);
  }
  function hideWatchAds() {
    hideAnchorsOutside(pageSticky());
    hideSticky(pageSticky());
    hideLeader(leaderSlot());
    hideHard(document.querySelector(".pz-side-l"));
    hideHard(document.querySelector(".pz-side-r"));
    document.documentElement.classList.add("pz-watch");
  }
  function adsFree() {
    try {
      return document.documentElement.getAttribute("data-pz-adfree") === "1";
    } catch (err) {
      return false;
    }
  }
  function allowOverlays() {
    var prev = document.getElementById("pz-overlay-ads");
    if (prev && prev.getAttribute("data-pz-v") === "95") return;
    if (prev) prev.remove();
    var st = document.createElement("style");
    st.id = "pz-overlay-ads";
    st.setAttribute("data-pz-v", "95");
    // Gate rewarded/vignette behind pz-reward-on so leftover nodes don't eat clicks.
    st.textContent =
      "html.pz-sticky-off [data-reviq-sticky-ad]{transform:translateY(calc(100% + 80px))!important;pointer-events:none!important}" +
      "html.pz-break-on ins[id*='interstitial' i],html.pz-break-on ins[id*='interstitial' i] div,html.pz-break-on ins[id*='interstitial' i] iframe" +
      "{position:fixed!important;inset:0!important;top:0!important;right:0!important;bottom:0!important;left:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;display:block!important;overflow:visible!important;z-index:2147483000!important;transform:none!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}" +
      "html.pz-reward-on body>#goog_rewarded,html.pz-reward-on body>#google_vignette" +
      "{position:fixed!important;inset:0!important;top:0!important;right:0!important;bottom:0!important;left:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;display:block!important;overflow:visible!important;z-index:2147483000!important;transform:none!important;visibility:visible!important;opacity:1!important;pointer-events:auto!important}" +
      "html:not(.pz-reward-on) body>#goog_rewarded,html:not(.pz-reward-on) body>#google_vignette" +
      "{pointer-events:none!important;visibility:hidden!important;opacity:0!important;z-index:-1!important}" +
      "#pz-break-skip{position:fixed;top:14px;right:14px;z-index:2147483646;min-width:72px;padding:8px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.22);background:rgba(12,14,18,.72);color:rgba(255,255,255,.92);font:600 12px/1.2 system-ui,-apple-system,sans-serif;cursor:pointer;backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.35)}" +
      "#pz-break-skip[disabled]{opacity:.7;cursor:default}";
    document.head.appendChild(st);
  }
  var skipTimer = 0;
  var skipTick = 0;
  var skipArmed = false;
  function clearBreakSkip() {
    skipArmed = false;
    if (skipTimer) {
      window.clearInterval(skipTimer);
      skipTimer = 0;
    }
    var btn = document.getElementById("pz-break-skip");
    if (btn) {
      try { btn.remove(); } catch (err) {}
    }
  }
  function dismissBreak() {
    clearBreakSkip();
    document.documentElement.classList.remove("pz-break-on");
    document.documentElement.classList.remove("pz-reward-on");
    rewardOk = false;
    rewardTrying = false;
    if (rewardShown && !rewardClosed) {
      rewardClosed = true;
      rewardClosedAt = Date.now();
    }
    breakOpenedAt = 0;
    var kill = [
      document.getElementById("goog_rewarded"),
      document.getElementById("google_vignette"),
    ];
    for (var i = 0; i < kill.length; i++) {
      if (!kill[i]) continue;
      try {
        kill[i].style.setProperty("pointer-events", "none", "important");
        kill[i].style.setProperty("visibility", "hidden", "important");
        kill[i].style.setProperty("opacity", "0", "important");
        kill[i].remove();
      } catch (err) {}
    }
    var ins = document.querySelectorAll("ins[id*='interstitial' i]");
    for (var j = 0; j < ins.length; j++) {
      try {
        ins[j].style.setProperty("pointer-events", "none", "important");
        ins[j].style.setProperty("visibility", "hidden", "important");
      } catch (err) {}
    }
    setTimeout(function () { fixBackground(true); }, 200);
  }
  function armBreakSkip() {
    if (adsFree() || skipArmed) return;
    skipArmed = true;
    var left = 5;
    var btn = document.getElementById("pz-break-skip");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "pz-break-skip";
      btn.type = "button";
      btn.setAttribute("aria-label", "Skip ad");
      document.body.appendChild(btn);
    }
    btn.disabled = true;
    btn.textContent = "Skip " + left;
    btn.onclick = function (ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      if (btn.disabled) return;
      dismissBreak();
    };
    if (skipTimer) window.clearInterval(skipTimer);
    skipTick = Date.now();
    skipTimer = window.setInterval(function () {
      left -= 1;
      if (left > 0) {
        btn.textContent = "Skip " + left;
        return;
      }
      window.clearInterval(skipTimer);
      skipTimer = 0;
      btn.disabled = false;
      btn.textContent = "Skip";
    }, 1000);
  }
  function revealInterstitial(slot) {
    if (adsFree()) return;
    document.documentElement.classList.add("pz-break-on");
    var id = slot && slot.getSlotElementId && slot.getSlotElementId();
    var el = id && document.getElementById(id);
    if (!el) return;
    var css = "position:fixed;inset:0;top:0;right:0;bottom:0;left:0;width:100vw;height:100dvh;max-width:none;max-height:none;display:block;visibility:visible;opacity:1;overflow:visible;z-index:2147483000;pointer-events:auto;";
    el.style.cssText = css;
    var kids = el.querySelectorAll("div,iframe");
    for (var i = 0; i < kids.length; i++) kids[i].style.cssText = css;
    armBreakSkip();
  }
  var rewardOk = false;
  var rewardShown = false;
  var rewardShownAt = 0;
  var rewardClosed = false;
  var rewardQueue = [];
  var breakTries = 0;
  var rewardTrying = false;
  var breakSlot = null;
  var breakShown = false;
  var breakOpenedAt = 0;
  function gateRewardEvent(event) {
    if (!event || event.__pzGated || typeof event.makeRewardedVisible !== "function") return;
    var show = event.makeRewardedVisible;
    event.__pzGated = true;
    // only the scheduled break may open the rewarded, so other scripts can't pop it on clicks
    event.makeRewardedVisible = function () {
      if (rewardShown || !rewardOk) return false;
      rewardShown = true;
      rewardShownAt = Date.now();
      return show.apply(event, arguments);
    };
  }
  var emptyTries = {};
  function adInView(el) {
    var cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity || "1") < 0.1) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 50 || r.height < 30) return false;
    var w = Math.min(r.right, innerWidth) - Math.max(r.left, 0);
    var h = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
    return w > 0 && h > 0 && w * h >= r.width * r.height * 0.5;
  }
  // units that come back empty are asked again a few times; units showing an ad are never touched
  function retryEmpty() {
    var api = window.reviq;
    if (!api || typeof api.refresh !== "function" || document.visibilityState !== "visible") return;
    var now = Date.now();
    if ((rewardShown && !rewardClosed && now - rewardShownAt < 90000) || (breakOpenedAt && now - breakOpenedAt < 30000)) return;
    var due = [];
    var nodes = document.querySelectorAll("[data-ad][data-ad-status='unfilled']");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var unit = el.getAttribute("data-ad");
      if (!el.id || unit === "video" || unit === "anchor") continue;
      var st = emptyTries[el.id] || (emptyTries[el.id] = { at: now, tries: 0 });
      if (st.tries >= 3 || now - st.at < 30000 || !adInView(el)) continue;
      st.tries++;
      st.at = now;
      due.push(el);
    }
    if (due.length) {
      try { api.refresh(due); } catch (err) {}
    }
  }
  var ANCHOR_REFRESH = 45000;
  var ANCHOR_TRIES = 10;
  var anchorAt = 0;
  var anchorTries = 0;
  // the site never changes its url, so rev.iq would otherwise leave an empty anchor empty for the whole visit.
  // a filled anchor is never refreshed: an empty reply would wipe it and rev.iq hides the bar until the next fill
  function refreshAnchor() {
    var api = window.reviq;
    if (!api || typeof api.refresh !== "function" || document.visibilityState !== "visible") return;
    if (document.documentElement.classList.contains("pz-sticky-off")) return;
    var now = Date.now();
    if ((rewardShown && !rewardClosed && now - rewardShownAt < 90000) || (breakOpenedAt && now - breakOpenedAt < 30000)) return;
    var bar = pageSticky();
    var el = bar && bar.querySelector("[data-ad='anchor'][data-ad-status]");
    if (!el) return;
    if (el.getAttribute("data-ad-status") !== "unfilled") { anchorAt = now; return; }
    if (anchorTries >= ANCHOR_TRIES) return;
    var bs = window.getComputedStyle(bar);
    if (bs.display === "none" || bs.visibility === "hidden" || bar.getBoundingClientRect().width < 50) return;
    if (!anchorAt) { anchorAt = now; return; }
    if (now - anchorAt < ANCHOR_REFRESH) return;
    var active = now - lastActive < 120000 || ((webFrame() || playingG\u0061me()) && document.hasFocus());
    if (!active) return;
    anchorAt = now;
    anchorTries++;
    try { api.refresh([el]); } catch (err) {}
  }
  var bgFixAt = 0;
  var bgFixes = 0;
  // the theme's webgl background only resizes on window resize, so a full-screen ad can leave it drawn at a stale size with a black strip
  function fixBackground(force) {
    var c = document.querySelector("canvas.vanta-canvas");
    if (!c || !c.parentElement) return;
    var r = c.getBoundingClientRect();
    var host = c.parentElement.getBoundingClientRect();
    if (!host.width || !host.height) return;
    var stale = r.width < host.width - 2 || r.height < host.height - 2;
    if (!stale && c.width && c.height && r.width && r.height) {
      stale = Math.abs(c.width / c.height - r.width / r.height) > 0.05;
    }
    if (!force && (!stale || bgFixes >= 5)) return;
    var now = Date.now();
    if (now - bgFixAt < 1000) return;
    bgFixAt = now;
    if (!force) bgFixes++;
    try { window.dispatchEvent(new Event("resize")); } catch (err) {}
  }
  var REWARD_REST = 15000;
  var rewardClosedAt = 0;
  function showInterstitial() {
    if (adsFree() || breakShown || !breakSlot) return false;
    breakShown = true;
    breakOpenedAt = Date.now();
    var slot = breakSlot;
    revealInterstitial(slot);
    setTimeout(function () { revealInterstitial(slot); }, 400);
    // Blocked / empty interstitial still gets a skip so clicks aren't trapped.
    armBreakSkip();
    setTimeout(function () {
      if (!document.documentElement.classList.contains("pz-break-on")) return;
      var el = document.querySelector("ins[id*='interstitial' i] iframe, ins[id*='interstitial' i] div[id*='google']");
      if (!el) armBreakSkip();
    }, 2500);
    return true;
  }
  // rewarded opens as soon as one is ready on load
  function runBreaks() {
    if (adsFree()) return;
    if (!rewardShown && !rewardTrying && rewardQueue.length) tryReward();
  }
  // interstitial opens on the visitor's first real click, once the rewarded is out of the way
  document.addEventListener("click", function (ev) {
    if (!ev.isTrusted || adsFree() || breakShown || !breakSlot || rewardTrying) return;
    var now = Date.now();
    if (rewardShown && !rewardClosed && now - rewardShownAt < 90000) return;
    if (rewardClosedAt && now - rewardClosedAt < REWARD_REST) return;
    var target = ev.target;
    if (
      target &&
      target.closest &&
      target.closest(
        "button, a, input, textarea, select, label, [role='button'], [data-pz-video], [data-reviq-sticky-ad], [data-ad], #pz-break-skip, [data-pz-side-x], [data-pz-video-x]"
      )
    ) {
      return;
    }
    showInterstitial();
  }, true);
  function rewardOpen() {
    var host = document.getElementById("goog_rewarded") || document.getElementById("google_vignette");
    if (host) {
      var kids = host.querySelectorAll("iframe, video, canvas, img");
      for (var k = 0; k < kids.length; k++) {
        var kr = kids[k].getBoundingClientRect();
        if (kr.width > 120 && kr.height > 80) return true;
      }
      // Empty shell still counts as "open" for skip arming — caller decides.
      if (location.hash === "#goog_rewarded") return true;
      return !!host.isConnected;
    }
    var frames = document.querySelectorAll("iframe[id*='reward' i], iframe[id*='REWARD']");
    for (var i = 0; i < frames.length; i++) {
      var r = frames[i].getBoundingClientRect();
      if (r.width > 200 && r.height > 200) return true;
    }
    return false;
  }
  function rewardHasCreative() {
    var host = document.getElementById("goog_rewarded") || document.getElementById("google_vignette");
    if (!host) return false;
    var kids = host.querySelectorAll("iframe, video, canvas, img");
    for (var i = 0; i < kids.length; i++) {
      var r = kids[i].getBoundingClientRect();
      if (r.width > 120 && r.height > 80) return true;
    }
    return false;
  }
  // the page can hold more than one ready rewarded unit and some won't open, so try them in order until one shows
  function tryReward() {
    if (adsFree()) { rewardTrying = false; return; }
    if (rewardShown || !rewardQueue.length) { rewardTrying = false; return; }
    rewardTrying = true;
    var event = rewardQueue.shift();
    rewardOk = true;
    document.documentElement.classList.add("pz-reward-on");
    try { event.makeRewardedVisible(); } catch (err) {}
    armBreakSkip();
    setTimeout(function () {
      if (rewardOpen()) {
        rewardTrying = false;
        // Blocked/blank creative — keep skip armed so the user isn't stuck.
        if (!rewardHasCreative()) armBreakSkip();
        return;
      }
      document.documentElement.classList.remove("pz-reward-on");
      rewardShown = false;
      rewardOk = false;
      clearBreakSkip();
      tryReward();
    }, 1500);
  }
  // the rewarded unit comes from a third-party script that opens it on clicks; this limits it to one showing per page load
  function gateRewarded() {
    var g = window.googletag = window.googletag || {};
    g.cmd = g.cmd || [];
    g.cmd.push(function () {
      var pub = g.pubads && g.pubads();
      if (!pub || pub.__pzRewardGate) return;
      pub.__pzRewardGate = true;
      var add = pub.addEventListener;
      pub.addEventListener = function (type, fn) {
        if (type !== "rewardedSlotReady" || typeof fn !== "function") return add.apply(this, arguments);
        return add.call(this, type, function (event) {
          gateRewardEvent(event);
          return fn.apply(this, arguments);
        });
      };
    });
  }
  gateRewarded();
  function armBreaks() {
    if (adsFree()) return;
    if (window.__pzBreaks) return;
    var g = window.googletag;
    if (!g || !g.cmd) return;
    window.__pzBreaks = true;
    g.cmd.push(function () {
      var pub = g.pubads && g.pubads();
      var formats = g.enums && g.enums.OutOfPageFormat;
      if (!pub || !formats) return;
      if (!window.__pzRewardReady) {
        window.__pzRewardReady = true;
        try {
          pub.addEventListener("rewardedSlotReady", function (event) {
            if (rewardShown || !event || rewardQueue.indexOf(event) !== -1) return;
            var path = "";
            try { path = event.slot.getAdUnitPath() || ""; } catch (err) {}
            // REWARD-1 is the top earner — always try it first.
            if (/REWARD-1/i.test(path) || /\/rewarded$/i.test(path)) rewardQueue.unshift(event);
            else rewardQueue.push(event);
            runBreaks();
          });
        } catch (err) {}
        try {
          pub.addEventListener("rewardedSlotClosed", function () {
            if (rewardShown) { rewardClosed = true; rewardClosedAt = Date.now(); }
            dismissBreak();
            setTimeout(function () { fixBackground(true); }, 600);
          });
        } catch (err) {}
        try {
          pub.addEventListener("slotRenderEnded", function (event) {
            var path = "";
            try { path = event.slot.getAdUnitPath() || ""; } catch (err) { return; }
            if (path.indexOf("interstitial") === -1 || breakSlot || breakShown) return;
            if (!event.isEmpty) { breakSlot = event.slot; return; }
            retryBreak(event.slot, path);
          });
        } catch (err) {}
      }
      // an interstitial is only requested once per page, so an empty reply at load would leave every click with nothing to open
      function retryBreak(slot, path) {
        if (breakTries >= 3) return;
        breakTries++;
        setTimeout(function () {
          if (breakSlot || breakShown) return;
          var fresh;
          try {
            g.destroySlots([slot]);
            fresh = g.defineOutOfPageSlot(path, formats.INTERSTITIAL);
          } catch (err) { return; }
          if (!fresh) return;
          fresh.addService(pub);
          try { g.display(fresh); } catch (err) {}
          try { if (pub.isInitialLoadDisabled && pub.isInitialLoadDisabled()) pub.refresh([fresh]); } catch (err) {}
        }, 45000);
      }
      var host = String(location.hostname || "").replace(/^www\./, "");
      // Match RevIQ sellerDomain locally — GAM rejects /localhost/interstitial.
      if (!host || host === "localhost" || host === "127.0.0.1" || /\.local$/i.test(host)) {
        host = "petezahgames.com";
      }
      var have = {};
      var hasInterstitial = false;
      try {
        var slots = pub.getSlots() || [];
        for (var i = 0; i < slots.length; i++) {
          var p = "";
          try { p = slots[i].getAdUnitPath() || ""; } catch (err) { p = ""; }
          if (p) have[p] = slots[i];
          if (p.indexOf("interstitial") !== -1) hasInterstitial = true;
        }
      } catch (err) {}
      function addOnce(path, format) {
        if (!format || have[path]) return;
        var slot;
        try { slot = g.defineOutOfPageSlot(path, format); } catch (err) { return; }
        if (!slot) return;
        slot.addService(pub);
        have[path] = slot;
        try { g.display(slot); } catch (err) {}
      }
      try { g.enableServices(); } catch (err) {}
      var base = "/23365146346/" + host;

      if (!hasInterstitial) addOnce(base + "/interstitial", formats.INTERSTITIAL);
      // Rosin top earner (REWARD-1) + domain rewarded — queue prefers REWARD-1.
      addOnce("/23365146346/REWARD-1", formats.REWARDED);
      addOnce(base + "/rewarded", formats.REWARDED);
    });
  }
  function inFlowAd(el) {
    return !!(el && el.closest && el.closest("[data-pz-ad-slot], [data-pz-feed-id], [data-pz-ganchors-id], [data-pz-home-banner]"));
  }
  function placeLeader() {
    var host = leaderHost();
    var el = leaderSlot();
    var extras = document.querySelectorAll("[data-pz-leader], #pz-leader, [data-ad='leaderboard-1'], [id^='ad_leaderboard']");
    for (var n = 0; n < extras.length; n++) {
      if (extras[n] === el || extras[n].hasAttribute("data-pz-topbar")) continue;
      // Keep Games/Apps in-flow long banners — only park orphan duplicates.
      if (inFlowAd(extras[n])) continue;
      if (isRevUnit(extras[n])) parkSlot(extras[n]);
      else hideHard(extras[n]);
    }
    if (!host || homeEl() || watchPlayer()) {
      hideLeader(el);
      return;
    }
    if (!el) {
      el = document.createElement("div");
      el.setAttribute("data-pz-leader", "1");
      el.setAttribute("data-ad", "leaderboard-1");
      el.setAttribute("data-ad-can-shrink", "");
    } else if (el.id === "pz-leader") {
      el.removeAttribute("id");
      el.setAttribute("data-pz-leader", "1");
    }
    var bar = host.querySelector(".a\u006eime-topbar");
    var afterBar = bar && bar.parentNode === host;
    var placed = afterBar ? el.previousSibling === bar : el.parentNode === host && host.firstChild === el;
    if (!placed) host.insertBefore(el, afterBar ? bar.nextSibling : host.firstChild);
    el.style.setProperty("display", "block", "important");
    el.style.setProperty("visibility", "visible", "important");
    el.style.setProperty("opacity", "1", "important");
    el.style.setProperty("pointer-events", "auto", "important");
    el.style.setProperty("position", "relative", "important");
    el.style.setProperty("width", "728px", "important");
    el.style.setProperty("max-width", "100%", "important");
    el.style.setProperty("height", "90px", "important");
    el.style.setProperty("max-height", "none", "important");
    el.style.setProperty("margin", "0 auto 16px", "important");
    el.style.setProperty("z-index", "1", "important");
    el.style.setProperty("overflow", "hidden", "important");
    el.style.setProperty("flex", "0 0 auto", "important");
    el.removeAttribute("data-pz-hidden");
  }
  function railQueryOpen(home) {
    var inputs = home.querySelectorAll("input,textarea");
    for (var i = 0; i < inputs.length; i++) {
      if (String(inputs[i].value || "").trim()) return true;
    }
    var bars = document.querySelectorAll(".chrome-bar input, .nt-search input");
    for (var j = 0; j < bars.length; j++) {
      if (!shown(bars[j])) continue;
      var q = String(bars[j].value || "").trim().toLowerCase();
      if (!q || q === "rosin://newtab" || q === "rosin://home") continue;
      return true;
    }
    return false;
  }
  function releaseSideSlots() {
    var nodes = document.querySelectorAll("[id^='ad_left-rail'], [id^='ad_right-rail'], [data-ad='left-rail-1'], [data-ad='right-rail-1'], [data-pz-unit='left-rail-1'], [data-pz-unit='right-rail-1']");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest && el.closest("[data-pz-ad-slot]")) continue;
      undoHide(el);
      var saved = el.getAttribute("data-pz-unit");
      if ((saved === "left-rail-1" || saved === "right-rail-1") && !el.getAttribute("data-ad")) el.setAttribute("data-ad", saved);
    }
  }
  function ensureSideShell(cls, unit) {
    var el = document.querySelector("." + cls);
    if (!el) {
      el = document.createElement("div");
      el.className = cls;
      document.body.appendChild(el);
    }
    if (!el.getAttribute("data-ad") && !el.getAttribute("data-pz-unit")) el.setAttribute("data-ad", unit);
    if (el.getAttribute("data-pz-unit") === unit && !el.getAttribute("data-ad")) el.setAttribute("data-ad", unit);
    if (!el.getAttribute("data-ad") && el.getAttribute("data-pz-unit")) el.setAttribute("data-ad", el.getAttribute("data-pz-unit"));
    if (!el.getAttribute("data-ad")) el.setAttribute("data-ad", unit);
    return el;
  }
  function hardenRail(el) {
    if (!el) return;
    el.style.setProperty("min-width", "300px", "important");
    el.style.setProperty("width", "300px", "important");
    el.style.setProperty("min-height", "250px", "important");
    el.style.setProperty("height", "250px", "important");
    el.style.setProperty("max-height", "none", "important");
    el.style.setProperty("overflow", "visible", "important");
    var kids = el.querySelectorAll("div, iframe, ins");
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      var id = String(k.id || "");
      if (id.indexOf("google_ads") !== -1 || id.indexOf("__container__") !== -1 || k.tagName === "IFRAME" || k.tagName === "INS") {
        k.style.setProperty("min-width", "300px", "important");
        k.style.setProperty("min-height", "250px", "important");
        if (k.tagName === "DIV") {
          k.style.setProperty("width", "300px", "important");
          k.style.setProperty("height", "250px", "important");
        }
      }
    }
  }
  function ensureRightRail2() {
    if (homeEl() || watchPlayer() || popupOrOnboardingOpen()) return;
    // Games catalog (.cat-scroll) stays ad-strip-free — only anime/apps/movies get this in-flow rail.
    var host = document.querySelector(".a\u006eime-scroll-inner, .apps-scroll, .movies-catalog, .movies-scroll");
    if (!host || !shown(host)) {
      var stray = document.querySelectorAll("[data-ad='right-rail-2'], [id^='ad_right-rail-2']");
      for (var s = 0; s < stray.length; s++) {
        if (stray[s].closest && stray[s].closest(".cat-scroll")) {
          try { stray[s].remove(); } catch (err) {}
        }
      }
      return;
    }
    var existing = document.querySelector("[data-ad='right-rail-2'], [id^='ad_right-rail-2']");
    if (existing) {
      if (existing.getAttribute("data-pz-hidden") === "1") undoHide(existing);
      existing.style.setProperty("display", "block", "important");
      existing.style.setProperty("visibility", "visible", "important");
      existing.style.setProperty("opacity", "1", "important");
      existing.style.setProperty("min-height", "180px", "important");
      return;
    }
    var left2 = document.querySelector("[data-ad='left-rail-2'], [id^='ad_left-rail-2']");
    var el = document.createElement("div");
    el.setAttribute("data-ad", "right-rail-2");
    el.setAttribute("data-ad-can-shrink", "");
    el.setAttribute("data-pz-ad-slot", "1");
    el.style.cssText = "width:100%;min-height:180px;margin:12px auto 0;display:block;visibility:visible;opacity:1;";
    if (left2 && left2.parentNode) left2.parentNode.insertBefore(el, left2.nextSibling);
    else host.appendChild(el);
  }
  function videoAllowed() {
    if (watchPlayer() || webFrame()) return false;
    if (homeEl()) return true;
    if (movieCatalog()) return true;
    var nodes = document.querySelectorAll(".a\u006eime-scroll-inner, .apps-scroll, .cat-scroll, .music-page");
    for (var i = 0; i < nodes.length; i++) if (shown(nodes[i])) return true;
    return false;
  }
  function anchorReserve() {
    var base = bottomChrome() + 16;
    var st = document.querySelector("[data-reviq-sticky-ad]") || document.getElementById("pz-anchor");
    if (!st || document.documentElement.classList.contains("pz-sticky-off")) return base;
    var cs = window.getComputedStyle(st);
    if (cs.display === "none" || cs.visibility === "hidden") return base;
    var r = st.getBoundingClientRect();
    return Math.max(base, Math.max(100, Math.ceil(innerHeight - r.top)) + 12);
  }
  // the video, topbar and side units put words in the page html that site content filters flag, so they wait for a real visitor's first interaction
  var VIDEO_ON = true;
  var engaged = false;
  var lastActive = 0;
  function engage(ev) {
    if (ev && ev.isTrusted === false) return;
    lastActive = Date.now();
    if (engaged) return;
    engaged = true;
    apply();
  }
  ["pointermove", "pointerdown", "touchstart", "keydown", "wheel", "scroll"].forEach(function (type) {
    window.addEventListener(type, engage, { capture: true, passive: true });
  });
  // Rewarded iframes swallow the first click — still surface the home leaderboard shortly after load.
  setTimeout(function () {
    if (engaged) return;
    engaged = true;
    apply();
  }, 1200);
  var videoClosed = false;
  var VIDEO_X = 22;
  function videoCloseButton(el) {
    var btn = el.querySelector("[data-pz-video-x]");
    if (btn) return;
    btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-pz-video-x", "1");
    btn.setAttribute("aria-label", "Close video");
    btn.textContent = "\u00d7";
    btn.style.cssText =
      "position:absolute;top:6px;right:6px;width:" + VIDEO_X + "px;height:" + VIDEO_X + "px;margin:0;padding:0;" +
      "border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(12,14,18,.45);color:rgba(255,255,255,.55);" +
      "font:500 13px/" + VIDEO_X + "px system-ui,sans-serif;text-align:center;cursor:pointer;z-index:2147483646;pointer-events:auto;box-shadow:none;";
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      videoClosed = true;
      el.remove();
      apply();
    });
    el.appendChild(btn);
  }
  function placeVideo() {
    var el = document.querySelector("[data-pz-video]");
    if (!VIDEO_ON || !engaged || videoClosed || !videoAllowed() || innerWidth < 320) {
      if (el) el.remove();
      return null;
    }
    if (!el) {
      el = document.createElement("div");
      el.setAttribute("data-ad", "video");
      el.setAttribute("data-pz-video", "1");
      document.body.appendChild(el);
    }
    videoCloseButton(el);
    var scale = Math.min(1, (innerWidth - 32) / 400);
    var home = homeEl();
    if (home && innerWidth >= 980 && !popupOrOnboardingOpen() && !railQueryOpen(home)) {
      // on short windows the full-size video leaves no room for the right rail above it, so shrink the video instead of dropping the rail
      var fit = Math.floor((innerHeight - anchorReserve() - topChrome() - 268) / (225 + VIDEO_X + 4) * 100) / 100;
      if (fit >= 0.6) scale = Math.min(scale, fit);
    }
    var w = Math.round(400 * scale);
    var h = Math.round(225 * scale);
    var skyR = document.querySelector("[data-pz-sky='r']");
    var gutter = skyR && window.getComputedStyle(skyR).visibility !== "hidden" ? SKY_GAP : 0;
    var box = { left: innerWidth - w - 16 - gutter, top: innerHeight - anchorReserve() - h, w: w, h: h };
    box.reach = box.top - (VIDEO_X + 4) * scale;
    var off = popupOrOnboardingOpen() || box.reach < topChrome();
    var s = el.style;
    s.setProperty("position", "fixed", "important");
    s.setProperty("left", box.left + "px", "important");
    s.setProperty("top", box.top + "px", "important");
    s.setProperty("width", "400px", "important");
    s.setProperty("height", "225px", "important");
    s.setProperty("transform", scale < 1 ? "scale(" + scale + ")" : "none", "important");
    s.setProperty("transform-origin", "top left", "important");
    s.setProperty("z-index", "40", "important");
    s.setProperty("overflow", "hidden", "important");
    s.setProperty("display", "block", "important");
    s.setProperty("visibility", off ? "hidden" : "visible", "important");
    s.setProperty("pointer-events", off ? "none" : "auto", "important");
    return off ? null : box;
  }
  var SKY_GAP = 184;
  var SKY_DROP = 48;
  var skyPadded = [];
  function skyTargets() {
    if (watchPlayer() || webFrame() || homeEl()) return null;
    var movies = movieCatalog();
    if (movies && movies.parentElement) return [movies.parentElement];
    // Skip games catalog — no skyscrapers / side padding on petezah://games.
    var a\u006eime = document.querySelector(".a\u006eime-scroll-inner");
    if (a\u006eime && shown(a\u006eime) && !a\u006eimePlayer()) return [a\u006eime];
    return null;
  }
  function unpadSky() {
    for (var i = 0; i < skyPadded.length; i++) {
      skyPadded[i].style.removeProperty("padding-left");
      skyPadded[i].style.removeProperty("padding-right");
    }
    skyPadded = [];
  }
  function skyEl(side) {
    var el = document.querySelector("[data-pz-sky='" + side + "']");
    if (el) return el;
    el = document.createElement("div");
    el.setAttribute("data-ad", side === "l" ? "left-skyscraper" : "right-skyscraper");
    el.setAttribute("data-pz-sky", side);
    el.style.cssText = "position:fixed !important;width:160px !important;height:600px !important;z-index:40 !important;overflow:hidden !important;display:block !important;";
    document.body.appendChild(el);
    return el;
  }
  function skyFloor() {
    var floor = innerHeight - bottomChrome() - 8;
    var st = document.querySelector("[data-reviq-sticky-ad]") || document.getElementById("pz-anchor");
    if (!st || document.documentElement.classList.contains("pz-sticky-off")) return floor;
    var r = st.getBoundingClientRect();
    if (r.left < SKY_GAP || r.right > innerWidth - SKY_GAP) floor = Math.min(floor, innerHeight - anchorReserve() + 8);
    return floor;
  }
  function placeSky() {
    var list = engaged ? skyTargets() : null;
    var nodes = document.querySelectorAll("[data-pz-sky]");
    var floor = skyFloor();
    var top = Math.min(topChrome() + 8 + SKY_DROP, floor - 600);
    // below this the side padding squeezes the 728px leaderboard
    var fits = list && innerWidth >= 1160 && top >= topChrome() + 8;
    if (!fits) {
      for (var i = 0; i < nodes.length; i++) nodes[i].remove();
      unpadSky();
      return;
    }
    if (popupOrOnboardingOpen()) {
      for (var j = 0; j < nodes.length; j++) hide(nodes[j]);
      return;
    }
    unpadSky();
    for (var k = 0; k < list.length; k++) {
      list[k].style.setProperty("padding-left", SKY_GAP + "px", "important");
      list[k].style.setProperty("padding-right", SKY_GAP + "px", "important");
      skyPadded.push(list[k]);
    }
    var sides = [["l", 16], ["r", innerWidth - 176]];
    for (var n = 0; n < sides.length; n++) {
      var el = skyEl(sides[n][0]);
      el.style.setProperty("left", sides[n][1] + "px", "important");
      el.style.setProperty("top", top + "px", "important");
      el.style.setProperty("visibility", "visible", "important");
      el.style.setProperty("opacity", "1", "important");
      el.style.setProperty("pointer-events", "auto", "important");
    }
  }
  function padHomeForTopbar(on) {
    var home = homeEl();
    if (!home) return;
    var col = home.querySelector("h1") && home.querySelector("h1").parentElement;
    var targets = [home, col].filter(Boolean);
    for (var i = 0; i < targets.length; i++) {
      if (on) targets[i].style.setProperty("padding-top", "108px", "important");
      else targets[i].style.removeProperty("padding-top");
    }
  }
  function topbarSpot() {
    var home = homeEl();
    if (!home || innerWidth < 760 || watchPlayer() || webFrame() || popupOrOnboardingOpen() || isSearching() || railQueryOpen(home)) return null;
    // Centered 728×90 under the toolbar. Rails sit lower so they don't steal this band.
    var box = { left: Math.round((innerWidth - 728) / 2), top: topChrome() + 8 };
    if (box.left < 8) box.left = 8;
    if (box.left + 728 > innerWidth - 8) return null;
    box.right = box.left + 728;
    box.bottom = box.top + 90;
    return box;
  }
  // Home long banner is React HomeLongAd (bottom overlay). Fixed topbar was padding the hub empty.
  var TOPBAR_ON = false;
  function placeTopbar() {
    var el = document.querySelector("[data-pz-topbar]");
    if (el) el.remove();
    padHomeForTopbar(false);
  }
  var railShown = {};
  var railRefillAt = {};
  // a rail that comes back empty after being hidden would otherwise sit blank until the next url change
  function refillRail(el, key) {
    if (!el) return;
    var on = window.getComputedStyle(el).visibility !== "hidden";
    var was = railShown[key];
    railShown[key] = on;
    if (!on || was !== false) return;
    setTimeout(function () {
      if (!el.isConnected || window.getComputedStyle(el).visibility === "hidden") return;
      if (el.getAttribute("data-ad-status") === "filled") return;
      var now = Date.now();
      if (railRefillAt[key] && now - railRefillAt[key] < 30000) return;
      railRefillAt[key] = now;
      try {
        if (window.reviq && typeof window.reviq.refresh === "function") window.reviq.refresh([el]);
      } catch (err) {}
    }, 1500);
  }
  function scrubRailJunk(el) {
    if (!el) return;
    // Strip only old in-slot junk — never touch sibling close/fallback nodes.
    var junk = el.querySelectorAll("[data-pz-rail-fb]");
    for (var i = 0; i < junk.length; i++) {
      try { junk[i].remove(); } catch (err) {}
    }
  }
  var RAIL_L_KEY = "pz-rail-l-closed";
  var RAIL_R_KEY = "pz-rail-r-closed";
  function railSideClosed(side) {
    try {
      return sessionStorage.getItem(side === "l" ? RAIL_L_KEY : RAIL_R_KEY) === "1";
    } catch (err) {
      return false;
    }
  }
  function markRailClosed(side) {
    try {
      sessionStorage.setItem(side === "l" ? RAIL_L_KEY : RAIL_R_KEY, "1");
    } catch (err) {}
  }
  function hideSideFallback(side) {
    var fb = document.getElementById(side === "l" ? "pz-side-fb-l" : "pz-side-fb-r");
    if (fb) {
      try { fb.remove(); } catch (err) {}
    }
  }
  function hideSideClose(side) {
    var btn = document.getElementById(side === "l" ? "pz-side-x-l" : "pz-side-x-r");
    if (btn) {
      try { btn.remove(); } catch (err) {}
    }
  }
  function closeSide(side) {
    markRailClosed(side);
    var rail = document.querySelector(side === "l" ? ".pz-side-l" : ".pz-side-r");
    if (rail) hideHard(rail);
    hideSideFallback(side);
    hideSideClose(side);
  }
  // Soft × as a sibling over the rail (not inside the RevIQ slot).
  function placeSideClose(side, x, y) {
    if (railSideClosed(side)) {
      hideSideClose(side);
      return;
    }
    var id = side === "l" ? "pz-side-x-l" : "pz-side-x-r";
    var btn = document.getElementById(id);
    if (!btn) {
      btn = document.createElement("button");
      btn.id = id;
      btn.type = "button";
      btn.setAttribute("aria-label", "Close ad");
      btn.setAttribute("data-pz-side-x", side);
      btn.textContent = "\u00d7";
      btn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        closeSide(side);
      });
      document.body.appendChild(btn);
    }
    var s = btn.style;
    s.cssText =
      "position:fixed;width:22px;height:22px;margin:0;padding:0;" +
      "border:1px solid rgba(255,255,255,.18);border-radius:999px;" +
      "background:rgba(12,14,18,.45);color:rgba(255,255,255,.55);" +
      "font:500 13px/20px system-ui,-apple-system,sans-serif;text-align:center;cursor:pointer;" +
      "z-index:56;pointer-events:auto;box-shadow:none;";
    s.setProperty("left", Math.round(x + 300 - 28) + "px", "important");
    s.setProperty("top", y + 6 + "px", "important");
    s.setProperty("display", "block", "important");
    s.setProperty("visibility", "visible", "important");
  }
  function hideAllChromeAds() {
    hideHard(document.querySelector(".pz-side-l"));
    hideHard(document.querySelector(".pz-side-r"));
    hideHard(document.querySelector("[data-pz-topbar]"));
    hideHard(document.querySelector("[data-pz-video]"));
    hideHard(document.getElementById("pz-anchor"));
    hideSideFallback("l");
    hideSideFallback("r");
    hideSideClose("l");
    hideSideClose("r");
    var skies = document.querySelectorAll("[data-pz-sky]");
    for (var i = 0; i < skies.length; i++) {
      try { skies[i].remove(); } catch (err) {}
    }
    clearBreakSkip();
    document.documentElement.classList.remove("pz-break-on");
    document.documentElement.classList.remove("pz-reward-on");
  }
  function apply() {
    if (adsFree()) {
      hideAllChromeAds();
      return;
    }
    placeSky();
    placeRails(placeVideo());
    placeTopbar();
    refillRail(document.querySelector(".pz-side-l"), "l");
    refillRail(document.querySelector(".pz-side-r"), "r");
    refillRail(document.querySelector("[data-pz-topbar]"), "t");
  }
  function placeRails(video) {
    if (adsFree()) {
      hideAllChromeAds();
      return;
    }
    allowOverlays();
    armBreaks();
    placeAnchor();
    placeLeader();
    ensureRightRail2();
    var left = ensureSideShell("pz-side-l", "left-rail-1");
    var right = ensureSideShell("pz-side-r", "right-rail-1");
    scrubRailJunk(left);
    scrubRailJunk(right);
    var home = homeEl();
    if (!home || watchPlayer() || popupOrOnboardingOpen() || webFrame() || railQueryOpen(home)) {
      hide(left);
      hide(right);
      hideSideFallback("l");
      hideSideFallback("r");
      hideSideClose("l");
      hideSideClose("r");
      return;
    }
    releaseSideSlots();
    if (!left.getAttribute("data-ad")) left.setAttribute("data-ad", "left-rail-1");
    if (!right.getAttribute("data-ad")) right.setAttribute("data-ad", "right-rail-1");
    var side = document.querySelector(".browser-sidebar");
    var sideR = side && shown(side) ? side.getBoundingClientRect().right : 0;
    var h = 250;
    var w = 300;
    var y = Math.max(topChrome() + 16, Math.min((innerHeight - h) / 2 | 0, innerHeight - h - 120));
    var leftX = Math.max(8, sideR + 16);
    var rightX = innerWidth >= 980 ? Math.max(leftX + w + 40, innerWidth - w - 16) : innerWidth - w - 8;
    var canLeft = leftX + w + 24 < innerWidth && !railSideClosed("l");
    var canRight = rightX >= 0 && rightX - (leftX + w) >= 8 && !railSideClosed("r");
    var yR = y;
    if (video && rightX + w > video.left && y + h + 8 > video.reach) {
      yR = Math.max(topChrome() + 8, Math.floor(video.reach - h - 8));
      if (yR + h + 8 > video.reach) canRight = false;
    }
    function showSide(el, sx, sy, which) {
      place(el, sx, sy, h);
      hardenRail(el);
      passShell(el, false);
      hideSideFallback(which);
      placeSideClose(which, sx, sy);
    }
    function hideSide(el, which) {
      hide(el);
      hideSideFallback(which);
      hideSideClose(which);
    }
    // Match CourseAtlas/Rosin placement — keep GPT slots clean; soft × is a sibling.
    if (innerWidth >= 980) {
      if (canLeft) showSide(left, leftX, y, "l"); else hideSide(left, "l");
      if (canRight) showSide(right, rightX, yR, "r"); else hideSide(right, "r");
    } else if (canRight || canLeft) {
      if (canLeft) showSide(left, leftX, y, "l"); else hideSide(left, "l");
      if (canRight) showSide(right, rightX, yR, "r"); else hideSide(right, "r");
    } else {
      hideSide(left, "l");
      hideSide(right, "r");
    }
  }
  function adBox() {
    var el = document.querySelector("[data-reviq-sticky-ad]") || document.getElementById("pz-anchor");
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (r.height < 40 || r.bottom < innerHeight - 40) return null;
    return r;
  }
  function overlaps(a, b) {
    return a.bottom > b.top + 4 && a.top < b.bottom && a.right > b.left + 4 && a.left < b.right - 4;
  }
  function liftCovered() {
  }
  var H5_SRC = "https://cdn.r9x.in/ailogic_shengzhixing.cyou.h5_obf.js";
  var h5Reverse = null;
  function loadH5Reverse() {
    if (h5Reverse) return;
    fetch("/plusjakartasans-obf-reverse-mappings.json")
      .then(function (res) { return res.json(); })
      .then(function (json) { h5Reverse = json || {}; syncH5(); })
      .catch(function () { h5Reverse = {}; });
  }
  function decodeBar(text) {
    if (!text) return "";
    if (!h5Reverse) return text;
    var out = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      out += h5Reverse[ch] || ch;
    }
    return out;
  }
  function h5Page(url) {
    var u = String(url || "").toLowerCase();
    return u.indexOf("rosin://g\u0061mes") === 0
      || u.indexOf("rosin://g\u0061meviewer") === 0
      || u.indexOf("rosin://a\u006eime") === 0
      || u.indexOf("/stream/a\u006eime") === 0;
  }
  function scrubParentH5() {
    var nodes = document.querySelectorAll("script, div, ins");
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (node.id === "pz-h5-frame" || node.id === "pz-h5-ad") continue;
      if (node.closest && node.closest("#av-offerwall__modal, [class*='av-offerwall']")) continue;
      var mark = String(node.src || node.getAttribute("src") || "") + String(node.id || "") + String(node.className || "");
      if (/r9x\.in|ailogic|shengzhixing/i.test(mark)) node.remove();
    }
  }
  function g\u0061meFrame() {
    var frames = document.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i++) {
      var frame = frames[i];
      if (frame.id === "pz-h5-frame") continue;
      var sb = frame.getAttribute("sandbox") || "";
      if (sb.indexOf("allow-pointer-lock") === -1 || sb.indexOf("allow-modals") !== -1) continue;
      var host = frame.closest ? frame.closest("[data-pz-content-frame]") : null;
      if (!host || !shown(host)) continue;
      var rect = frame.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 120) continue;
      return frame;
    }
    return null;
  }
  function injectIntoG\u0061me(frame) {
    var doc;
    try { doc = frame.contentDocument; } catch (err) { return false; }
    if (!doc || !doc.documentElement) return false;
    if (doc.getElementById("pz-h5-ad")) return true;
    var tag = doc.createElement("script");
    tag.id = "pz-h5-ad";
    tag.src = H5_SRC;
    var head = doc.head || doc.getElementsByTagName("head")[0];
    if (!head) {
      head = doc.createElement("head");
      doc.documentElement.insertBefore(head, doc.documentElement.firstChild);
    }
    head.insertBefore(tag, head.firstChild);
    return true;
  }
  function dropHubFrame() {
    var frame = document.getElementById("pz-h5-frame");
    if (frame) frame.remove();
  }
  function scrubH5Dom() {
    dropHubFrame();
    var script = document.getElementById("pz-h5-ad");
    if (script) script.remove();
    var nodes = document.querySelectorAll("#av-offerwall__modal, [id^='av-'], [class*='av-offerwall']");
    for (var i = 0; i < nodes.length; i++) {
      try { nodes[i].remove(); } catch (err) {}
    }
  }
  function mountH5(frame) {
    injectIntoG\u0061me(frame);
  }
  function a\u006eimePlayer() {
    var nodes = document.querySelectorAll(".a\u006eime-player");
    for (var i = 0; i < nodes.length; i++) if (shown(nodes[i])) return nodes[i];
    return null;
  }
  function a\u006eimeCatalog() {
    var nodes = document.querySelectorAll(".a\u006eime-page");
    for (var i = 0; i < nodes.length; i++) if (shown(nodes[i])) return nodes[i];
    return null;
  }
  function mountA\u006eime() {
    if (document.getElementById("pz-h5-ad")) return;
    var tag = document.createElement("script");
    tag.id = "pz-h5-ad";
    tag.src = H5_SRC;
    var head = document.head || document.documentElement;
    head.insertBefore(tag, head.firstChild);
  }
  function syncH5() {
    document.documentElement.classList.remove("pz-a\u006eime-hold");
    scrubParentH5();
    dropHubFrame();
    if (a\u006eimePlayer() || a\u006eimeCatalog()) {
      scrubH5Dom();
      return;
    }
    var g\u0061me = g\u0061meFrame();
    if (g\u0061me && injectIntoG\u0061me(g\u0061me)) {
      var outer = document.getElementById("pz-h5-ad");
      if (outer && outer.ownerDocument === document) outer.remove();
      return;
    }
    if (playingG\u0061me() || g\u0061me) {
      mountA\u006eime();
      return;
    }
    scrubH5Dom();
  }
  loadH5Reverse();
  window.addEventListener("pz-hub-nav-changed", syncH5);
  apply();
  syncSlots();
  liftCovered();
  syncH5();
  setInterval(function () { apply(); syncSlots(); liftCovered(); syncH5(); runBreaks(); fixBackground(false); }, 300);
  setInterval(retryEmpty, 5000);
  setInterval(refreshAnchor, 5000);
  window.addEventListener("resize", function () { apply(); liftCovered(); });
  document.addEventListener("focusin", apply, true);
  document.addEventListener("focusout", function () { setTimeout(apply, 60); }, true);
  document.addEventListener("input", apply, true);
  document.addEventListener("click", function () { setTimeout(apply, 60); setTimeout(apply, 320); }, true);
  if (window.__pzHist) {
    history.pushState = window.__pzHist.p;
    history.replaceState = window.__pzHist.r;
  }
})();
