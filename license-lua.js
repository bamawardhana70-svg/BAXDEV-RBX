// Pembuat kode Lua untuk halaman /license. Modul ES murni (tanpa DOM) supaya bisa diuji di Node.
// Sistem ini memakai ModuleScript + require(): TIDAK ada loadstring() dan TIDAK butuh LoadStringEnabled.

export const luaStr = (s) => '"' + String(s == null ? "" : s)
  .replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ") + '"';

const tabs = (src) => src.replace(/^( {4})+/gm, (m) => "\t".repeat(m.length / 4));

export const defaultModuleName = (name) =>
  (String(name || "").replace(/[^A-Za-z0-9_]+/g, "").slice(0, 40) || "ProductModule");

// ModuleScript "BaxdevLicense": mengirim Universe ID + Place ID ke server, membaca hasilnya.
export function buildModuleLua(lic, origin) {
  return tabs(`-- BAXDEV License Module
-- Jenis  : ModuleScript
-- Nama   : BaxdevLicense  (harus persis)
-- Lokasi : ServerScriptService
-- Tidak memakai loadstring(), jadi LoadStringEnabled tidak perlu diaktifkan.

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")

local LICENSE_KEY = ${luaStr(lic.key)}
local ENDPOINT = ${luaStr(origin + "/api/license/verify")}
local MAX_ATTEMPTS = 3

local BaxdevLicense = {}

local function result(ok, code, message, extra)
    local r = extra or {}
    r.ok = ok
    r.code = code
    r.message = message
    return r
end

function BaxdevLicense.Verify()
    if not RunService:IsServer() then
        return result(false, "SERVER_ONLY", "Modul lisensi harus dipanggil dari Script di ServerScriptService.")
    end

    local placeId = game.PlaceId
    local universeId = game.GameId
    if placeId == 0 then
        return result(false, "PLACE_NOT_PUBLISHED", "Place belum dipublish (Place ID 0). Publish dulu lewat File > Publish to Roblox.")
    end

    local nonce = HttpService:GenerateGUID(false)
    local payload = HttpService:JSONEncode({
        key = LICENSE_KEY,
        universeId = tostring(universeId),
        placeId = tostring(placeId),
        jobId = game.JobId,
        studio = RunService:IsStudio(),
        nonce = nonce,
        v = 2,
    })

    local lastError = "tidak diketahui"
    for attempt = 1, MAX_ATTEMPTS do
        local okRequest, response = pcall(function()
            return HttpService:RequestAsync({
                Url = ENDPOINT,
                Method = "POST",
                Headers = { ["Content-Type"] = "application/json" },
                Body = payload,
            })
        end)

        if not okRequest then
            local text = tostring(response)
            if string.find(string.lower(text), "not enabled", 1, true) then
                return result(false, "HTTP_DISABLED", "HTTP Requests belum aktif. Buka Game Settings > Security > Allow HTTP Requests, lalu publish.")
            end
            lastError = text
        else
            local data
            local okJson = pcall(function()
                data = HttpService:JSONDecode(response.Body)
            end)
            if okJson and type(data) == "table" and data.nonce == nonce then
                if data.ok == true then
                    return result(true, "OK", tostring(data.message or "Lisensi valid."), {
                        name = data.name,
                        expiresAt = data.expiresAt,
                        daysLeft = data.daysLeft,
                    })
                end
                if data.retryable ~= true then
                    return result(false, tostring(data.code or "DENIED"), tostring(data.message or "Lisensi ditolak."))
                end
                lastError = tostring(data.message or data.code)
            else
                lastError = "respons server tidak valid (HTTP " .. tostring(response.StatusCode) .. ")"
            end
        end

        if attempt < MAX_ATTEMPTS then
            task.wait(2 * attempt)
        end
    end

    return result(false, "NETWORK", "Server lisensi tidak bisa dihubungi: " .. lastError, { retryable = true })
end

return BaxdevLicense
`);
}

