/* Ad recovery / anti-adblock loader (publisher tag). Self-host safe: when not
 * served from cdn./static., routes through highperformanceformat.com. */
var IPv4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/,
  normalizeHost = function (e) {
    if ("string" != typeof e) return "";
    var t = e.trim().toLowerCase();
    for (; t.endsWith("."); ) t = t.slice(0, -1);
    return t;
  },
  isIpHost = function (e) {
    return !(
      !e ||
      (!IPv4_RE.test(e) &&
        (!e.startsWith("[") || !e.endsWith("]")) &&
        (!e.includes(":") || e.includes(".")))
    );
  },
  hostMatchesAllowlist = function (e, t) {
    e = normalizeHost(e);
    t = normalizeHost(t);
    return !(!e || !t || isIpHost(e)) && (e === t || e.endsWith("." + t));
  };
"undefined" != typeof document &&
  (function () {
    var u = [],
      f = ["66a79344e6255e249e7c6e8c"],
      g = "1",
      w = "2",
      y = "3",
      NETWORK_FALLBACK = "highperformanceformat.com";
    var b = function (e, t) {
        var s = document.createElement("script");
        s.src = e;
        s.dataset.adscript = !0;
        s.setAttribute("async", "");
        t.parentNode.insertBefore(s, t.nextSibling);
      },
      v = function () {
        return !!document.getElementById(atob("cHJvZmVzc29yX3ByZWJpZC1yb290"));
      },
      n = function (i, r, l, c, m, p) {
        var h = document.createElement("div");
        h.className = "adsbygoogle google-ads";
        h.style =
          "display:block;width:1px;height:1px;position:absolute;left:-9999px";
        c.dataset.moa_id = r;
        c.dataset.adscript = r;
        document.body.appendChild(h);
        setTimeout(function () {
          var e = 0 === h.offsetHeight || 0 === h.offsetWidth,
            t = (document.body.removeChild(h), new URL(l));
          var s = t.hostname;
          var o = u.some(function (e) {
              return hostMatchesAllowlist(s, e);
            }),
            a = f.includes(r),
            d = p.get("w"),
            n = p.get("h");
          o || a
            ? ((o = m.endsWith("/o.js")
                ? "/o.js"
                : m.endsWith("/p.js")
                  ? "/p.js"
                  : ""),
              b("https://pub." + i + o + "?" + p.toString(), c))
            : ((a =
                "https://main." +
                i +
                "/run.js?uid=" +
                r +
                "&oab=" +
                (e ? "1" : "0") +
                "&ref=" +
                encodeURIComponent(l) +
                (d && n ? "&w=" + d + "&h=" + n : "")),
              (o = v()),
              (e =
                "true" ===
                (
                  t.searchParams.getAll(atob("cGJqc19kZWJ1Zw==")).pop() || ""
                ).toLowerCase()),
              (d = o && e ? y : o ? g : e ? w : ""),
              b(a + (d ? "&s=" + d : ""), c));
        }, 100);
      };
    var e,
      i,
      r = document.currentScript;
    if (r) {
      var t = new URL(r.src, location.href),
        s =
          ((e = t),
          2 < (i = e.pathname.split("/")).length &&
            e.searchParams.append("uid", i[1]),
          e.searchParams),
        o = s.get("uid") || "66a79344e6255e249e7c6e8c",
        a = window.location.href,
        d = (i = t.hostname).startsWith("cdn.")
          ? i.replace("cdn.", "")
          : i.startsWith("static.")
            ? i.replace("static.", "")
            : NETWORK_FALLBACK;
      r.parentNode === document.head
        ? ((e = function () {
            var e = document.querySelector("[data-moa_id]");
            e && "5a1f69e5ccdad7794d13a92f" !== o
              ? n(d, o, a, e, t.pathname, s)
              : ((e = document.createElement("div")),
                document.body.appendChild(e),
                n(d, o, a, e, t.pathname.indexOf("/o.js") >= 0 ? t.pathname : t.pathname + (t.pathname.endsWith("/") ? "" : "/") + "o.js", s));
          }),
          "loading" === document.readyState
            ? window.addEventListener("DOMContentLoaded", e)
            : e())
        : n(
            d,
            o,
            a,
            r,
            t.pathname.indexOf("/o.js") >= 0 || t.pathname.indexOf("/p.js") >= 0
              ? t.pathname
              : "/o.js",
            s
          );
    }
  })();
"undefined" != typeof module &&
  module.exports &&
  (module.exports = {
    hostMatchesAllowlist: hostMatchesAllowlist,
    normalizeHost: normalizeHost,
    isIpHost: isIpHost,
  });
