// src/security.ts
import { isIP } from "node:net";
import { promises as dnsPromises } from "node:dns";
const dnsLookup = async (hostname) => dnsPromises.lookup(hostname, { all: true });
/** True only for globally routable addresses (blocks RFC1918, loopback, link-local, CGNAT, multicast, ULA). */
function isPublicAddress(ip) {
    const v = isIP(ip);
    if (v === 4) {
        const [a, b] = ip.split(".").map(Number);
        if (a === 0 || a === 10 || a === 127)
            return false; // 0/8, 10/8, 127/8
        if (a === 100 && b >= 64 && b <= 127)
            return false; // 100.64/10 CGNAT
        if (a === 169 && b === 254)
            return false; // 169.254/16 link-local + cloud metadata
        if (a === 172 && b >= 16 && b <= 31)
            return false; // 172.16/12
        if (a === 192 && b === 0)
            return false; // 192.0.0/24 + TEST-NET-1
        if (a === 192 && b === 168)
            return false; // 192.168/16
        if (a === 198 && (b === 18 || b === 19))
            return false; // 198.18/15 benchmarking
        if (a >= 224)
            return false; // multicast + reserved
        return true;
    }
    if (v === 6) {
        const h = ip.toLowerCase();
        if (h === "::" || h === "::1")
            return false;
        if (h.startsWith("::ffff:"))
            return isPublicAddress(h.slice(7)); // IPv4-mapped
        if (h.startsWith("fc") || h.startsWith("fd"))
            return false; // fc00::/7 ULA
        if (/^fe[89ab]/.test(h))
            return false; // fe80::/10 link-local
        if (h.startsWith("ff"))
            return false; // multicast
        return true;
    }
    return false;
}
const deny = (reason) => ({ ok: false, reason });
/**
 * Policy for task metadata webhooks: http(s) only, no embedded credentials,
 * never a loopback/private/link-local/metadata address or internal hostname.
 * DNS resolution is required to succeed and must land on public addresses.
 */
export async function checkWebhookUrl(rawUrl, lookup = dnsLookup) {
    let u;
    try {
        u = new URL(rawUrl);
    }
    catch {
        return deny("not a valid URL");
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
        return deny(`only http/https webhook URLs are allowed, got "${u.protocol}"`);
    }
    if (u.username || u.password)
        return deny("credentials in the webhook URL are not allowed");
    const host = u.hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
    if (host === "localhost" ||
        host.endsWith(".localhost") ||
        host.endsWith(".local") ||
        host.endsWith(".internal") ||
        host.endsWith(".home.arpa") ||
        host === "metadata.google.internal" ||
        host === "") {
        return deny(`hostname "${host}" is not a public address`);
    }
    if (isIP(host)) {
        return isPublicAddress(host) ? { ok: true } : deny(`address ${host} is not a public address`);
    }
    let addrs;
    try {
        addrs = await lookup(host);
    }
    catch {
        return deny(`could not resolve hostname "${host}"`);
    }
    if (!addrs.length)
        return deny(`could not resolve hostname "${host}"`);
    for (const a of addrs) {
        if (!isPublicAddress(a.address)) {
            return deny(`hostname "${host}" resolves to non-public address ${a.address}`);
        }
    }
    return { ok: true };
}
//# sourceMappingURL=security.js.map