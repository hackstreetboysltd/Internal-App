import dns from "node:dns";
import net from "node:net";

// Prefer IPv4 and disable Happy Eyeballs dual-stack racing.
// On hosts with broken IPv6 (EACCES), autoSelectFamily aborts the IPv4
// attempt early → fetch ETIMEDOUT to oauth2.googleapis.com.
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}