// Script "BaxdevLoader": cek lisensi lewat modul, lalu require() ModuleScript produk.
export function buildLoaderLua(lic) {
  const asset = /^[0-9]{1,20}$/.test(String(lic.assetId || ""));
  const mod = lic.module || defaultModuleName(lic.name);
  const product = asset
    ? `-- Produk dimuat lewat require(<Asset ID>): ModuleScript yang sudah dipublish ke Roblox.
local PRODUCT_ASSET_ID = ${lic.assetId}

local okProduct, errProduct = pcall(require, PRODUCT_ASSET_ID)
if not okProduct then
    warn("[BAXDEV] Gagal require() produk: " .. tostring(errProduct))
end`
    : `-- Produk dimuat lewat require(<ModuleScript>): ModuleScript produk ada di ServerScriptService.
local PRODUCT_MODULE_NAME = ${luaStr(mod)}

local productModule = ServerScriptService:FindFirstChild(PRODUCT_MODULE_NAME)
if not (productModule and productModule:IsA("ModuleScript")) then
    warn("[BAXDEV] ModuleScript produk '" .. PRODUCT_MODULE_NAME .. "' tidak ditemukan di ServerScriptService.")
    return
end

local okProduct, errProduct = pcall(require, productModule)
if not okProduct then
    warn("[BAXDEV] ModuleScript produk error: " .. tostring(errProduct))
end`;
  return tabs(`-- BAXDEV Loader
-- Jenis  : Script (bukan LocalScript, bukan ModuleScript)
-- Nama   : BaxdevLoader
-- Lokasi : ServerScriptService

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ServerScriptService = game:GetService("ServerScriptService")

-- true = kick semua pemain kalau lisensi ditolak (tidak berlaku di Studio, dan tidak untuk error jaringan).
local KICK_ON_DENIED = false

local licenseModule = ServerScriptService:WaitForChild("BaxdevLicense", 10)
if not licenseModule then
    warn("[BAXDEV] ModuleScript 'BaxdevLicense' tidak ditemukan di ServerScriptService.")
    return
end

local BaxdevLicense = require(licenseModule)
local license = BaxdevLicense.Verify()

if not license.ok then
    warn(string.format("[BAXDEV] Lisensi ditolak [%s]: %s", tostring(license.code), tostring(license.message)))
    if KICK_ON_DENIED and not license.retryable and not RunService:IsStudio() then
        local function kick(player)
            player:Kick("Lisensi script tidak valid. Hubungi pemilik game.")
        end
        for _, player in ipairs(Players:GetPlayers()) do
            kick(player)
        end
        Players.PlayerAdded:Connect(kick)
    end
    return
end

if license.daysLeft then
    print(string.format("[BAXDEV] Lisensi valid (%d hari lagi).", license.daysLeft))
else
    print("[BAXDEV] Lisensi valid (permanen).")
end

${product}
`);
}

/* ───────── Obfuscator untuk ModuleScript BaxdevLicense ─────────
   Deterministik per key (seed dari key), jadi hasil Copy Code selalu sama untuk lisensi yang sama.
   Yang dilakukan: komentar + indentasi dibuang, nama variabel lokal diacak, SEMUA string (key, URL, pesan) dienkode
   (XOR + escape desimal, didekode saat jalan lewat bit32), token dijejer satu baris panjang.
   Bukan enkripsi: tujuannya menyulitkan pembeli menemukan dan mengedit pengecekan, bukan menahan reverse engineering serius. */

const LUA_KW = new Set(["and","break","do","else","elseif","end","false","for","function","if","in","local","nil","not","or","repeat","return","then","true","until","while","continue"]);

export function luaLex(src) {
  const out = []; let i = 0; const n = src.length;
  const OPS3 = ["..."], OPS2 = ["==", "~=", "<=", ">=", "..", "::"];
  while (i < n) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "-" && src[i + 1] === "-") {
      let j = i + 2, eq = "";
      if (src[j] === "[") { let k = j + 1; while (src[k] === "=") { eq += "="; k++; } if (src[k] === "[") { const e = "]" + eq + "]", p = src.indexOf(e, k + 1); i = p < 0 ? n : p + e.length; continue; } }
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, v = "";
      while (j < n && src[j] !== c) {
        if (src[j] === "\\") { const d = src[j + 1]; v += d === "n" ? "\n" : d === "t" ? "\t" : d === "r" ? "\r" : d; j += 2; } else v += src[j++];
      }
      if (j >= n) throw new Error("string Lua tidak tertutup");
      out.push({ t: "str", v }); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) { let j = i + 1; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++; const w = src.slice(i, j); out.push({ t: LUA_KW.has(w) ? "kw" : "id", v: w }); i = j; continue; }
    if (/[0-9]/.test(c)) { let j = i + 1; while (j < n && /[0-9.]/.test(src[j]) && !(src[j] === "." && src[j + 1] === ".")) j++; out.push({ t: "num", v: src.slice(i, j) }); i = j; continue; }
    const o3 = src.slice(i, i + 3), o2 = src.slice(i, i + 2);
    if (OPS3.includes(o3)) { out.push({ t: "op", v: o3 }); i += 3; continue; }
    if (OPS2.includes(o2)) { out.push({ t: "op", v: o2 }); i += 2; continue; }
    out.push({ t: "op", v: c }); i++;
  }
  return out;
}

