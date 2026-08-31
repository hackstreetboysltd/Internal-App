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

// Some Fedora/resolver setups return SERVFAIL for cloud APIs while public DNS works.
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
}