function prng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Nama lokal yang dideklarasikan di template modul. Field tabel ("nonce = ...", "placeId = ...") dan akses ".x" / ":x" tidak ikut diganti.
const MODULE_LOCALS = ["HttpService", "RunService", "LICENSE_KEY", "ENDPOINT", "MAX_ATTEMPTS", "BaxdevLicense", "result", "r", "ok", "code", "message", "extra",
  "placeId", "universeId", "nonce", "payload", "lastError", "attempt", "okRequest", "response", "text", "data", "okJson"];

export function obfuscateLua(src, seedStr, locals) {
  const rnd = prng(String(seedStr || "baxdev"));
  const used = new Set();
  const mk = () => {
    for (;;) {
      const L = "IlO0o";   // huruf yang mirip satu sama lain
      let s = "_" + "IlOo"[Math.floor(rnd() * 4)];
      const len = 5 + Math.floor(rnd() * 4);
      for (let i = 0; i < len; i++) s += L[Math.floor(rnd() * L.length)];
      if (!used.has(s) && !LUA_KW.has(s)) { used.add(s); return s; }
    }
  };
  const map = {}; (locals || MODULE_LOCALS).forEach((x) => (map[x] = mk()));
  const K = 1 + Math.floor(rnd() * 126);
  const nD = mk(), nK = mk(), nS = mk(), nT = mk(), nI = mk();
  const toks = luaLex(src), stack = [], out = [];
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i], prev = toks[i - 1], next = toks[i + 1];
    if (tk.t === "op") {
      if (tk.v === "{" || tk.v === "(" || tk.v === "[") stack.push(tk.v);
      else if (tk.v === "}" || tk.v === ")" || tk.v === "]") stack.pop();
      out.push(tk.v); continue;
    }
    if (tk.t === "id" && map[tk.v]) {
      const afterAccess = prev && prev.t === "op" && (prev.v === "." || prev.v === ":");
      const isKey = stack[stack.length - 1] === "{" && prev && prev.t === "op" && (prev.v === "{" || prev.v === ",") && next && next.t === "op" && next.v === "=";
      out.push(afterAccess || isKey ? tk.v : map[tk.v]); continue;
    }
    if (tk.t === "str") {
      if (!tk.v) { out.push('""'); continue; }
      const bytes = new TextEncoder().encode(tk.v);
      out.push(nD + '("' + Array.from(bytes, (b) => "\\" + String(b ^ K).padStart(3, "0")).join("") + '")'); continue;
    }
    out.push(tk.v);
  }
  // baris dibungkus di batas token (aman: Lua tidak peduli newline antar token)
  let body = "", line = "";
  for (const t of out) { if (line.length + t.length > 110) { body += line + "\n"; line = ""; } line += (line ? " " : "") + t; }
  body += line;
  const prefix = `local ${nK} = ${K}\nlocal ${nD} = function(${nS}) local ${nT} = {} for ${nI} = 1, #${nS} do ${nT}[${nI}] = string.char(bit32.bxor(string.byte(${nS}, ${nI}), ${nK})) end return table.concat(${nT}) end\n`;
  return { code: prefix + body, map, K, decoder: nD };
}

// ModuleScript yang dibagikan ke pembeli: versi obfuscated (default). Versi terbaca tetap tersedia untuk admin (dukungan).
export function buildModuleLuaObf(lic, origin) {
  const o = obfuscateLua(buildModuleLua(lic, origin), lic.key);
  return "-- BAXDEV License Module (obfuscated)\n-- Jenis  : ModuleScript\n-- Nama   : BaxdevLicense  (harus persis)\n-- Lokasi : ServerScriptService\n-- Jangan diedit. Tidak memakai loadstring().\n\n" + o.code + "\n";
}
